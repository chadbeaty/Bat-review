// The work report: proof of the reps. One 1080 x 1350 card for a swing goal: swings logged against the goal, the
// days and sessions they came from, and the scores. Every number comes from swings Gapper recorded on this phone.
import { CARD_W as W, cardFooter, drawLockup, fitText, startCard } from "./report";
import { PERIOD_LABEL, windowLabel, type GoalProgress } from "./goals";
import type { Player, SwingGoal } from "./store/types";

const LIME = "#c4f135";
const WHITE = "#ffffff";
const TEXT2 = "#c6cace";
const STEEL = "#8d939a";
const LINE = "#262a2f";

export async function workReportBlob(player: Player, goal: SwingGoal, p: GoalProgress): Promise<Blob> {
  const { c, ctx, black, bold, reg } = await startCard();
  const M = 72;
  drawLockup(ctx, M, 64, 62);
  ctx.textAlign = "right";
  ctx.fillStyle = STEEL;
  ctx.font = bold(24);
  ctx.fillText("WORK REPORT", W - M, 92);
  ctx.font = reg(24);
  ctx.fillText(windowLabel(goal), W - M, 124);
  ctx.textAlign = "left";

  // Name.
  const name = player.name.toUpperCase();
  const px = fitText(ctx, name, black, W - M * 2, 112);
  ctx.fillStyle = WHITE;
  ctx.fillText(name, M - 4, 200 + px * 0.6);
  ctx.font = reg(30);
  ctx.fillStyle = TEXT2;
  ctx.fillText(`Goal: ${goal.target} swings · ${PERIOD_LABEL[goal.period].toLowerCase()}`, M, 270 + px * 0.6);

  // The count.
  const y0 = 440;
  ctx.font = black(230);
  ctx.fillStyle = p.met ? LIME : WHITE;
  const doneTxt = String(p.done);
  ctx.fillText(doneTxt, M - 8, y0 + 150);
  const dw = ctx.measureText(doneTxt).width;
  ctx.font = black(72);
  ctx.fillStyle = STEEL;
  ctx.fillText(`/ ${goal.target}`, M + dw + 18, y0 + 150);
  ctx.font = bold(26);
  ctx.fillText("SWINGS", M + dw + 22, y0 + 58);

  // Progress bar.
  const by = y0 + 200;
  ctx.fillStyle = "#24282d";
  ctx.fillRect(M, by, W - M * 2, 22);
  ctx.fillStyle = LIME;
  ctx.fillRect(M, by, ((W - M * 2) * p.pct) / 100, 22);

  // Stamp.
  if (p.met) {
    ctx.save();
    ctx.translate(W - M - 150, y0 + 40);
    ctx.rotate((-8 * Math.PI) / 180);
    ctx.strokeStyle = LIME;
    ctx.lineWidth = 6;
    ctx.strokeRect(-150, -48, 300, 96);
    ctx.font = black(48);
    ctx.fillStyle = LIME;
    ctx.textAlign = "center";
    ctx.fillText("GOAL MET", 0, 17);
    ctx.restore();
    ctx.textAlign = "left";
  } else {
    ctx.font = bold(28);
    ctx.fillStyle = TEXT2;
    ctx.textAlign = "right";
    ctx.fillText(p.ended ? `${goal.target - p.done} short` : `${goal.target - p.done} to go`, W - M, by - 22);
    ctx.textAlign = "left";
  }

  // Swings per day.
  const cy = 860;
  ctx.font = bold(22);
  ctx.fillStyle = STEEL;
  ctx.fillText("SWINGS BY DAY", M, cy);
  const days = p.days.slice(-7);
  const maxN = Math.max(1, ...days.map((d) => d.n));
  const colW = (W - M * 2) / days.length;
  days.forEach((d, i) => {
    const x = M + i * colW;
    const h = (d.n / maxN) * 120;
    ctx.fillStyle = d.n ? (i === days.length - 1 && !p.ended ? LIME : "rgba(214,220,226,0.55)") : "#24282d";
    ctx.fillRect(x + 8, cy + 170 - Math.max(4, h), colW - 16, Math.max(4, h));
    ctx.textAlign = "center";
    ctx.font = bold(24);
    ctx.fillStyle = WHITE;
    if (d.n) ctx.fillText(String(d.n), x + colW / 2, cy + 160 - Math.max(4, h));
    ctx.font = reg(22);
    ctx.fillStyle = STEEL;
    ctx.fillText(new Date(d.day).toLocaleDateString(undefined, { weekday: "short" }), x + colW / 2, cy + 205);
    ctx.textAlign = "left";
  });

  // Line of stats.
  const sy = 1135;
  ctx.fillStyle = LINE;
  ctx.fillRect(M, sy - 50, W - M * 2, 2);
  const stats: [string, string][] = [
    ["SESSIONS", String(p.sessions)],
    ["AVG SCORE", p.avgScore === null ? "—" : String(p.avgScore)],
    ["BEST", p.bestScore === null ? "—" : String(p.bestScore)],
  ];
  const sw = (W - M * 2) / stats.length;
  stats.forEach(([k, v], i) => {
    ctx.font = bold(22);
    ctx.fillStyle = STEEL;
    ctx.fillText(k, M + i * sw, sy);
    ctx.font = black(60);
    ctx.fillStyle = WHITE;
    ctx.fillText(v, M + i * sw, sy + 66);
  });

  cardFooter(ctx, black, bold);
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("Could not draw the report"))), "image/png"));
}
