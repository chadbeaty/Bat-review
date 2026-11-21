// The shareable player report: one 1080 x 1350 image (a phone-friendly portrait card) drawn on a canvas from the
// player's Hitting Profile. Every number on it is one the app shows; anything not measured prints as "—".
import { lockupH } from "@/brand/emblem";
import { BRAND } from "@/brand/svg";
import { LEVEL_LABEL, type Player } from "./store/types";
import type { HittingProfile } from "./profile";

const W = 1080;
const H = 1350;
const LIME = "#c4f135";
const WHITE = "#ffffff";
const TEXT2 = "#c6cace";
const STEEL = "#8d939a";
const LINE = "#262a2f";

/**
 * Draws the lockup straight from the logo geometry with Path2D. (Drawing it as an SVG image would "taint" the canvas
 * in Safari on iPhone, and then the report can't be saved as a picture.)
 */
function drawLockup(ctx: CanvasRenderingContext2D, x: number, y: number, height: number) {
  const art = lockupH();
  const k = height / art.h;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(k, k);
  for (const s of art.shapes) {
    ctx.fillStyle = s.role === "accent" ? BRAND.lime : s.role === "ink" ? BRAND.white : BRAND.carbon;
    ctx.fill(new Path2D(s.d));
  }
  ctx.restore();
}

/** The brand face as the page loaded it (next/font gives it a generated family name). */
function family() {
  return getComputedStyle(document.body).fontFamily || "Helvetica, Arial, sans-serif";
}

function fitText(ctx: CanvasRenderingContext2D, text: string, font: (px: number) => string, max: number, start: number) {
  let px = start;
  ctx.font = font(px);
  while (ctx.measureText(text).width > max && px > 24) {
    px -= 4;
    ctx.font = font(px);
  }
  return px;
}

