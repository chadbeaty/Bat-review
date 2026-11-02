import type { Metadata } from "next";
import { adminDb, requireStaff } from "@/lib/admin/auth";
import { readFlash } from "@/lib/admin/action";
import { AdminTitle, Badge, Flash, ReturnTo, SubmitButton } from "@/components/admin/ui";
import { saveManufacturer } from "../actions";

export const metadata: Metadata = { title: "Manufacturers" };

type Row = { id: string; name: string; slug: string; aliases: string[]; website_url: string | null; active: boolean };

function Fields({ m }: { m?: Row }) {
  return (
    <>
      <label className="field text-sm">
        <span>Name</span>
        <input name="name" defaultValue={m?.name} required className="input" />
      </label>
      <label className="field text-sm">
        <span>Slug</span>
        <input name="slug" defaultValue={m?.slug} placeholder="Generated from the name" className="input font-mono" />
      </label>
      <label className="field text-sm">
        <span>Website (https)</span>
        <input name="website_url" type="url" defaultValue={m?.website_url ?? ""} className="input" />
      </label>
      <label className="field text-sm">
        <span>Search aliases (comma separated)</span>
        <input name="aliases" defaultValue={m?.aliases.join(", ")} className="input" />
      </label>
      <label className="flex items-center gap-2 self-end pb-2 text-sm">
        <input type="checkbox" name="active" defaultChecked={m ? m.active : true} /> Active (shown on the site)
      </label>
    </>
  );
}

export default async function ManufacturersPage({ searchParams }: PageProps<"/admin/catalog/manufacturers">) {
  await requireStaff(["moderator"], "/admin/catalog/manufacturers");
  const sp = await searchParams;
  const { data } = await adminDb().from("manufacturers").select("id, name, slug, aliases, website_url, active").order("name");
  const here = "/admin/catalog/manufacturers";
  return (
    <>
      <AdminTitle title="Manufacturers" intro="Deactivating a manufacturer hides it from the public directory. Its products and listings stay." />
      <Flash flash={readFlash(sp)} />
      <details className="card p-4">
        <summary className="cursor-pointer font-semibold">Add a manufacturer</summary>
        <form action={saveManufacturer} className="mt-3 grid gap-3 md:grid-cols-3">
          <ReturnTo path={here} />
          <Fields />
          <p className="self-end">
            <SubmitButton>Add manufacturer</SubmitButton>
          </p>
        </form>
      </details>
      <ul className="grid gap-2">
        {((data ?? []) as Row[]).map((m) => (
          <li key={m.id}>
            <details className="card px-4 py-2">
              <summary className="flex cursor-pointer flex-wrap items-center gap-2">
                <span className="font-medium">{m.name}</span>
                {!m.active && <Badge tone="warn">inactive</Badge>}
                <span className="font-mono text-xs text-ink-soft">{m.slug}</span>
              </summary>
              <form action={saveManufacturer} className="mt-3 grid gap-3 pb-2 md:grid-cols-3">
                <ReturnTo path={here} />
                <input type="hidden" name="manufacturerId" value={m.id} />
                <Fields m={m} />
                <p className="self-end">
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
