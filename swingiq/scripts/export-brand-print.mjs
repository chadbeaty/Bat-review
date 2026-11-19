// Print-ready Gapper logo files: vector PDFs at a set physical size and 3000 px transparent PNGs, plus a one-page
// brand sheet. Reads the SVGs in public/brand/ (generated from src/brand/) and writes public/brand/print/.
//
//   node scripts/export-brand-print.mjs
//
// Uses the Playwright Chromium that the browser tests already install.
import { chromium } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(root, "public/brand");
const OUT = join(root, "public/brand/print");
mkdirSync(OUT, { recursive: true });

/** name -> printed width in inches (PDF page fits the art exactly). */
const FILES = {
  "gapper-crest": 4,
  "gapper-crest-black": 4,
  "gapper-crest-white": 4,
  "gapper-patch": 4,
  "gapper-patch-black": 4,
  "gapper-patch-white": 4,
  "gapper-mark": 4,
  "gapper-mark-light": 4,
  "gapper-mark-black": 4,
  "gapper-mark-white": 4,
  "gapper-lockup": 8,
  "gapper-lockup-light": 8,
  "gapper-lockup-black": 8,
  "gapper-lockup-white": 8,
  "gapper-app-icon": 4,
};

const viewBox = (svg) => svg.match(/viewBox="([^"]+)"/)[1].split(/\s+/).map(Number);
const darkBg = (name) => name.endsWith("-white");

const browser = await chromium.launch();
const page = await browser.newPage();

for (const [name, inches] of Object.entries(FILES)) {
  const svg = readFileSync(join(SRC, `${name}.svg`), "utf8");
  const [, , vw, vh] = viewBox(svg);
  const wIn = inches;
  const hIn = (inches * vh) / vw;
  // PDF: vector, page sized to the art. White-only art gets no background (it's for dark garments).
  await page.setContent(
    `<!doctype html><html><head><style>@page{size:${wIn}in ${hIn}in;margin:0}html,body{margin:0;padding:0}svg{display:block;width:${wIn}in;height:${hIn}in}</style></head><body>${svg}</body></html>`,
  );
  await page.pdf({ path: join(OUT, `${name}.pdf`), width: `${wIn}in`, height: `${hIn}in`, printBackground: true, pageRanges: "1" });
  // PNG: 3000 px on the long side, transparent.
  const pxW = vw >= vh ? 3000 : Math.round((3000 * vw) / vh);
  const pxH = vw >= vh ? Math.round((3000 * vh) / vw) : 3000;
  await page.setViewportSize({ width: pxW, height: pxH });
  await page.setContent(`<!doctype html><html><head><style>html,body{margin:0;background:transparent}svg{display:block;width:${pxW}px;height:${pxH}px}</style></head><body>${svg}</body></html>`);
  await page.screenshot({ path: join(OUT, `${name}.png`), omitBackground: true, clip: { x: 0, y: 0, width: pxW, height: pxH } });
  console.log("exported", name, darkBg(name) ? "(white art: shown on dark in the sheet)" : "");
}

// The brand sheet: one letter-size page with every logo, the colors and the rules.
const s = (n) => readFileSync(join(SRC, `${n}.svg`), "utf8");
const swatch = (hex, name, use, dark = true) =>
  `<div class="sw"><div class="chip" style="background:${hex};${dark ? "" : "border:1px solid #d6dbe3"}"></div><b>${name}</b><span>${hex}</span><em>${use}</em></div>`;
