import type { Metadata } from "next";
import { adminDb, requireStaff } from "@/lib/admin/auth";
import { AdminInputError, must, readFlash, runAdminAction } from "@/lib/admin/action";
import { FEE_STATUS_LABELS, describeFee, feeStatuses, parseFeeVersion, workedExample, type FeeRow } from "@/lib/admin/fees";
import { text, uuid } from "@/lib/admin/validation";
import { formatPrice } from "@/lib/format";
import { AdminTitle, Badge, Flash, ReturnTo, SubmitButton, Table, dateTime } from "@/components/admin/ui";
import { TimezoneField } from "@/components/admin/TimezoneField";

export const metadata: Metadata = { title: "Fees" };

async function createFeeVersion(form: FormData) {
  "use server";
  return runAdminAction(["admin"], form, "/admin/fees", async (staff, db) => {
    const parsed = parseFeeVersion(Object.fromEntries([...form.entries()].map(([k, v]) => [k, String(v)])));
    if (!parsed.ok) throw new AdminInputError(Object.values(parsed.errors).join(" "));
    const v = parsed.value;
    must(
      await db.rpc("admin_create_fee_version", {
        p_actor: staff.user.id,
        p_fee_name: v.feeName,
        p_fee_type: v.feeType,
        p_fee_value: v.feeValue,
        p_description: v.description,
        p_effective_from: v.effectiveFrom?.toISOString() ?? null,
      })
    );
    const amount = describeFee({ fee_type: v.feeType, fee_value: v.feeValue });
    return v.effectiveFrom ? `New ${v.feeName} version (${amount}) scheduled for ${v.effectiveFrom.toUTCString()}.` : `New ${v.feeName} version (${amount}) is now in force.`;
  });
}

async function cancelFeeVersion(form: FormData) {
  "use server";
  return runAdminAction(["admin"], form, "/admin/fees", async (staff, db) => {
    const id = text(form, "feeId");
    if (!uuid.safeParse(id).success) throw new AdminInputError("Unknown fee version.");
    must(await db.rpc("admin_cancel_fee_version", { p_actor: staff.user.id, p_fee: id }));
    return "Scheduled version cancelled.";
  });
}

export default async function FeesPage({ searchParams }: PageProps<"/admin/fees">) {
  await requireStaff(["admin"], "/admin/fees");
  const sp = await searchParams;
  const { data } = await adminDb().from("fee_configuration").select("*").order("fee_name").order("effective_from", { ascending: false });
  const rows = ((data ?? []) as FeeRow[]).map((r) => ({ ...r, fee_value: Number(r.fee_value) }));
  const now = new Date();
  const statuses = feeStatuses(rows, now);
  const names = [...new Set(rows.map((r) => r.fee_name))];
  const commission = rows.find((r) => r.fee_name === "seller_commission" && statuses.get(r.id) === "in_force");
  const example = commission ? workedExample(commission) : null;

  return (
    <>
      <AdminTitle
        title="Fees"
        intro="Fees are versioned. Past versions are never edited: a change is a new version that starts now or later. Every order keeps a copy of the fees in force when it was placed."
      />
      <Flash flash={readFlash(sp)} />

      {commission && example && (
        <section className="card grid gap-2 p-4">
          <h2 className="font-semibold">Worked example: a $200 sale at today&apos;s commission ({describeFee(commission)})</h2>
          <dl className="grid max-w-md grid-cols-[1fr_auto] gap-x-6 gap-y-1 text-sm">
            <dt>Item price</dt>
            <dd className="text-right font-mono">{formatPrice(example.itemPriceCents)}</dd>
            <dt>Marketplace commission</dt>
            <dd className="text-right font-mono">−{formatPrice(example.commissionCents)}</dd>
            <dt className="font-semibold">Seller receives before payment processing</dt>
            <dd className="text-right font-mono font-semibold">{formatPrice(example.sellerBeforeProcessingCents)}</dd>
          </dl>
          <p className="text-xs text-ink-soft">Shipping and tax are never included in the commission. Stripe&apos;s processing cost is recorded from the actual payment.</p>
        </section>
      )}

      <section className="card grid gap-3 p-4">
        <h2 className="font-semibold">Create a new fee version</h2>
        <form action={createFeeVersion} className="grid gap-3 md:grid-cols-3">
          <ReturnTo path="/admin/fees" />
          <TimezoneField />
          <label className="field text-sm">
            <span>Fee</span>
            <input name="fee_name" list="fee-names" required defaultValue="seller_commission" className="input font-mono" />
            <datalist id="fee-names">
              {names.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
          </label>
          <label className="field text-sm">
            <span>Type</span>
            <select name="fee_type" defaultValue="percentage" className="input">
              <option value="percentage">Percentage of item price</option>
              <option value="fixed_cents">Fixed amount ($)</option>
            </select>
          </label>
          <label className="field text-sm">
            <span>Value (percent, or dollars for fixed)</span>
            <input name="fee_value" required inputMode="decimal" className="input" />
          </label>
          <label className="field text-sm">
            <span>Starts (blank for now)</span>
            <input name="effective_from" type="datetime-local" className="input" />
          </label>
          <label className="field text-sm md:col-span-2">
            <span>Description</span>
            <input name="description" maxLength={300} className="input" />
          </label>
          <p className="text-xs text-ink-soft md:col-span-3">
            When a version starts now, the one it replaces is retired. A scheduled version takes over at its start time; until then today&apos;s fee stays in force.
          </p>
          <p>
            <SubmitButton>Create version</SubmitButton>
          </p>
        </form>
      </section>

      <section className="grid gap-2">
        <h2 className="font-semibold">Fee history</h2>
        <Table label="Fee history">
          <thead>
            <tr>
              <th>Fee</th>
              <th>Amount</th>
              <th>Starts</th>
              <th>Status</th>
              <th>Description</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const status = statuses.get(r.id)!;
              return (
                <tr key={r.id} data-fee={r.id}>
                  <td className="font-mono">{r.fee_name}</td>
                  <td className="font-mono">{describeFee(r)}</td>
                  <td className="whitespace-nowrap">{dateTime(r.effective_from)}</td>
                  <td>
                    <Badge tone={status === "in_force" ? "good" : status === "scheduled" ? "warn" : "neutral"}>{FEE_STATUS_LABELS[status]}</Badge>
                  </td>
                  <td className="text-xs">{r.description}</td>
                  <td>
                    {status === "scheduled" && (
                      <form action={cancelFeeVersion}>
                        <ReturnTo path="/admin/fees" />
                        <input type="hidden" name="feeId" value={r.id} />
                        <SubmitButton tone="outline">Cancel</SubmitButton>
                      </form>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </section>
    </>
  );
}
