"use client";

/**
 * Shrinks a photo in the browser before upload (long edge at most `maxEdge` pixels, re-encoded as JPEG), so
 * phone photos upload quickly. If the browser can't decode the file (for example HEIC outside Safari), the
 * original file is returned unchanged with its own type.
 */
export async function resizeImage(file: File, maxEdge = 2000, quality = 0.85): Promise<{ blob: Blob; type: string; ext: string }> {
  const original = { blob: file as Blob, type: file.type || "image/heic", ext: extensionFor(file.type || "image/heic") };
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return original;
  }
  try {
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return original;
    ctx.fillStyle = "#fff"; // transparent PNGs get a white background instead of black
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (!blob) return original;
    // Keep the original if re-encoding made a small file bigger.
    if (scale === 1 && blob.size >= file.size && file.type === "image/jpeg") return original;
    return { blob, type: "image/jpeg", ext: "jpg" };
  } finally {
    bitmap.close();
  }
}

export function extensionFor(type: string): string {
  return { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic" }[type] ?? "jpg";
}
