import type { Metadata } from "next";
import Link from "next/link";
import { adminDb, requireStaff, type Staff } from "@/lib/admin/auth";
import { AdminInputError, must, readFlash, runAdminAction } from "@/lib/admin/action";
import { optional, parseHttpsUrl, text, uuid } from "@/lib/admin/validation";
import { formatPrice } from "@/lib/format";
import { AdminTitle, Badge, Empty, Flash, ReturnTo, SubmitButton, Table, param } from "@/components/admin/ui";

export const metadata: Metadata = { title: "Advertising" };

const PLACEMENTS = [
  { value: "homepage_partner", label: "Homepage partners" },
  { value: "category_sponsor", label: "Category sponsor" },
  { value: "search_sponsored", label: "Sponsored in search" },
  { value: "newsletter", label: "Newsletter" },
];

type Campaign = {
  id: string;
  advertiser_name: string;
  campaign_name: string;
  placement: string;
  target_category: string | null;
  image_url: string | null;
  destination_url: string | null;
  start_date: string;
  end_date: string;
  price_cents: number;
  paid: boolean;
  active: boolean;
};

function readCampaign(form: FormData) {
  const advertiser = text(form, "advertiser_name", 120);
  const campaign = text(form, "campaign_name", 120);
  if (advertiser.length < 2 || campaign.length < 2) throw new AdminInputError("Enter the advertiser and campaign names.");
  const placement = text(form, "placement");
  if (!PLACEMENTS.some((p) => p.value === placement)) throw new AdminInputError("Choose a placement.");
  const destination = optional(form, "destination_url");
  const image = optional(form, "image_url");
  if (destination && !parseHttpsUrl(destination)) throw new AdminInputError("The destination link must start with https://.");
  if (image && !parseHttpsUrl(image)) throw new AdminInputError("The image link must start with https://.");
  const start = text(form, "start_date");
  const end = text(form, "end_date");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) throw new AdminInputError("Choose start and end dates.");
  if (end < start) throw new AdminInputError("The end date must be on or after the start date.");
  const price = text(form, "price");
  if (!/^\d+(\.\d{1,2})?$/.test(price)) throw new AdminInputError("Enter the price in dollars, like 250 or 99.50.");
  const category = text(form, "target_category");
  return {
    advertiser_name: advertiser,
    campaign_name: campaign,
    placement,
    target_category: uuid.safeParse(category).success ? category : null,
    destination_url: destination ? parseHttpsUrl(destination) : null,
    image_url: image ? parseHttpsUrl(image) : null,
    start_date: start,
    end_date: end,
    price_cents: Math.round(Number(price) * 100),
    paid: form.get("paid") === "on",
    active: form.get("active") === "on",
  };
}

async function log(db: ReturnType<typeof adminDb>, staff: Staff, action: string, id: string, metadata: Record<string, unknown>) {
  must(await db.rpc("admin_log", { p_actor: staff.user.id, p_action: action, p_entity_type: "advertising_campaign", p_entity_id: id, p_metadata: metadata }));
}

async function saveCampaign(form: FormData) {
  "use server";
  return runAdminAction(["admin"], form, "/admin/ads", async (staff, db) => {
    const row = readCampaign(form);
    const existing = text(form, "campaignId");
    if (existing) {
      if (!uuid.safeParse(existing).success) throw new AdminInputError("Unknown campaign.");
      must(await db.from("advertising_campaigns").update(row).eq("id", existing));
      await log(db, staff, "ad.updated", existing, row);
      return `Saved “${row.campaign_name}”.`;
    }
    const created = must(await db.from("advertising_campaigns").insert(row).select("id").single()) as { id: string };
    await log(db, staff, "ad.created", created.id, row);
    return `Added “${row.campaign_name}”.`;
  });
}

async function deleteCampaign(form: FormData) {
  "use server";
  return runAdminAction(["admin"], form, "/admin/ads", async (staff, db) => {
    const id = text(form, "campaignId");
    if (!uuid.safeParse(id).success) throw new AdminInputError("Unknown campaign.");
    const { data: before } = await db.from("advertising_campaigns").select("*").eq("id", id).single();
    must(await db.from("advertising_campaigns").delete().eq("id", id));
    await log(db, staff, "ad.deleted", id, { deleted: before });
    return "Campaign deleted.";
  });
}

