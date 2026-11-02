// CSV export definitions: what each file contains. Users exports hold only username, email, status and
// dates: no ZIP codes, addresses or payment details.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { CsvValue } from "@/lib/admin/csv";

export const EXPORT_LIMIT = 10_000;

type Row = Record<string, CsvValue>;
export type ExportDef = {
  kind: "users" | "listings" | "orders" | "fees";
  title: string;
  description: string;
  columns: { key: string; header: string }[];
  load: (db: SupabaseClient) => Promise<Row[]>;
};

function check<T>(res: { data: T[] | null; error: { message: string } | null }): T[] {
  if (res.error) throw new Error(res.error.message);
  return res.data ?? [];
}

export const EXPORTS: ExportDef[] = [
  {
    kind: "users",
    title: "Members",
    description: "Username, display name, email, account status, seller verification and join date. No addresses or ZIP codes.",
    columns: [
      { key: "id", header: "Member id" },
      { key: "username", header: "Username" },
      { key: "display_name", header: "Display name" },
      { key: "email", header: "Email" },
      { key: "account_status", header: "Status" },
      { key: "seller_verified", header: "Seller verified" },
      { key: "created_at", header: "Joined" },
    ],
    load: async (db) =>
      check(
        await db
          .from("profiles")
          .select("id, username, display_name, email, account_status, seller_verified, created_at")
          .order("created_at", { ascending: false })
          .limit(EXPORT_LIMIT)
      ),
  },
  {
    kind: "listings",
    title: "Listings",
    description: "Every listing with seller, category, price in cents, condition, status and dates.",
    columns: [
      { key: "id", header: "Listing id" },
      { key: "title", header: "Title" },
      { key: "seller", header: "Seller" },
      { key: "category", header: "Category" },
      { key: "asking_price_cents", header: "Asking price (cents)" },
      { key: "condition_score", header: "Condition (1-10)" },
      { key: "structural_disclosure", header: "Structural disclosure" },
      { key: "listing_status", header: "Status" },
      { key: "featured", header: "Featured" },
      { key: "published_at", header: "Published" },
      { key: "created_at", header: "Created" },
    ],
    load: async (db) => {
      const rows = check(
        await db
          .from("equipment_listings")
          .select(
            "id, title, asking_price_cents, condition_score, structural_disclosure, listing_status, featured, published_at, created_at, profiles!equipment_listings_seller_id_fkey(username), product_categories(name)"
          )
          .order("created_at", { ascending: false })
          .limit(EXPORT_LIMIT)
      ) as unknown as (Row & { profiles: { username: string } | null; product_categories: { name: string } | null })[];
      return rows.map(({ profiles, product_categories, ...r }) => ({ ...r, seller: profiles?.username ?? null, category: product_categories?.name ?? null }));
    },
  },
  {
    kind: "orders",
    title: "Orders",
    description: "Order totals in cents: item subtotal, shipping, tax, commission, seller payout and refunds, with status and dates.",
    columns: [
      { key: "order_number", header: "Order" },
      { key: "order_status", header: "Status" },
      { key: "buyer_id", header: "Buyer id" },
      { key: "seller_id", header: "Seller id" },
      { key: "subtotal_cents", header: "Item subtotal (cents)" },
      { key: "shipping_cost_cents", header: "Shipping (cents)" },
      { key: "tax_amount_cents", header: "Tax (cents)" },
      { key: "total_amount_cents", header: "Total (cents)" },
      { key: "platform_fee_cents", header: "Commission (cents)" },
      { key: "payment_processing_cents", header: "Processing (cents)" },
      { key: "seller_payout_cents", header: "Seller payout (cents)" },
      { key: "refunded_amount_cents", header: "Refunded (cents)" },
      { key: "created_at", header: "Created" },
      { key: "paid_at", header: "Paid" },
      { key: "completed_at", header: "Completed" },
    ],
    load: async (db) =>
      check(
        await db
          .from("orders")
          .select(
            "order_number, order_status, buyer_id, seller_id, subtotal_cents, shipping_cost_cents, tax_amount_cents, total_amount_cents, platform_fee_cents, payment_processing_cents, seller_payout_cents, refunded_amount_cents, created_at, paid_at, completed_at"
          )
          .order("created_at", { ascending: false })
          .limit(EXPORT_LIMIT)
      ),
  },
  {
    kind: "fees",
    title: "Fee history",
    description: "Every fee version ever created, with its value, start date and whether it is active.",
    columns: [
      { key: "id", header: "Version id" },
      { key: "fee_name", header: "Fee" },
      { key: "fee_type", header: "Type" },
      { key: "fee_value", header: "Value (percent or cents)" },
      { key: "active", header: "Active" },
      { key: "effective_from", header: "Starts" },
      { key: "description", header: "Description" },
      { key: "created_at", header: "Created" },
    ],
    load: async (db) =>
      check(
        await db
          .from("fee_configuration")
          .select("id, fee_name, fee_type, fee_value, active, effective_from, description, created_at")
          .order("fee_name")
          .order("effective_from", { ascending: false })
          .limit(EXPORT_LIMIT)
      ),
  },
];
