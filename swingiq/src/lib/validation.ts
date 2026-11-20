// Accuracy-testing export. Pairs Gapper's own camera readings with the reference readings a tester typed in on each
// swing page (radar gun, HitTrax, Rapsodo, Blast...), one row per swing, in the CSV format that
// scripts/validation-report.mjs scores. The camera values come from the swing's analysis, never from the typed-in
// sensor values, so the two columns are independent.
import type { MetricKey, MetricValue } from "@/engine/types";
import type { Bat, Session, SwingRecord } from "./store/types";

export const VALIDATION_COLUMNS = [
  "swing_id",
  "date",
  "device",
  "fps",
  "source",
  "view",
  "setting",
  "drill",
  "lighting",
  "distance_ft",
  "bat",
  "bat_length_in",
  "ref_device",
  "ref_ev_mph",
  "ref_bat_mph",
  "ref_launch_deg",
  "gapper_ev_mph",
  "gapper_ev_pm",
  "gapper_ev_conf",
  "gapper_bat_mph",
  "gapper_bat_pm",
  "gapper_bat_conf",
  "gapper_bat_method",
  "gapper_launch_deg",
  "gapper_launch_pm",
  "why_missing",
] as const;

type Row = Record<(typeof VALIDATION_COLUMNS)[number], string>;

function val(m: MetricValue | undefined) {
  return m && m.source !== "unavailable" && m.value !== null ? m : null;
}

export function validationRows(swings: SwingRecord[], sessions: Session[], bats: Bat[]): Row[] {
  const sess = new Map(sessions.map((s) => [s.id, s]));
  const batById = new Map(bats.map((b) => [b.id, b]));
  return swings.map((s) => {
    const m = s.analysis.metrics as Partial<Record<MetricKey, MetricValue>>;
    const ev = val(m.exitVelocity);
    const bat = val(m.batSpeed);
    const la = val(m.launchAngle);
    const ext = s.external ?? [];
    const ref = (k: string) => ext.find((e) => e.key === k);
    const session = sess.get(s.sessionId);
    const b = s.batId ? batById.get(s.batId) : undefined;
    const missing = [!ev && m.exitVelocity?.reason, !bat && m.batSpeed?.reason].filter(Boolean).join(" | ");
    return {
      swing_id: s.id,
      date: new Date(s.at).toISOString(),
      device: session?.notes?.startsWith("Gapper camera") ? "gapper-native" : "upload",
      fps: String(session?.cameraFps ?? ""),
      source: s.source ?? "",
      view: s.view,
      setting: "",
      drill: "",
      lighting: "",
      distance_ft: "",
      bat: b ? `${b.brand} ${b.model}`.trim() : "",
      bat_length_in: b?.lengthIn ? String(b.lengthIn) : "",
      ref_device: [ref("exitVelocity")?.device, ref("batSpeed")?.device].filter(Boolean).join(" / "),
      ref_ev_mph: ref("exitVelocity") ? String(ref("exitVelocity")!.value) : "",
      ref_bat_mph: ref("batSpeed") ? String(ref("batSpeed")!.value) : "",
      ref_launch_deg: ref("launchAngle") ? String(ref("launchAngle")!.value) : "",
      gapper_ev_mph: ev ? String(ev.value) : "",
      gapper_ev_pm: ev?.plusMinus !== undefined ? String(ev.plusMinus) : "",
      gapper_ev_conf: ev ? ev.confidence.toFixed(2) : "",
      gapper_bat_mph: bat ? String(bat.value) : "",
      gapper_bat_pm: bat?.plusMinus !== undefined ? String(bat.plusMinus) : "",
      gapper_bat_conf: bat ? bat.confidence.toFixed(2) : "",
      gapper_bat_method: bat?.method ?? "",
      gapper_launch_deg: la ? String(la.value) : "",
      gapper_launch_pm: la?.plusMinus !== undefined ? String(la.plusMinus) : "",
      why_missing: missing,
    };
  });
}

export function toCsv(rows: Row[]): string {
  const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return [VALIDATION_COLUMNS.join(","), ...rows.map((r) => VALIDATION_COLUMNS.map((c) => esc(r[c] ?? "")).join(","))].join("\n") + "\n";
}