function Fields({ c, categories }: { c?: Campaign; categories: { id: string; name: string }[] }) {
  return (
    <>
      <label className="field text-sm">
        <span>Advertiser</span>
        <input name="advertiser_name" defaultValue={c?.advertiser_name} required className="input" />
      </label>
      <label className="field text-sm">
        <span>Campaign</span>
        <input name="campaign_name" defaultValue={c?.campaign_name} required className="input" />
      </label>
      <label className="field text-sm">
        <span>Placement</span>
        <select name="placement" defaultValue={c?.placement ?? "homepage_partner"} className="input">
          {PLACEMENTS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
      </label>
      <label className="field text-sm">
        <span>Category (category sponsors)</span>
        <select name="target_category" defaultValue={c?.target_category ?? ""} className="input">
          <option value="">None</option>
          {categories.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </select>
      </label>
      <label className="field text-sm">
        <span>Destination (https only)</span>
        <input name="destination_url" type="url" defaultValue={c?.destination_url ?? ""} className="input" />
      </label>
      <label className="field text-sm">
        <span>Image link (https only)</span>
        <input name="image_url" type="url" defaultValue={c?.image_url ?? ""} className="input" />
      </label>
      <label className="field text-sm">
        <span>Starts</span>
        <input name="start_date" type="date" defaultValue={c?.start_date} required className="input" />
      </label>
      <label className="field text-sm">
        <span>Ends</span>
        <input name="end_date" type="date" defaultValue={c?.end_date} required className="input" />
      </label>
      <label className="field text-sm">
        <span>Price ($)</span>
        <input name="price" inputMode="decimal" defaultValue={c ? (c.price_cents / 100).toFixed(2) : ""} required className="input" />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="paid" defaultChecked={c?.paid} /> Paid
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="active" defaultChecked={c?.active} /> Active
      </label>
    </>
  );
}

export default async function AdsPage({ searchParams }: PageProps<"/admin/ads">) {
  await requireStaff(["admin"], "/admin/ads");
  const sp = await searchParams;
  const db = adminDb();
  const [{ data }, { data: categories }] = await Promise.all([
    db.from("advertising_campaigns").select("*").order("start_date", { ascending: false }),
    db.from("product_categories").select("id, name").order("display_order"),
  ]);
  const rows = (data ?? []) as Campaign[];
  const today = new Date().toISOString().slice(0, 10);
  const confirmId = param(sp, "confirm") === "delete" ? param(sp, "id") : "";
  const confirming = rows.find((r) => r.id === confirmId);
  const editing = rows.find((r) => r.id === param(sp, "edit"));

  return (
    <>
      <AdminTitle title="Advertising" intro="A campaign shows on the site only while it is active, marked paid, and today is between its start and end dates." />
      <Flash flash={readFlash(sp)} />

      {confirming && (
        <form action={deleteCampaign} className="grid gap-2 rounded-md border border-danger/40 bg-danger/5 p-4">
          <ReturnTo path="/admin/ads" />
          <input type="hidden" name="campaignId" value={confirming.id} />
          <p className="font-semibold text-danger">Delete “{confirming.campaign_name}”?</p>
          <p className="text-sm">This removes the campaign record. A copy is kept in the audit log. To stop it showing, you can untick Active instead.</p>
          <p className="flex gap-2">
            <SubmitButton tone="danger">Confirm delete</SubmitButton>
            <Link href="/admin/ads" className="btn btn-outline px-3 py-1.5 text-sm">
              Cancel
            </Link>
          </p>
        </form>
      )}

      <section className="card grid gap-3 p-4">
        <h2 className="font-semibold">{editing ? `Edit “${editing.campaign_name}”` : "Add a campaign"}</h2>
        <form action={saveCampaign} className="grid gap-3 md:grid-cols-3" key={editing?.id ?? "new"}>
          <ReturnTo path="/admin/ads" />
          {editing && <input type="hidden" name="campaignId" value={editing.id} />}
          <Fields c={editing} categories={categories ?? []} />
          <p className="flex gap-2 md:col-span-3">
            <SubmitButton>{editing ? "Save campaign" : "Add campaign"}</SubmitButton>
            {editing && (
              <Link href="/admin/ads" className="btn btn-outline px-3 py-1.5 text-sm">
                Cancel
              </Link>
            )}
          </p>
        </form>
      </section>

      {rows.length === 0 ? (
        <Empty>No campaigns yet. The homepage partners section stays hidden until a paid campaign is running.</Empty>
      ) : (
        <Table label="Campaigns">
          <thead>
            <tr>
              <th>Campaign</th>
              <th>Placement</th>
              <th>Dates</th>
              <th>Price</th>
              <th>Showing</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => {
              const showing = c.active && c.paid && c.start_date <= today && today <= c.end_date;
              return (
                <tr key={c.id}>
                  <td>
                    <span className="font-medium">{c.campaign_name}</span>
                    <span className="block text-xs text-ink-soft">{c.advertiser_name}</span>
                  </td>
                  <td>{PLACEMENTS.find((p) => p.value === c.placement)?.label}</td>
                  <td className="whitespace-nowrap text-xs">
                    {c.start_date} to {c.end_date}
                  </td>
                  <td className="font-mono">{formatPrice(c.price_cents)}</td>
                  <td>
                    <Badge tone={showing ? "good" : "neutral"}>{showing ? "Live" : !c.paid ? "Unpaid" : !c.active ? "Inactive" : "Outside dates"}</Badge>
                  </td>
                  <td className="whitespace-nowrap">
                    <Link href={`/admin/ads?edit=${c.id}`} className="mr-3 underline">
                      Edit
                    </Link>
                    <Link href={`/admin/ads?confirm=delete&id=${c.id}`} className="text-danger underline">
                      Delete…
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
    </>
  );
}
