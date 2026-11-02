import type { Metadata } from "next";
import Link from "next/link";
import { adminDb, requireStaff } from "@/lib/admin/auth";
import { readFlash } from "@/lib/admin/action";
import { WEIGHTINGS } from "@/lib/admin/catalog";
import { AdminTitle, Badge, Empty, Flash, ReturnTo, SubmitButton, dateTime, param } from "@/components/admin/ui";
import { reviewSubmission } from "../actions";

export const metadata: Metadata = { title: "Catalog submissions" };

type Row = {
  id: string;
  submitted_by: string;
  model_name: string;
  model_year: number | null;
  manufacturer_id: string | null;
  manufacturer_name: string | null;
  details: Record<string, unknown>;
  status: string;
  review_notes: string | null;
  created_product_id: string | null;
  created_at: string;
  product_categories: { name: string; slug: string } | null;
  manufacturers: { name: string } | null;
};

export default async function SubmissionsPage({ searchParams }: PageProps<"/admin/catalog/submissions">) {
  await requireStaff(["moderator"], "/admin/catalog/submissions");
  const sp = await searchParams;
  const status = ["pending", "approved", "rejected"].includes(param(sp, "status")) ? param(sp, "status") : "pending";
  const db = adminDb();
  const [{ data, error }, { data: manufacturers }] = await Promise.all([
    db
      .from("product_submissions")
      .select("id, submitted_by, model_name, model_year, manufacturer_id, manufacturer_name, details, status, review_notes, created_product_id, created_at, product_categories(name, slug), manufacturers(name)")
      .eq("status", status)
      .order("created_at", { ascending: status === "pending" })
      .limit(50),
    db.from("manufacturers").select("id, name").order("name"),
  ]);
  const rows = (data ?? []) as unknown as Row[];
  const here = `/admin/catalog/submissions?status=${status}`;

  return (
    <>
      <AdminTitle title="Catalog submissions" intro="Members ask for models that aren't in the catalog. Approve to create a draft product (optionally with a bat spec), or reject with a note." />
      <Flash flash={readFlash(sp)} />
      <nav aria-label="Submission status" className="flex gap-2">
        {["pending", "approved", "rejected"].map((s) => (
          <Link key={s} href={`/admin/catalog/submissions?status=${s}`} className={`btn px-3 py-1.5 text-sm ${s === status ? "btn-primary" : "btn-outline"}`}>
            {s}
          </Link>
        ))}
      </nav>
      {error ? (
        <p className="text-danger">Couldn&apos;t load submissions: {error.message}</p>
      ) : rows.length === 0 ? (
        <Empty>No {status} submissions.</Empty>
      ) : (
        <ul className="grid gap-4">
          {rows.map((s) => {
            const mfr = s.manufacturers?.name ?? s.manufacturer_name ?? "";
            const suggested = [s.model_year, mfr, s.model_name].filter(Boolean).join(" ");
            return (
              <li key={s.id} className="card grid gap-3 p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="font-semibold">{suggested}</h2>
                  <span className="text-xs text-ink-soft">
                    {s.product_categories?.name} · {dateTime(s.created_at)} ·{" "}
                    <Link href={`/admin/users/${s.submitted_by}`} className="underline">
                      submitter
                    </Link>
                  </span>
                </div>
                {Object.keys(s.details ?? {}).length > 0 && (
                  <pre className="max-w-full overflow-x-auto rounded bg-paper p-2 text-xs">{JSON.stringify(s.details, null, 2)}</pre>
                )}
                {s.status !== "pending" ? (
                  <p className="text-sm">
                    <Badge tone={s.status === "approved" ? "good" : "neutral"}>{s.status}</Badge> {s.review_notes}{" "}
                    {s.created_product_id && (
                      <Link href={`/admin/catalog/${s.created_product_id}`} className="underline">
                        Open product
                      </Link>
                    )}
                  </p>
                ) : (
                  <div className="grid gap-4 lg:grid-cols-2">
                    <form action={reviewSubmission} className="grid gap-2 rounded-md border border-line p-3">
                      <ReturnTo path={here} />
                      <input type="hidden" name="submissionId" value={s.id} />
                      <input type="hidden" name="decision" value="approve" />
                      <p className="text-sm font-semibold">Approve as a new product</p>
                      <label className="field text-sm">
                        <span>Product name</span>
                        <input name="product_name" defaultValue={suggested} required className="input" />
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        <label className="field text-sm">
                          <span>Model</span>
                          <input name="model_name" defaultValue={s.model_name} className="input" />
                        </label>
                        <label className="field text-sm">
                          <span>Year</span>
                          <input name="model_year" type="number" min={1980} max={2100} defaultValue={s.model_year ?? ""} className="input" />
                        </label>
                      </div>
                      <label className="field text-sm">
                        <span>Manufacturer</span>
                        <select name="manufacturer_id" defaultValue={s.manufacturer_id ?? ""} className="input">
                          <option value="">Not set</option>
                          {(manufacturers ?? []).map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="field text-sm">
                        <span>URL slug (blank to generate)</span>
                        <input name="slug" className="input font-mono" />
                      </label>
                      {s.product_categories?.slug === "bats" && (
                        <div className="grid grid-cols-2 gap-2">
                          <label className="field text-sm">
                            <span>Bat spec: weight (oz, optional)</span>
                            <input name="weight_oz" inputMode="decimal" className="input" />
                          </label>
                          <label className="field text-sm">
                            <span>Weighting</span>
                            <select name="weighting_type" defaultValue="" className="input">
                              <option value="">No spec</option>
                              {WEIGHTINGS.map((w) => (
                                <option key={w} value={w}>
                                  {w}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>
                      )}
                      <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" name="publish" /> Publish straight away (otherwise it stays a draft)
                      </label>
                      <label className="field text-sm">
                        <span>Notes (optional)</span>
                        <input name="notes" className="input" />
                      </label>
                      <p>
                        <SubmitButton>Approve</SubmitButton>
                      </p>
                    </form>
                    <form action={reviewSubmission} className="grid content-start gap-2 rounded-md border border-line p-3">
                      <ReturnTo path={here} />
                      <input type="hidden" name="submissionId" value={s.id} />
                      <input type="hidden" name="decision" value="reject" />
                      <p className="text-sm font-semibold">Reject</p>
                      <label className="field text-sm">
                        <span>Why (the member may see this)</span>
                        <textarea name="notes" required rows={3} className="input" />
                      </label>
                      <p>
                        <SubmitButton tone="outline">Reject</SubmitButton>
                      </p>
                    </form>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
