import { createClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

// Deletes the signed-in user's cloud account. Every table cascades from auth.users, and their private clip folder is
// emptied first. The user is identified from their own access token; the service key never leaves the server.
const hits = new Map<string, { n: number; at: number }>();

export async function DELETE(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon || !service) return NextResponse.json({ error: "Accounts aren't switched on." }, { status: 503 });

  // Simple per-instance rate limit: 5 attempts per IP per 10 minutes.
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const now = Date.now();
  const h = hits.get(ip);
  if (h && now - h.at < 600_000 && h.n >= 5) return NextResponse.json({ error: "Too many attempts." }, { status: 429 });
  hits.set(ip, h && now - h.at < 600_000 ? { n: h.n + 1, at: h.at } : { n: 1, at: now });

  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const userClient = createClient(url, anon, { auth: { persistSession: false } });
  const { data, error } = await userClient.auth.getUser(token);
  if (error || !data.user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
  const folder = data.user.id;
  for (;;) {
    const { data: files } = await admin.storage.from("swing-clips").list(folder, { limit: 100 });
    if (!files?.length) break;
    // Clips are stored as <user>/<swing>/<file>; list the swing folders and remove their contents.
    const paths: string[] = [];
    for (const f of files) {
      const { data: inner } = await admin.storage.from("swing-clips").list(`${folder}/${f.name}`, { limit: 1000 });
      if (inner?.length) paths.push(...inner.map((i) => `${folder}/${f.name}/${i.name}`));
      else paths.push(`${folder}/${f.name}`);
    }
    await admin.storage.from("swing-clips").remove(paths);
    if (files.length < 100) break;
  }
  const del = await admin.auth.admin.deleteUser(data.user.id);
  if (del.error) return NextResponse.json({ error: "Delete failed." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
