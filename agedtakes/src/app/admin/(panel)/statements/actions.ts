"use server";

import { InputError, refreshPublic, runAction, str } from "@/lib/admin/action";
import { formValues, parseOrThrow, statementSchema } from "@/lib/validation/admin";
import { quoteAppearsVerbatim } from "@/lib/ai/verify";

function row(form: FormData) {
  const v = parseOrThrow(statementSchema, formValues(form));
  return { ...v, published_at: v.published_at ? new Date(v.published_at).toISOString() : null };
}

export async function createStatement(form: FormData) {
  await runAction("researcher", form, "/admin/statements/new", async ({ db, user }) => {
    const { data, error } = await db.from("statements").insert({ ...row(form), created_by: user.id, visibility: "internal" }).select("id").single();
    if (error) throw new InputError(error.message);
    return { notice: "Statement recorded (internal). Verify it against the source before making it public.", to: `/admin/statements/${data.id}` };
  });
}

export async function updateStatement(form: FormData) {
  const id = str(form, "id");
  await runAction("researcher", form, `/admin/statements/${id}`, async ({ db }) => {
    const r: Partial<ReturnType<typeof row>> = row(form);
    const { data: current } = await db.from("statements").select("exact_quote, visibility").eq("id", id).single();
    if (current?.visibility === "public") {
      // The original wording, date, person and source of a public statement change only through a correction.
      delete r.exact_quote;
      delete r.published_at;
      delete r.person_id;
      delete r.source_id;
    }
    const quoteChanged = r.exact_quote !== undefined && current?.exact_quote !== r.exact_quote;
    const { error } = await db.from("statements").update({ ...r, ...(quoteChanged ? { quote_verified_verbatim: false } : {}) }).eq("id", id);
    if (error) throw new InputError(error.message);
    refreshPublic();
    return "Statement saved.";
  });
}

/** Checks the quotation word for word against the source's stored text snapshot. */
export async function verifyQuote(form: FormData) {
  const id = str(form, "id");
  await runAction("researcher", form, `/admin/statements/${id}`, async ({ db }) => {
    const { data: s } = await db.from("statements").select("exact_quote, source_id").eq("id", id).single();
    if (!s?.source_id) throw new InputError("Link a source first.");
    const { data: snaps } = await db.from("source_snapshots").select("content_text").eq("evidence_source_id", s.source_id);
    if (!snaps?.length) throw new InputError("The source has no stored text. Paste or fetch it on the source page, or check the quote by hand.");
    const ok = snaps.some((x) => quoteAppearsVerbatim(s.exact_quote, x.content_text));
    await db.from("statements").update({ quote_verified_verbatim: ok }).eq("id", id);
    if (!ok) throw new InputError("The quotation was NOT found word for word in the stored source text. Fix the wording or the source.");
    return "Quotation found word for word in the source.";
  });
}

export async function setStatementVisibility(form: FormData) {
  const id = str(form, "id");
  const visibility = str(form, "visibility") === "public" ? "public" : "internal";
  await runAction("editor", form, `/admin/statements/${id}`, async ({ db }) => {
    const { error } = await db.from("statements").update({ visibility }).eq("id", id);
    if (error) throw new InputError(error.message);
    refreshPublic();
    return visibility === "public" ? "Statement is now public." : "Statement hidden from the public site.";
  });
}

export async function correctStatement(form: FormData) {
  const id = str(form, "id");
  await runAction("editor", form, `/admin/statements/${id}`, async ({ db }) => {
    const field = str(form, "field");
    let value = str(form, "value");
    if (field === "published_at" && value) value = new Date(value).toISOString();
    const { error } = await db.rpc("correct_statement", { p_statement: id, p_field: field, p_value: value, p_reason: str(form, "reason") });
    if (error) throw new InputError(error.message);
    refreshPublic();
    return "Correction recorded and published in the corrections log.";
  });
}

export async function createPredictionFromStatement(form: FormData) {
  const id = str(form, "id");
  await runAction("researcher", form, `/admin/statements/${id}`, async ({ db, user }) => {
    const { data: s } = await db.from("statements").select("person_id, exact_quote, published_at, asset_or_topic").eq("id", id).single();
    if (!s?.published_at) throw new InputError("The statement needs a date before it can become a prediction.");
    const { data, error } = await db.from("predictions").insert({
      person_id: s.person_id, statement_id: id, prediction_text: s.exact_quote, asset: s.asset_or_topic, prediction_date: String(s.published_at).slice(0, 10), status: "open", visibility: "internal", created_by: user.id,
    }).select("id").single();
    if (error) throw new InputError(error.message);
    return { notice: "Prediction created. Add the target, deadline and resolution criteria.", to: `/admin/predictions/${data.id}` };
  });
}
