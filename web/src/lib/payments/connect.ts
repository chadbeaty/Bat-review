// Seller payouts through Stripe Connect Express accounts: Stripe hosts onboarding (identity, bank details) and
// the seller's dashboard. We keep only the account id and its status.

import type Stripe from "stripe";
import { PaymentsError, must, type Deps } from "./deps";

export type AccountStatus = {
  onboarding_status: "not_started" | "in_progress" | "complete" | "restricted" | "rejected";
  charges_enabled: boolean;
  payouts_enabled: boolean;
  requirements_due: string[];
};

/** Maps a Stripe account to the status we store. "complete" needs details submitted, payouts and transfers on. */
export function accountStatusFromStripe(a: Pick<Stripe.Account, "details_submitted" | "charges_enabled" | "payouts_enabled" | "requirements" | "capabilities">): AccountStatus {
  const req = a.requirements;
  const due = [...new Set([...(req?.past_due ?? []), ...(req?.currently_due ?? [])])];
  const disabled = req?.disabled_reason ?? null;
  const transfers = a.capabilities?.transfers;
  let onboarding_status: AccountStatus["onboarding_status"];
  if (disabled?.startsWith("rejected")) onboarding_status = "rejected";
  else if (a.details_submitted && a.payouts_enabled && transfers === "active") onboarding_status = "complete";
  else if (a.details_submitted && disabled && disabled !== "requirements.pending_verification") onboarding_status = "restricted";
  else onboarding_status = "in_progress";
  return { onboarding_status, charges_enabled: Boolean(a.charges_enabled), payouts_enabled: Boolean(a.payouts_enabled), requirements_due: due };
}

export type PaymentAccountRow = {
  seller_id: string;
  stripe_connected_account_id: string;
  onboarding_status: AccountStatus["onboarding_status"];
  charges_enabled: boolean;
  payouts_enabled: boolean;
  requirements_due: string[];
  updated_at: string;
};

/** The seller's connected account, creating an Express account (transfers capability) the first time. */
export async function ensureConnectedAccount(deps: Pick<Deps, "db" | "stripe">, seller: { id: string; email: string | null }): Promise<PaymentAccountRow> {
  const { db, stripe } = deps;
  const existing = must(await db.from("seller_payment_accounts").select("*").eq("seller_id", seller.id).maybeSingle<PaymentAccountRow>());
  if (existing) return existing;
  const account = await stripe.accounts.create(
    {
      type: "express",
      country: "US",
      ...(seller.email ? { email: seller.email } : {}),
      capabilities: { transfers: { requested: true } },
      business_type: "individual",
      metadata: { user_id: seller.id },
      settings: { payouts: { schedule: { interval: "daily" } } },
    },
    // One account per member even if they double-click.
    { idempotencyKey: `connect-account-${seller.id}` }
  );
  const status = accountStatusFromStripe(account);
  const { data, error } = await db
    .from("seller_payment_accounts")
    .insert({ seller_id: seller.id, stripe_connected_account_id: account.id, ...status })
    .select("*")
    .single<PaymentAccountRow>();
  if (error) {
    const again = must(await db.from("seller_payment_accounts").select("*").eq("seller_id", seller.id).maybeSingle<PaymentAccountRow>());
    if (again) return again;
    throw new PaymentsError(error.message, "account_save_failed");
  }
  return data;
}

/** A one-time Stripe-hosted onboarding link. Links expire after a few minutes; the refresh URL makes a new one. */
export async function createOnboardingLink(deps: Pick<Deps, "stripe" | "siteUrl">, accountId: string): Promise<string> {
  const base = deps.siteUrl.replace(/\/$/, "");
  const link = await deps.stripe.accountLinks.create({
    account: accountId,
    refresh_url: `${base}/seller/payouts?onboarding=refresh`,
    return_url: `${base}/seller/payouts?onboarding=return`,
    type: "account_onboarding",
  });
  return link.url;
}

/** Reads the account from Stripe and stores its status (the account.updated webhook does the same). */
export async function syncConnectedAccount(deps: Pick<Deps, "db" | "stripe">, accountId: string): Promise<AccountStatus> {
  const account = await deps.stripe.accounts.retrieve(accountId);
  const status = accountStatusFromStripe(account);
  must(await deps.db.from("seller_payment_accounts").update(status).eq("stripe_connected_account_id", accountId));
  return status;
}

/** A link into the seller's Stripe Express dashboard (bank details, payout history). */
export async function expressDashboardLink(deps: Pick<Deps, "stripe">, accountId: string): Promise<string> {
  const link = await deps.stripe.accounts.createLoginLink(accountId);
  return link.url;
}
