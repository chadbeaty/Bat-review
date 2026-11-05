"use server";

import { audit, InputError, refreshPublic, runAction, str } from "@/lib/admin/action";
import { formValues, parseOrThrow, sourceSchema } from "@/lib/validation/admin";
import { sha256 } from "@/lib/ai/hash";
import { manualUrlConnector } from "@/lib/connectors/official";
import { createHash } from "node:crypto";
import { checkUpload } from "@/lib/uploads";
import { redirect } from "next/navigation";
import { assertStaff } from "@/lib/auth/staff";

function toRow(form: FormData) {
  const v = parseOrThrow(sourceSchema, formValues(form, ["is_primary"]));
  return { ...v, published_at: v.published_at ? new Date(v.published_at).toISOString() : null };
}

export async function createSource(form: FormData) {
  await runAction("researcher", form, "/admin/evidence/new", async ({ db, user }) => {
    const row = toRow(form);
    if (!row.canonical_url && !row.archive_url && !["book", "court_record", "other"].includes(row.source_type)) throw new InputError("Add the original link or an archived copy.");
    const { data, error } = await db.from("evidence_sources").insert({ ...row, created_by: user.id }).select("id").single();
    if (error) throw new InputError(/duplicate key/.test(error.message) ? "A source with that link already exists — search for it instead." : error.message);
    const text = str(form, "snapshot_text");
    if (text) await db.from("source_snapshots").insert({ evidence_source_id: data.id, content_text: text, content_hash: sha256(text), fetched_from: "pasted by editor" });
    const caseId = str(form, "attach_case");
    if (caseId) {
      await db.from("case_evidence").insert({ case_id: caseId, evidence_source_id: data.id, evidence_role: str(form, "attach_role") || "supporting" });
      return { notice: "Source added and attached to the case.", to: `/admin/cases/${caseId}#evidence` };
    }
    return { notice: "Source added.", to: `/admin/evidence/${data.id}` };
  });
}

export async function updateSource(form: FormData) {
  const id = str(form, "id");
  await runAction("researcher", form, `/admin/evidence/${id}`, async ({ db }) => {
    const { error } = await db.from("evidence_sources").update(toRow(form)).eq("id", id);
    if (error) throw new InputError(error.message);
    refreshPublic();
    return "Source saved.";
  });
}

/** Stores the source's full text (pasted transcript or filing text) so quotes can be checked verbatim. */
export async function addSnapshot(form: FormData) {
  const id = str(form, "id");
  await runAction("researcher", form, `/admin/evidence/${id}`, async ({ db }) => {
    const text = str(form, "snapshot_text");
    if (text.length < 20) throw new InputError("Paste the full text of the source.");
    const hash = sha256(text);
    const { error } = await db.from("source_snapshots").upsert({ evidence_source_id: id, content_text: text, content_hash: hash, fetched_from: "pasted by editor" }, { onConflict: "evidence_source_id,content_hash", ignoreDuplicates: true });
    if (error) throw new InputError(error.message);
    await db.from("evidence_sources").update({ content_hash: hash }).eq("id", id);
    return "Text snapshot saved.";
  });
}

/** Fetches the public page at the source's link (respecting robots.txt and paywalls) and stores its text. */
export async function fetchSnapshot(form: FormData) {
  const id = str(form, "id");
  await runAction("researcher", form, `/admin/evidence/${id}`, async (staff) => {
    const { data: src } = await staff.db.from("evidence_sources").select("canonical_url").eq("id", id).single();
    if (!src?.canonical_url) throw new InputError("This source has no link to fetch.");
    const res = await manualUrlConnector.fetchItems({ url: src.canonical_url }, { fetch, env: process.env, trackedNames: [], now: new Date() });
    if (res.status !== "ok" || !res.items[0]?.contentText) throw new InputError(res.status === "skipped" ? res.reason : res.status === "error" ? res.message : "No text found.");
    const text = res.items[0].contentText;
    const hash = sha256(text);
    await staff.db.from("source_snapshots").upsert({ evidence_source_id: id, content_text: text, content_hash: hash, fetched_from: src.canonical_url }, { onConflict: "evidence_source_id,content_hash", ignoreDuplicates: true });
    await staff.db.from("evidence_sources").update({ content_hash: hash, collected_at: new Date().toISOString() }).eq("id", id);
    await audit(staff, "fetch_snapshot", "evidence_sources", id, { url: src.canonical_url, chars: text.length });
    return `Fetched ${text.length.toLocaleString()} characters.`;
  });
}

/** Queues the Statement Extraction Agent on this source's stored text. */
export async function extractFromSource(form: FormData) {
  const id = str(form, "id");
  await runAction("researcher", form, `/admin/evidence/${id}`, async ({ db, user }) => {
    const { error } = await db.from("research_jobs").insert({ job_type: "extract_statements", payload: { evidence_source_id: id }, dedupe_key: `extract-src:${id}`, created_by: user.id, priority: 50 });
    if (error) throw new InputError(/duplicate/.test(error.message) ? "Extraction for this source is already queued." : error.message);
    return { notice: "Extraction queued. Run it from the research queue, or wait for the next scheduled run.", to: "/admin/research" };
  });
}

/** Stores a screenshot or document (e.g. a filing PDF) for this source in private storage. */
export async function uploadSourceFile(form: FormData) {
  const id = str(form, "id");
  await runAction("researcher", form, `/admin/evidence/${id}`, async (staff) => {
    const file = form.get("file");
    if (!(file instanceof File)) throw new InputError("Choose a file to upload.");
    const bytes = new Uint8Array(await file.arrayBuffer());
    const checked = checkUpload("evidence", bytes);
    if (!checked.ok) throw new InputError(checked.message);
    const path = `sources/${id}/${crypto.randomUUID()}.${checked.ext}`;
    const { error } = await staff.db.storage.from("evidence-files").upload(path, bytes, { contentType: checked.mime, upsert: false });
    if (error) throw new InputError(`Upload failed: ${error.message}`);
    const hash = createHash("sha256").update(bytes).digest("hex");
    const { error: updateError } = await staff.db.from("evidence_sources").update({ file_path: path, file_mime: checked.mime, file_size: checked.size, file_sha256: hash }).eq("id", id);
    if (updateError) throw new InputError(updateError.message);
    await audit(staff, "upload_source_file", "evidence_sources", id, { path, size: checked.size, sha256: hash });
    return "File stored privately with this source.";
  });
}

/** Opens a private evidence file through a link that expires after 10 minutes. */
export async function openSourceFile(form: FormData) {
  const staff = await assertStaff("researcher");
  const id = str(form, "id");
  const { data: src } = await staff.db.from("evidence_sources").select("file_path").eq("id", id).single();
  if (!src?.file_path) redirect(`/admin/evidence/${id}`);
  const { data, error } = await staff.db.storage.from("evidence-files").createSignedUrl(src.file_path, 600);
  if (error || !data) redirect(`/admin/evidence/${id}`);
  redirect(data.signedUrl);
}
