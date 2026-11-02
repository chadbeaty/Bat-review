import { AdminAuthError, adminDb, assertStaff } from "@/lib/admin/auth";
import { csvFilename, toCsv } from "@/lib/admin/csv";
import { EXPORTS } from "@/lib/admin/exports";

// A CSV download. Checks the signed-in admin and their two-step session on every request.
export async function GET(_request: Request, ctx: RouteContext<"/admin/exports/[kind]">) {
  const { kind } = await ctx.params;
  let staff;
  try {
    staff = await assertStaff(["admin"]);
  } catch (err) {
    // Same 404 as any unknown page, so the export URLs don't reveal the admin area.
    if (err instanceof AdminAuthError) return new Response("Not found", { status: 404 });
    throw err;
  }
  const def = EXPORTS.find((e) => e.kind === kind);
  if (!def) return new Response("Not found", { status: 404 });

  const db = adminDb();
  let rows;
  try {
    rows = await def.load(db);
  } catch {
    return new Response("The export failed. Try again.", { status: 500 });
  }
  await db.rpc("admin_log", {
    p_actor: staff.user.id,
    p_action: "export.downloaded",
    p_entity_type: "export",
    p_entity_id: null,
    p_metadata: { kind, rows: rows.length },
  });

  const csv = toCsv(def.columns, rows);
  return new Response("﻿" + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${csvFilename(kind)}"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
