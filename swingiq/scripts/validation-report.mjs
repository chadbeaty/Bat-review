#!/usr/bin/env node
// Scores Gapper's speed readings against a reference device (radar, HitTrax, Rapsodo, Blast) on the same swings.
//
//   node scripts/validation-report.mjs accuracy.csv [more.csv ...] [--out report.md]
//
// Input: the CSV from Profile › "Export for accuracy testing" (columns in src/lib/validation.ts), with the setting,
// drill, lighting and distance columns filled in by the tester. Output: a Markdown report with, for exit velo, bat
// speed and launch angle:
//   MAE, RMSE, mean signed error (bias), error spread, 95% limits of agreement, success rate, false-positive rate,
//   ± calibration (share of readings inside their own ± band; ~68% means the ± is honest), and every number broken
//   down by device, frame rate, view, setting, drill, lighting, distance and bat-speed method.
// It also says plainly whether each engineering target is met. Targets are goals, not claims.
import { readFileSync, writeFileSync } from "node:fs";

const TARGETS = { ev: { mae: 3 }, bat: { mae: 3 }, validRate: 0.9 };
const MEASURES = [
  { key: "ev", label: "Exit velocity", unit: "mph", ref: "ref_ev_mph", got: "gapper_ev_mph", pm: "gapper_ev_pm", conf: "gapper_ev_conf" },
  { key: "bat", label: "Bat speed", unit: "mph", ref: "ref_bat_mph", got: "gapper_bat_mph", pm: "gapper_bat_pm", conf: "gapper_bat_conf" },
  { key: "launch", label: "Launch angle", unit: "°", ref: "ref_launch_deg", got: "gapper_launch_deg", pm: "gapper_launch_pm", conf: null },
];
const BREAKDOWNS = ["device", "fps", "view", "setting", "drill", "lighting", "distance_bucket", "gapper_bat_method"];

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ",") {
      row.push(cur);
      cur = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cur);
      cur = "";
      if (row.some((x) => x !== "")) rows.push(row);
      row = [];
    } else cur += c;
  }
  if (cur !== "" || row.length) {
    row.push(cur);
    rows.push(row);
  }
  const [head, ...body] = rows;
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), (r[i] ?? "").trim()])));
}

const num = (s) => (s === "" || s === undefined ? null : Number(s));
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

export function score(rows, m) {
  const withRef = rows.filter((r) => num(r[m.ref]) !== null);
  // A reading where the reference device saw nothing measurable (a miss, a foul tip): rows marked ref_device "none".
  const refNone = rows.filter((r) => num(r[m.ref]) === null && /none|miss/i.test(r.ref_device ?? ""));
  const pairs = withRef.filter((r) => num(r[m.got]) !== null);
  const errs = pairs.map((r) => num(r[m.got]) - num(r[m.ref]));
  const out = {
    nRef: withRef.length,
    nPaired: pairs.length,
    validRate: withRef.length ? pairs.length / withRef.length : null,
    falsePositives: refNone.filter((r) => num(r[m.got]) !== null).length,
    nNoRef: refNone.length,
  };
  if (!errs.length) return out;
  const abs = errs.map(Math.abs);
  const bias = mean(errs);
  const sd = Math.sqrt(errs.reduce((a, e) => a + (e - bias) ** 2, 0) / Math.max(1, errs.length - 1));
  const pms = pairs.map((r) => num(r[m.pm]));
  const withPm = pairs.map((r, i) => ({ e: Math.abs(errs[i]), pm: pms[i] })).filter((x) => x.pm !== null && x.pm > 0);
  Object.assign(out, {
    mae: mean(abs),
    rmse: Math.sqrt(mean(errs.map((e) => e * e))),
    bias,
    sd,
    loa: [bias - 1.96 * sd, bias + 1.96 * sd],
    maxAbs: Math.max(...abs),
    within1pm: withPm.length ? withPm.filter((x) => x.e <= x.pm).length / withPm.length : null,
    within2pm: withPm.length ? withPm.filter((x) => x.e <= 2 * x.pm).length / withPm.length : null,
  });
  if (m.conf) {
    const buckets = [
      ["high (≥0.7)", (c) => c >= 0.7],
      ["medium (0.4–0.7)", (c) => c >= 0.4 && c < 0.7],
      ["low (<0.4)", (c) => c < 0.4],
    ];
    out.byConfidence = buckets
      .map(([name, f]) => {
        const e = pairs.map((r, i) => ({ c: num(r[m.conf]), e: Math.abs(errs[i]) })).filter((x) => x.c !== null && f(x.c));
        return e.length ? { name, n: e.length, mae: mean(e.map((x) => x.e)) } : null;
      })
      .filter(Boolean);
  }
  return out;
}

