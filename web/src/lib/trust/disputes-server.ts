import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export type EvidenceLink = { path: string; url: string; isPdf: boolean };

/** One-hour signed links for evidence files. Call only after checking the viewer may see the case. */
export async function signedEvidence(paths: string[]): Promise<EvidenceLink[]> {
  const db = createAdminClient();
  if (!db || !paths.length) return [];
  const { data } = await db.storage.from("dispute-evidence").createSignedUrls(paths, 3600);
  return (data ?? []).flatMap((d) => (d.signedUrl && d.path ? [{ path: d.path, url: d.signedUrl, isPdf: d.path.endsWith(".pdf") }] : []));
}
