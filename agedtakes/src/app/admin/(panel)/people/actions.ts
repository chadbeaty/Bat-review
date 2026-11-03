"use server";

import { refreshPublic, runAction, str, InputError } from "@/lib/admin/action";
import { formValues, parseOrThrow, personSchema } from "@/lib/validation/admin";
import { slugify } from "@/lib/format";

export async function createPerson(form: FormData) {
  await runAction("researcher", form, "/admin/people", async ({ db, user }) => {
    const values = formValues(form);
    if (!values.slug) values.slug = slugify(String(values.name ?? ""));
    if (!values.status) values.status = "draft";
    const v = parseOrThrow(personSchema, values);
    const { data, error } = await db.from("people").insert({ ...v, created_by: user.id }).select("id").single();
    if (error) throw new InputError(error.message);
    return { notice: `${v.name} added.`, to: `/admin/people/${data.id}` };
  });
}

export async function updatePerson(form: FormData) {
  const id = str(form, "id");
  await runAction("researcher", form, `/admin/people/${id}`, async ({ db, role }) => {
    const v = parseOrThrow(personSchema, formValues(form));
    if (v.status === "active" && role === "researcher") {
      const { data: current } = await db.from("people").select("status").eq("id", id).single();
      if (current?.status !== "active") throw new InputError("Only an editor can make a profile public.");
    }
    const { error } = await db.from("people").update(v).eq("id", id);
    if (error) throw new InputError(error.message);
    const categories = form.getAll("category").map(String).filter(Boolean);
    await db.from("person_categories").delete().eq("person_id", id);
    if (categories.length) {
      const { error: catErr } = await db.from("person_categories").insert(categories.map((category_id) => ({ person_id: id, category_id })));
      if (catErr) throw new InputError(catErr.message);
    }
    refreshPublic([`/people/${v.slug}`]);
    return "Profile saved.";
  });
}

export async function deletePerson(form: FormData) {
  const id = str(form, "id");
  await runAction("admin", form, `/admin/people/${id}`, async ({ db }) => {
    if (str(form, "confirm") !== "DELETE") throw new InputError('Type DELETE to confirm.');
    const { error } = await db.from("people").delete().eq("id", id);
    if (error) throw new InputError("This person still has statements, predictions or cases. Archive them instead.");
    refreshPublic();
    return { notice: "Person deleted.", to: "/admin/people" };
  });
}
