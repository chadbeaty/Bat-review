import type { Handedness } from "@/engine/types";
import type { AppMode, AssumedField, Player, Settings } from "./store/types";

/**
 * Just Hit guests: a hitter made with no questions, so the first swing is two taps away. The analyzer still needs a
 * height (pixels → inches) and a batting side (which leg is the front leg), so a guest starts on these defaults and
 * every swing they record is labelled "Estimated" until the real values are in.
 *
 * - Height: 5'9", about the middle of adult slow-pitch players. Inch and mph numbers scale with it, so a hitter
 *   4 inches off reads about 6% off. Scores, timing and the legs-and-feet faults don't use height.
 * - Bats: right. Side-view swings also check this from the swing itself (engine/handedness.ts), and a lefty's swing
 *   is re-read as a lefty's.
 */
export const GUEST_DEFAULTS = { name: "Guest", heightIn: 69, hand: "R" as Handedness };

export function newGuest(id: string, now = Date.now()): Player {
  return {
    id,
    name: GUEST_DEFAULTS.name,
    hand: GUEST_DEFAULTS.hand,
    heightIn: GUEST_DEFAULTS.heightIn,
    createdAt: now,
    remoteId: null,
    guest: true,
    assumed: ["heightIn", "hand"],
  };
}

/** Results for this hitter are estimates: something the analyzer uses is still a default. */
export function isEstimated(p: Pick<Player, "assumed">): boolean {
  return (p.assumed?.length ?? 0) > 0;
}

/** One question at a time, most useful first: height sharpens every inch and mph number; then side; then a name. */
export type ProfileQuestion = "heightIn" | "hand" | "name";

export function nextQuestion(p: Player): ProfileQuestion | null {
  if (p.assumed?.includes("heightIn")) return "heightIn";
  if (p.assumed?.includes("hand")) return "hand";
  if (p.name === GUEST_DEFAULTS.name && (p.guest || p.assumed !== undefined)) return "name";
  return null;
}

type Answer = { field: "heightIn"; value: number } | { field: "hand"; value: Handedness } | { field: "name"; value: string };

/**
 * Saves one answer and turns the guest into a normal hitter. Same id, so every swing they've recorded stays theirs.
 * Fields they haven't answered stay on the defaults (and stay listed in `assumed`).
 */
export function answerQuestion(p: Player, a: Answer): Player {
  const assumed = (p.assumed ?? []).filter((f) => f !== a.field);
  const next: Player = { ...p, guest: false, assumed };
  if (a.field === "heightIn") next.heightIn = Math.round(a.value);
  if (a.field === "hand") next.hand = a.value;
  if (a.field === "name") next.name = a.value.trim().slice(0, 40) || p.name;
  return next;
}

/** A side read from the guest's own swing: use it, but keep it on the list to confirm. */
export function withInferredHand(p: Player, hand: Handedness): Player {
  return p.hand === hand ? p : { ...p, hand };
}

/**
 * Which home the app opens on. An explicit choice in settings wins. Otherwise new hitters and guests get Just Hit,
 * and hitters who set up the full profile before Just Hit existed keep the dashboard they know.
 */
export function appMode(settings: Pick<Settings, "appMode">, player: Player | null): AppMode {
  if (settings.appMode) return settings.appMode;
  if (!player) return "simple";
  return player.guest || isEstimated(player) ? "simple" : "full";
}

/** Height entry: feet and inches → inches, or null when it's outside what the profile form accepts. */
export function parseHeight(ft: string, inch: string): number | null {
  const h = Number(ft) * 12 + Number(inch || 0);
  return Number.isFinite(h) && ft !== "" && h >= 48 && h <= 90 ? h : null;
}

export const ASSUMED_LABEL: Record<AssumedField, string> = { heightIn: "height", hand: "batting side" };
