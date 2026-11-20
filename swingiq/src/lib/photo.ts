/**
 * Shrinks a photo the player picked (camera or camera roll) to a small JPEG for on-device storage. Phone photos are
 * often 3–5 MB; this keeps a bat photo around 100 KB so Bat DNA stays fast and storage stays light.
 */
export async function shrinkPhoto(file: File, maxSide = 1000, quality = 0.82): Promise<Blob> {
  if (!file.type.startsWith("image/")) throw new Error("That file isn't a photo.");
  // createImageBitmap honours the photo's orientation (a sideways phone shot comes out upright).
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" }).catch(() => null);
  let w: number;
  let h: number;
  let src: CanvasImageSource;
  if (bmp) {
    w = bmp.width;
    h = bmp.height;
    src = bmp;
  } else {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      w = img.naturalWidth;
      h = img.naturalHeight;
      src = img;
    } catch {
      URL.revokeObjectURL(url);
      throw new Error("Couldn't read that photo. Try another one.");
    }
  }
  const k = Math.min(1, maxSide / Math.max(w, h));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w * k));
  c.height = Math.max(1, Math.round(h * k));
  c.getContext("2d")!.drawImage(src, 0, 0, c.width, c.height);
  bmp?.close();
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("Couldn't save that photo."))), "image/jpeg", quality));
}
