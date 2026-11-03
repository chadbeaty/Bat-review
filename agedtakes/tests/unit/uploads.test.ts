import { describe, expect, it } from "vitest";
import { checkUpload, sniffType } from "@/lib/uploads";

const bytes = (...b: number[]) => new Uint8Array(b);
const text = (s: string) => new TextEncoder().encode(s);

describe("upload checks", () => {
  it("recognises file types from their contents, not their names", () => {
    expect(sniffType(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("image/jpeg");
    expect(sniffType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe("image/png");
    expect(sniffType(text("RIFF\u0000\u0000\u0000\u0000WEBPVP8 "))).toBe("image/webp");
    expect(sniffType(text("%PDF-1.7"))).toBe("application/pdf");
    expect(sniffType(text("<svg onload=alert(1)>"))).toBeNull();
    expect(sniffType(text("<html><script>"))).toBeNull();
  });
  it("only accepts images for photos and images or PDFs for evidence", () => {
    expect(checkUpload("photo", text("%PDF-1.7"))).toMatchObject({ ok: false });
    expect(checkUpload("evidence", text("%PDF-1.7"))).toMatchObject({ ok: true, ext: "pdf" });
    expect(checkUpload("photo", bytes(0xff, 0xd8, 0xff, 0xe0))).toMatchObject({ ok: true, ext: "jpg" });
  });
  it("rejects empty and oversized files", () => {
    expect(checkUpload("photo", new Uint8Array())).toMatchObject({ ok: false });
    const big = new Uint8Array(3 * 1024 * 1024 + 1);
    big.set([0xff, 0xd8, 0xff]);
    expect(checkUpload("photo", big)).toMatchObject({ ok: false });
    expect(checkUpload("evidence", big)).toMatchObject({ ok: true });
  });
});