const sheet = `<!doctype html><html><head><meta charset="utf-8"><style>
@page{size:8.5in 11in;margin:0}
*{box-sizing:border-box}
body{margin:0;width:8.5in;height:11in;font-family:Helvetica,Arial,sans-serif;color:#101827;background:#fff}
.top{background:#101827;color:#fff;padding:.45in .5in .4in;display:flex;gap:.45in;align-items:center;height:4.1in}
.top .crest svg{height:3.25in;width:auto;display:block}
.top .patch svg{height:2.35in;width:auto;display:block}
.top .copy{flex:1}
.top h1{margin:0;font-size:30px;letter-spacing:.5px}
.top p{margin:.08in 0 0;color:#8995A6;font-size:12px;line-height:1.45}
.row{display:flex;gap:.3in;align-items:center;padding:.22in .5in;border-bottom:1px solid #e6e9ef}
.cell{display:flex;flex-direction:column;align-items:center;gap:6px;font-size:9px;color:#5b6676}
.cell svg{display:block}
.dark{background:#101827;padding:10px;border-radius:6px}
.sws{display:flex;gap:.18in;padding:.22in .5in}
.sw{display:flex;flex-direction:column;font-size:9px;gap:2px;width:1.3in}
.sw .chip{height:.45in;border-radius:6px;margin-bottom:4px}
.sw span{color:#5b6676}.sw em{color:#8995A6;font-style:normal}
.rules{padding:.05in .5in;font-size:9.5px;color:#3b4554;line-height:1.5;columns:2;column-gap:.4in}
h2{font-size:11px;letter-spacing:1px;margin:.18in .5in 0;color:#101827}
</style></head><body>
<div class="top"><div class="crest">${s("gapper-crest")}</div><div class="patch">${s("gapper-patch")}</div>
<div class="copy"><h1>GAPPER</h1><p>Own the gap.<br>Brand sheet. Files: public/brand/ (SVG) and public/brand/print/ (PDF, 3000 px PNG).</p></div></div>
<h2>MARKS</h2>
<div class="row">
<div class="cell"><div class="dark">${s("gapper-mark").replace("<svg", '<svg style="height:.9in;width:auto"')}</div>Mark · dark</div>
<div class="cell">${s("gapper-mark-light").replace("<svg", '<svg style="height:.9in;width:auto"')}Mark · light</div>
<div class="cell">${s("gapper-mark-black").replace("<svg", '<svg style="height:.9in;width:auto"')}One color</div>
<div class="cell">${s("gapper-crest-black").replace("<svg", '<svg style="height:1.1in;width:auto"')}Crest · one color</div>
<div class="cell">${s("gapper-patch-black").replace("<svg", '<svg style="height:1in;width:auto"')}Patch · one color</div>
<div class="cell"><div class="dark">${s("gapper-crest-white").replace("<svg", '<svg style="height:.9in;width:auto"')}</div>Crest · white ink</div>
</div>
<h2>LOCKUPS</h2>
<div class="row">
<div class="cell"><div class="dark">${s("gapper-lockup").replace("<svg", '<svg style="height:.5in;width:auto"')}</div>Horizontal · dark</div>
<div class="cell">${s("gapper-lockup-light").replace("<svg", '<svg style="height:.5in;width:auto"')}Horizontal · light</div>
<div class="cell">${s("gapper-wordmark-tagline-light").replace("<svg", '<svg style="height:.55in;width:auto"')}Wordmark + tagline</div>
<div class="cell">${s("gapper-app-icon").replace("<svg", '<svg style="height:.6in;width:auto"')}App icon</div>
</div>
<h2>COLOR</h2>
<div class="sws">${swatch("#101827", "Midnight Navy", "Backgrounds, badge")}${swatch("#202D40", "Deep Slate", "Panels")}${swatch("#B7F34A", "Electric Lime", "The ball. Sparingly", false)}${swatch("#FFFFFF", "White", "Field, letters", false)}${swatch("#8995A6", "Steel Gray", "Secondary text")}</div>
<h2>RULES</h2>
<div class="rules">Keep clear space around every logo of at least the ball's diameter. Minimum sizes: mark 16 px / 0.25 in, crest 0.75 in, patch 1 in, horizontal lockup 1.25 in wide. The lime ball is the only lime in a logo; never recolor the field or letters lime. On light backgrounds use the light or one-color version; on dark garments print the white-ink version and let the shirt be the badge. Don't stretch, outline, add shadows or rearrange the parts. In sentences write Gapper; capitals are for the logo. Type: Mona Sans (Google Fonts). Embroidery: use the one-color crest or patch; the smallest letters need about 0.25 in cap height.</div>
</body></html>`;
await page.setViewportSize({ width: 816, height: 1056 });
await page.setContent(sheet);
await page.pdf({ path: join(OUT, "gapper-brand-sheet.pdf"), width: "8.5in", height: "11in", printBackground: true, pageRanges: "1" });
await page.screenshot({ path: join(OUT, "gapper-brand-sheet.png"), fullPage: true });
await browser.close();
console.log("brand sheet done");
