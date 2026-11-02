import type { Metadata } from "next";
import { adminDb, requireStaff } from "@/lib/admin/auth";
import { readFlash } from "@/lib/admin/action";
import { AdminTitle, Badge, Flash, ReturnTo, SubmitButton } from "@/components/admin/ui";
import { saveCategory } from "../actions";

export const metadata: Metadata = { title: "Categories" };

type Row = { id: string; name: string; slug: string; description: string | null; attribute_schema: unknown[]; display_order: number; active: boolean };

function Fields({ c }: { c?: Row }) {
  return (
    <>
      <label className="field text-sm">
        <span>Name</span>
        <input name="name" defaultValue={c?.name} required className="input" />
      </label>
      <label className="field text-sm">
        <span>Slug</span>
        <input name="slug" defaultValue={c?.slug} placeholder="Generated from the name" className="input font-mono" />
      </label>
      <label className="field text-sm">
        <span>Display order</span>
        <input name="display_order" type="number" min={0} max={1000} defaultValue={c?.display_order ?? 50} className="input" />
      </label>
      <label className="field text-sm md:col-span-3">
        <span>Description</span>
        <input name="description" defaultValue={c?.description ?? ""} className="input" />
      </label>
      <label className="field text-sm md:col-span-3">
        <span>Listing fields (JSON list)</span>
        <textarea
          name="attribute_schema"
          rows={8}
          spellCheck={false}
          defaultValue={JSON.stringify(c?.attribute_schema ?? [], null, 2)}
          className="input font-mono text-xs"
        />
        <span className="text-xs font-normal text-ink-soft">
          Each field: key (lowercase_with_underscores), label, type (text, number, select, multiselect or boolean), optional required, options (needed for
          select types), default and hint.
        </span>
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="active" defaultChecked={c ? c.active : true} /> Active
      </label>
    </>
  );
}

export default async function CategoriesPage({ searchParams }: PageProps<"/admin/catalog/categories">) {
  await requireStaff(["admin"], "/admin/catalog/categories");
  const sp = await searchParams;
  const { data } = await adminDb().from("product_categories").select("id, name, slug, description, attribute_schema, display_order, active").order("display_order");
  const here = "/admin/catalog/categories";
  return (
    <>
      <AdminTitle title="Categories" intro="Each category's listing fields come from its JSON field list, so a new category needs no code. Existing listings keep their saved values." />
      <Flash flash={readFlash(sp)} />
      <details className="card p-4">
        <summary className="cursor-pointer font-semibold">Add a category</summary>
        <form action={saveCategory} className="mt-3 grid gap-3 md:grid-cols-3">
          <ReturnTo path={here} />
          <Fields />
          <p>
            <SubmitButton>Add category</SubmitButton>
          </p>
        </form>
      </details>
      <ul className="grid gap-2">
        {((data ?? []) as Row[]).map((c) => (
          <li key={c.id}>
            <details className="card px-4 py-2">
              <summary className="flex cursor-pointer flex-wrap items-center gap-2">
                <span className="font-medium">{c.name}</span>
                {!c.active && <Badge tone="warn">inactive</Badge>}
                <span className="text-xs text-ink-soft">{c.attribute_schema.length} listing fields</span>
              </summary>
              <form action={saveCategory} className="mt-3 grid gap-3 pb-2 md:grid-cols-3">
                <ReturnTo path={here} />
                <input type="hidden" name="categoryId" value={c.id} />
                <Fields c={c} />
                <p>
                  <SubmitButton>Save</SubmitButton>
                </p>
              </form>
            </details>
          </li>
        ))}
      </ul>
    </>
  );
}