/** A blank 1080 x 1350 Gapper card: carbon twill, light from the top left, the alloy edge, fonts loaded. */
export async function startCard() {
  const fam = family();
  if (document.fonts?.load) {
    await Promise.all([document.fonts.load(`italic 900 80px ${fam}`), document.fonts.load(`700 40px ${fam}`), document.fonts.load(`400 30px ${fam}`)]).catch(() => {});
  }
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!;
  const black = (px: number) => `italic 900 ${px}px ${fam}`;
  const bold = (px: number) => `700 ${px}px ${fam}`;
  const reg = (px: number) => `400 ${px}px ${fam}`;
  ctx.fillStyle = "#0b0c0e";
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.globalAlpha = 0.035;
  ctx.strokeStyle = WHITE;
  ctx.lineWidth = 3;
  for (let x = -H; x < W; x += 9) {
    ctx.beginPath();
    ctx.moveTo(x, H);
    ctx.lineTo(x + H, 0);
    ctx.stroke();
  }
  ctx.restore();
  const glow = ctx.createRadialGradient(200, -100, 0, 200, -100, 900);
  glow.addColorStop(0, "rgba(230,236,242,0.12)");
  glow.addColorStop(1, "rgba(230,236,242,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
  const alloy = ctx.createLinearGradient(0, 0, W, 0);
  alloy.addColorStop(0, "#7d848b");
  alloy.addColorStop(0.4, "#e6e9ec");
  alloy.addColorStop(0.6, "#9aa1a8");
  alloy.addColorStop(1, "rgba(125,132,139,0)");
  ctx.fillStyle = alloy;
  ctx.fillRect(0, 0, W, 5);
  return { c, ctx, black, bold, reg };
}

/** The card's footer line: OWN THE GAPS. BUILT FOR SLOWPITCH. and the domain. */
export function cardFooter(ctx: CanvasRenderingContext2D, black: (px: number) => string, bold: (px: number) => string) {
  const M = 72;
  ctx.fillStyle = LINE;
  ctx.fillRect(M, H - 118, W - M * 2, 2);
  ctx.font = black(30);
  ctx.fillStyle = WHITE;
  ctx.textAlign = "left";
  ctx.fillText("OWN THE GAPS.", M, H - 66);
  const ow = ctx.measureText("OWN THE GAPS.  ").width;
  ctx.fillStyle = LIME;
  ctx.fillText("BUILT FOR SLOWPITCH.", M + ow, H - 66);
  ctx.textAlign = "right";
  ctx.font = bold(26);
  ctx.fillStyle = TEXT2;
  ctx.fillText("getgapper.com", W - M, H - 66);
  ctx.textAlign = "left";
}

export { drawLockup, fitText, W as CARD_W, H as CARD_H };

export async function drawReport(player: Player, p: HittingProfile): Promise<HTMLCanvasElement> {
  const { c, ctx, black, bold, reg } = await startCard();

  const M = 72;
  // Header: the lockup and the date.
  drawLockup(ctx, M, 64, 62);
  ctx.textAlign = "right";
  ctx.fillStyle = STEEL;
  ctx.font = bold(24);
  ctx.fillText("PLAYER REPORT", W - M, 92);
  ctx.font = reg(24);
  ctx.fillText(new Date().toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }), W - M, 124);
  ctx.textAlign = "left";

  // Name and the line under it.
  const name = player.name.toUpperCase();
  const px = fitText(ctx, name, black, W - M * 2, 132);
  ctx.fillStyle = WHITE;
  ctx.fillText(name, M - 4, 220 + px * 0.6);
  const facts = [`Bats ${player.hand === "R" ? "right" : "left"}`, `${Math.floor(player.heightIn / 12)}′${player.heightIn % 12}″`, player.level ? LEVEL_LABEL[player.level] : null, player.positions?.length ? player.positions.join(", ") : null]
    .filter(Boolean)
    .join("  ·  ");
  ctx.font = reg(30);
  ctx.fillStyle = TEXT2;
  ctx.fillText(facts, M, 300 + px * 0.6);

  // The score: the outfield gauge from the logo, lit to the score.
  const top = 400;
  const cx = M + 190;
  const cy = top + 230;
  const a0 = 198;
  const a1 = 342;
  const gap = 4;
  const span = (a1 - a0 - gap * 3) / 4;
  const rad = (d: number) => (d * Math.PI) / 180;
  const score = p.avgScore;
  const at = score === null ? a0 : a0 + ((a1 - a0) * score) / 100;
  for (let i = 0; i < 4; i++) {
    const from = a0 + i * (span + gap);
    const to = from + span;
    const seg = (f: number, t: number, color: string) => {
      ctx.beginPath();
      ctx.arc(cx, cy, 190, rad(f), rad(t));
      ctx.arc(cx, cy, 136, rad(t), rad(f), true);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
    };
    seg(from, to, "#24282d");
    if (at > from) seg(from, Math.min(to, at), LIME);
  }
  ctx.textAlign = "center";
  ctx.fillStyle = WHITE;
  ctx.font = black(150);
  ctx.fillText(score === null ? "—" : String(score), cx, cy + 30);
  ctx.font = bold(22);
  ctx.fillStyle = STEEL;
  ctx.fillText("GAPPER SCORE · AVERAGE", cx, cy + 72);
  ctx.textAlign = "left";

  // The line: key numbers, each with where it came from.
  const rows: [string, string, string][] = [
    ["Front foot on time", p.footOnTime === null ? "—" : `${p.footOnTime}%`, "estimated"],
    ["Repeatability", p.repeatability === null ? "—" : String(p.repeatability), "measured"],
    ["Line-drive rate", p.lineDriveRate === null ? "—" : `${p.lineDriveRate}%`, p.tagged ? `${p.tagged} tagged` : "from tags"],
    ["Top exit velo", p.topEv ? `${Math.round(p.topEv.v)} mph` : "—", p.topEv ? (p.topEv.source === "sensor" ? "sensor" : `slo-mo${p.topEv.pm ? ` ± ${Math.round(p.topEv.pm)}` : ""}`) : "slo-mo only"],
    ["Swings · best", `${p.swings} · ${p.bestScore ?? "—"}`, `${p.sessions} sessions`],
  ];
  const rx = M + 430;
  let ry = top + 40;
  for (const [k, v, src] of rows) {
    ctx.font = reg(26);
    ctx.fillStyle = TEXT2;
    ctx.fillText(k, rx, ry);
    ctx.font = reg(20);
    ctx.fillStyle = STEEL;
    ctx.fillText(src, rx, ry + 28);
    ctx.textAlign = "right";
    ctx.font = black(48);
    ctx.fillStyle = WHITE;
    ctx.fillText(v, W - M, ry + 22);
    ctx.textAlign = "left";
    ctx.fillStyle = LINE;
    ctx.fillRect(rx, ry + 46, W - M - rx, 2);
    ry += 82;
  }

  // Strengths and what to work on.
  let y = 930;
  ctx.fillStyle = LINE;
  ctx.fillRect(M, y - 50, W - M * 2, 2);
  const col = (title: string, items: { label: string; avg: number }[], x: number, color: string) => {
    ctx.font = bold(22);
    ctx.fillStyle = STEEL;
    ctx.fillText(title, x, y);
    items.forEach((it, i) => {
      ctx.font = black(44);
      ctx.fillStyle = WHITE;
      ctx.fillText(it.label.toUpperCase(), x, y + 58 + i * 60);
      const w = ctx.measureText(it.label.toUpperCase()).width;
      ctx.font = bold(30);
      ctx.fillStyle = color;
      ctx.fillText(String(it.avg), x + w + 16, y + 58 + i * 60);
    });
    if (!items.length) {
      ctx.font = reg(26);
      ctx.fillStyle = STEEL;
      ctx.fillText("Needs a few more swings", x, y + 50);
    }
  };
  col("STRENGTHS", p.strengths, M, LIME);
  col("WORKING ON", p.workOns, W / 2 + 10, "#ef4b47");

  // The drill.
  y = 1130;
  if (p.drills[0]) {
    ctx.font = bold(22);
    ctx.fillStyle = STEEL;
    ctx.fillText("CURRENT DRILL", M, y);
    ctx.font = bold(34);
    ctx.fillStyle = WHITE;
    ctx.fillText(p.drills[0].drill.name, M, y + 46);
  }

  // Footer.
  ctx.fillStyle = LINE;
  ctx.fillRect(M, H - 118, W - M * 2, 2);
  ctx.font = black(30);
  ctx.fillStyle = WHITE;
  ctx.fillText("OWN THE GAPS.", M, H - 66);
  const ow = ctx.measureText("OWN THE GAPS.  ").width;
  ctx.fillStyle = LIME;
  ctx.fillText("BUILT FOR SLOWPITCH.", M + ow, H - 66);
  ctx.textAlign = "right";
  ctx.font = bold(26);
  ctx.fillStyle = TEXT2;
  ctx.fillText("getgapper.com", W - M, H - 66);
  ctx.textAlign = "left";
  return c;
}

/** The report as a PNG blob. */
export async function reportBlob(player: Player, p: HittingProfile): Promise<Blob> {
  const c = await drawReport(player, p);
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("Could not draw the report"))), "image/png"));
}
