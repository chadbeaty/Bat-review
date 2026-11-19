"use client";

/**
 * Rolling buffer of the last few seconds of camera frames, stored as small canvases from a reusable pool.
 * Only frames that went through pose tracking are kept, so a clip's frames line up exactly with its skeleton data.
 * When a swing is captured, its canvases are detached (so the live loop can't overwrite them) and encoded to JPEG.
 */
export class FrameBuffer {
  private ring: { t: number; canvas: HTMLCanvasElement }[] = [];
  private pool: HTMLCanvasElement[] = [];
  width = 0;
  height = 0;

  constructor(
    private keepMs: number,
    private longSide = 432,
  ) {}

  configure(videoW: number, videoH: number) {
    const s = this.longSide / Math.max(videoW, videoH);
    const w = Math.round((videoW * s) / 2) * 2;
    const h = Math.round((videoH * s) / 2) * 2;
    if (w !== this.width || h !== this.height) {
      this.clear();
      this.width = w;
      this.height = h;
    }
  }

  private take(): HTMLCanvasElement {
    const c = this.pool.pop() ?? document.createElement("canvas");
    if (c.width !== this.width || c.height !== this.height) {
      c.width = this.width;
      c.height = this.height;
    }
    return c;
  }

  push(t: number, source: CanvasImageSource) {
    if (!this.width) return;
    const canvas = this.take();
    canvas.getContext("2d", { alpha: false })!.drawImage(source, 0, 0, this.width, this.height);
    this.ring.push({ t, canvas });
    while (this.ring.length && t - this.ring[0].t > this.keepMs) this.pool.push(this.ring.shift()!.canvas);
  }

  /** Removes and returns the frames in [from, to]. They're no longer reused by the buffer. */
  detach(from: number, to: number): { t: number; canvas: HTMLCanvasElement }[] {
    const out = this.ring.filter((f) => f.t >= from && f.t <= to);
    this.ring = this.ring.filter((f) => f.t < from || f.t > to);
    return out;
  }

  clear() {
    for (const f of this.ring) this.pool.push(f.canvas);
    this.ring = [];
    for (const c of this.pool) {
      c.width = 0;
      c.height = 0;
    }
    this.pool = [];
  }
}

export async function encodeFrames(frames: { t: number; canvas: HTMLCanvasElement }[], quality = 0.72): Promise<{ t: number; blob: Blob }[]> {
  const out: { t: number; blob: Blob }[] = [];
  for (const f of frames) {
    const blob = await new Promise<Blob | null>((res) => f.canvas.toBlob(res, "image/jpeg", quality));
    if (blob) out.push({ t: f.t, blob });
    // Free the canvas memory right away (iOS caps total canvas memory).
    f.canvas.width = 0;
    f.canvas.height = 0;
  }
  return out;
}
