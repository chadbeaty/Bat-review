import type { Metadata } from "next";
import { adminDb, requireStaff } from "@/lib/admin/auth";
import { AdminInputError, must, readFlash, runAdminAction } from "@/lib/admin/action";
import { SETTING_RULES, parseSetting, settingRule } from "@/lib/admin/settings-rules";
import { text } from "@/lib/admin/validation";
import { AdminTitle, Flash, ReturnTo, SubmitButton, dateTime } from "@/components/admin/ui";

export const metadata: Metadata = { title: "Settings" };

async function updateSetting(form: FormData) {
  "use server";
  return runAdminAction(["admin"], form, "/admin/settings", async (staff, db) => {
    const key = text(form, "key");
    const rule = settingRule(key);
    if (!rule) throw new AdminInputError("That setting can't be edited here.");
    const { data: current } = await db.from("site_settings").select("key, value").in("key", ["price_guide_min_sales", "price_guide_full_sales"]);
    const others = Object.fromEntries((current ?? []).map((r) => [r.key, r.value]));
    const parsed = parseSetting(key, text(form, "value"), others);
    if (!parsed.ok) throw new AdminInputError(`${rule.label}: ${parsed.error}`);
    must(await db.rpc("admin_update_setting", { p_actor: staff.user.id, p_key: key, p_value: parsed.value }));
    return `${rule.label}: saved.`;
  });
}

export default async function SettingsPage({ searchParams }: PageProps<"/admin/settings">) {
  await requireStaff(["admin"], "/admin/settings");
  const sp = await searchParams;
  const { data } = await adminDb().from("site_settings").select("key, value, description, is_public, updated_at");
  const byKey = new Map((data ?? []).map((r) => [r.key, r]));

  return (
    <>
      <AdminTitle title="Settings" intro="Marketplace rules that live in the database. Changes take effect straight away and are recorded in the audit log." />
      <Flash flash={readFlash(sp)} />
      <ul className="grid gap-3">
        {SETTING_RULES.map((rule) => {
          const row = byKey.get(rule.key);
          return (
            <li key={rule.key} className="card p-4">
              <form action={updateSetting} className="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto] md:items-end" aria-label={rule.label}>
                <ReturnTo path="/admin/settings" />
                <input type="hidden" name="key" value={rule.key} />
                <div className="grid gap-1">
                  <label htmlFor={`s-${rule.key}`} className="font-medium">
                    {rule.label}
                  </label>
                  <p className="text-xs text-ink-soft">
                    {row?.description ?? "Not set yet."} <span className="font-mono">{rule.key}</span>
                    {row ? ` · updated ${dateTime(row.updated_at)}` : ""}
                    {row && !row.is_public ? " · not shown publicly" : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {rule.kind === "boolean" ? (
                    <select id={`s-${rule.key}`} name="value" defaultValue={String(row?.value ?? false)} className="input w-28">
                      <option value="true">On</option>
                      <option value="false">Off</option>
                    </select>
                  ) : (
                    <>
                      <input id={`s-${rule.key}`} name="value" inputMode="numeric" defaultValue={String(row?.value ?? "")} className="input w-28 font-mono" />
                      <span className="text-sm text-ink-soft">{rule.unit}</span>
                    </>
                  )}
                  <SubmitButton tone="outline">Save</SubmitButton>
                </div>
              </form>
            </li>
          );
        })}
      </ul>
    </>
  );
}
