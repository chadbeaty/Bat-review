"use server";

import { redirect } from "next/navigation";
import { withFlash } from "@/lib/admin/action";
import { getCurrentUser } from "@/lib/supabase/server";
import { paymentsDeps } from "@/lib/payments/server";
import { createOnboardingLink, ensureConnectedAccount, expressDashboardLink, syncConnectedAccount } from "@/lib/payments/connect";

const PATH = "/seller/payouts";

async function seller() {
  const user = await getCurrentUser();
  if (!user) redirect(`/sign-in?next=${PATH}`);
  return user;
}

/** Creates the seller's Stripe Express account if needed, then sends them to Stripe's hosted onboarding. */
export async function startOnboarding() {
  const user = await seller();
  const deps = paymentsDeps();
  if (!deps) redirect(withFlash(PATH, "error", "Payouts aren't connected yet."));
  let target: string;
  try {
    const account = await ensureConnectedAccount(deps, { id: user.id, email: user.email ?? null });
    target = await createOnboardingLink(deps, account.stripe_connected_account_id);
  } catch (err) {
    console.error("onboarding failed", err instanceof Error ? err.message : err);
    target = withFlash(PATH, "error", "Stripe couldn't start payout setup. Try again in a minute.");
  }
  redirect(target);
}

/** Re-reads the account from Stripe (also done automatically by the account.updated webhook). */
export async function refreshStatus() {
  const user = await seller();
  const deps = paymentsDeps();
  if (!deps) redirect(PATH);
  const { data } = await deps.db.from("seller_payment_accounts").select("stripe_connected_account_id").eq("seller_id", user.id).maybeSingle();
  if (!data) redirect(PATH);
  let target = withFlash(PATH, "notice", "Status updated from Stripe.");
  try {
    await syncConnectedAccount(deps, data.stripe_connected_account_id);
  } catch {
    target = withFlash(PATH, "error", "Couldn't reach Stripe. Try again in a minute.");
  }
  redirect(target);
}

/** Opens the seller's Stripe Express dashboard (bank details, payout history). */
export async function openDashboard() {
  const user = await seller();
  const deps = paymentsDeps();
  if (!deps) redirect(PATH);
  const { data } = await deps.db.from("seller_payment_accounts").select("stripe_connected_account_id").eq("seller_id", user.id).maybeSingle();
  if (!data) redirect(PATH);
  let target: string;
  try {
    target = await expressDashboardLink(deps, data.stripe_connected_account_id);
  } catch {
    target = withFlash(PATH, "error", "Stripe's dashboard opens once setup is finished.");
  }
  redirect(target);
}
