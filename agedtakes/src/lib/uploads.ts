// Upload rules shared by the newsroom. The file type is decided from the file's own bytes ("magic numbers"),
// never from its name or the browser's claim, and sizes are capped below Vercel's 4.5 MB request limit.

export const UPLOAD_LIMITS = {
  photo: { maxBytes: 3 * 1024 * 1024, types: ["image/jpeg", "image/png", "image/webp"] as const },
  evidence: { maxBytes: 4 * 1024 * 1024, types: ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const },
};

export type UploadKind = keyof typeof UPLOAD_LIMITS;

const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" };

/** Detects JPEG, PNG, WebP and PDF from the first bytes of the file. */
export function sniffType(bytes: Uint8Array): string | null {
  const b = (i: number) => bytes[i];
  if (bytes.length >= 3 && b(0) === 0xff && b(1) === 0xd8 && b(2) === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && b(0) === 0x89 && b(1) === 0x50 && b(2) === 0x4e && b(3) === 0x47 && b(4) === 0x0d && b(5) === 0x0a && b(6) === 0x1a && b(7) === 0x0a) return "image/png";
  if (bytes.length >= 12 && String.fromCharCode(b(0), b(1), b(2), b(3)) === "RIFF" && String.fromCharCode(b(8), b(9), b(10), b(11)) === "WEBP") return "image/webp";
  if (bytes.length >= 5 && String.fromCharCode(b(0), b(1), b(2), b(3), b(4)) === "%PDF-") return "application/pdf";
  return null;
}

export type CheckedUpload = { ok: true; mime: string; ext: string; size: number } | { ok: false; message: string };

export function checkUpload(kind: UploadKind, bytes: Uint8Array): CheckedUpload {
  const limits = UPLOAD_LIMITS[kind];
  if (bytes.length === 0) return { ok: false, message: "Choose a file to upload." };
  if (bytes.length > limits.maxBytes) return { ok: false, message: `The file is too large (max ${Math.round(limits.maxBytes / 1024 / 1024)} MB).` };
  const mime = sniffType(bytes);
  if (!mime || !(limits.types as readonly string[]).includes(mime)) {
    return { ok: false, message: kind === "photo" ? "Upload a JPEG, PNG or WebP image." : "Upload a JPEG, PNG or WebP image, or a PDF." };
  }
  return { ok: true, mime, ext: EXT[mime], size: bytes.length };
}