function fmt(x, d = 1) {
  return x === null || x === undefined || Number.isNaN(x) ? "—" : Number(x).toFixed(d);
}
const pct = (x) => (x === null || x === undefined ? "—" : `${Math.round(x * 100)}%`);

function report(rows) {
  rows.forEach((r) => {
    const d = num(r.distance_ft);
    r.distance_bucket = d === null ? "" : d < 10 ? "under 10 ft" : d <= 14 ? "10–14 ft" : "over 14 ft";
  });
  const L = ["# Gapper accuracy report", "", `Swings: ${rows.length}. Generated ${new Date().toISOString().slice(0, 10)}.`, ""];
  L.push("Targets are engineering goals (MAE ≤ 3 mph for exit velo and bat speed, ≥ 90% valid readings in supported conditions). Nothing here is a marketing claim until the sample is large and varied enough.", "");
  for (const m of MEASURES) {
    const s = score(rows, m);
    L.push(`## ${m.label}`, "");
    if (!s.nRef) {
      L.push("No reference readings yet.", "");
      continue;
    }
    L.push("| | |", "| --- | --- |");
    L.push(`| Swings with a reference reading | ${s.nRef} |`);
    L.push(`| Gapper gave a reading (success rate) | ${s.nPaired} (${pct(s.validRate)}) |`);
    L.push(`| Mean absolute error | ${fmt(s.mae)} ${m.unit} |`);
    L.push(`| Root mean square error | ${fmt(s.rmse)} ${m.unit} |`);
    L.push(`| Mean signed error (bias; + = Gapper reads high) | ${fmt(s.bias)} ${m.unit} |`);
    L.push(`| Error spread (SD) | ${fmt(s.sd)} ${m.unit} |`);
    L.push(`| 95% limits of agreement | ${s.loa ? `${fmt(s.loa[0])} to ${fmt(s.loa[1])} ${m.unit}` : "—"} |`);
    L.push(`| Worst miss | ${fmt(s.maxAbs)} ${m.unit} |`);
    L.push(`| Inside its own ± (honest ≈ 68%) | ${pct(s.within1pm)} |`);
    L.push(`| Inside 2× its ± (honest ≈ 95%) | ${pct(s.within2pm)} |`);
    L.push(`| False readings (reference saw nothing) | ${s.falsePositives} of ${s.nNoRef} |`);
    L.push("");
    const t = TARGETS[m.key];
    if (t) {
      const maeOk = s.mae !== undefined && s.mae <= t.mae;
      const rateOk = s.validRate !== null && s.validRate >= TARGETS.validRate;
      if (s.nPaired < 50) L.push(`Targets (MAE ≤ ${t.mae} ${m.unit}, success ≥ ${pct(TARGETS.validRate)}): **not enough data to call** (${s.nPaired} paired swings; need 50+ across players and conditions).`, "");
      else L.push(`Target MAE ≤ ${t.mae} ${m.unit}: **${maeOk ? "met on this sample" : "not yet"}**. Target success rate ≥ ${pct(TARGETS.validRate)}: **${rateOk ? "met on this sample" : "not yet"}**.`, "");
    }
    if (s.byConfidence?.length) {
      L.push("Error by Gapper's own confidence (should drop as confidence rises):", "", "| Confidence | Swings | MAE |", "| --- | --- | --- |");
      for (const b of s.byConfidence) L.push(`| ${b.name} | ${b.n} | ${fmt(b.mae)} ${m.unit} |`);
      L.push("");
    }
    for (const k of BREAKDOWNS) {
      const vals = [...new Set(rows.map((r) => r[k]).filter(Boolean))];
      if (vals.length < 1) continue;
      const lines = vals
        .map((v) => {
          const sub = score(rows.filter((r) => r[k] === v), m);
          return sub.nRef ? `| ${v} | ${sub.nRef} | ${pct(sub.validRate)} | ${fmt(sub.mae)} | ${fmt(sub.bias)} |` : null;
        })
        .filter(Boolean);
      if (!lines.length) continue;
      L.push(`By ${k.replace(/_/g, " ")}:`, "", "| | Swings | Success | MAE | Bias |", "| --- | --- | --- | --- | --- |", ...lines, "");
    }
  }
  return L.join("\n");
}

function main(argv) {
  const files = [];
  let out = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--out") out = argv[++i];
    else files.push(argv[i]);
  }
  if (!files.length) {
    console.error("usage: node scripts/validation-report.mjs accuracy.csv [more.csv ...] [--out report.md]");
    process.exit(2);
  }
  const rows = files.flatMap((f) => parseCsv(readFileSync(f, "utf8")));
  const md = report(rows);
  if (out) writeFileSync(out, md);
  else process.stdout.write(md + "\n");
}

if (import.meta.url === `file://${process.argv[1]}`) main(process.argv.slice(2));
export { parseCsv, report };
