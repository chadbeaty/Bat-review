import type { ExternalMeasurement } from "@/engine/external";
import type { CameraView, Handedness, ManualHitTag, PoseFrame, SwingAnalysis } from "@/engine/types";
import type { ModelQuality } from "@/live/pose";
import type { VoiceFrequency } from "@/live/voice";

export type PlayingLevel = "rec" | "league" | "competitive" | "tournament" | "senior";
export type Position = "P" | "C" | "1B" | "2B" | "3B" | "SS" | "LF" | "LCF" | "RCF" | "RF" | "Rover" | "EH" | "Utility";
export type HittingGoal = "power" | "liners" | "consistency" | "oppo" | "fewerPopups" | "fewerGrounders" | "timing";

export const LEVEL_LABEL: Record<PlayingLevel, string> = {
  rec: "Recreational",
  league: "League",
  competitive: "Competitive (C/D)",
  tournament: "Tournament (A/B and up)",
  senior: "Senior",
};
export const POSITIONS: Position[] = ["P", "C", "1B", "2B", "3B", "SS", "LF", "LCF", "RCF", "RF", "Rover", "EH", "Utility"];
export const GOAL_LABEL: Record<HittingGoal, string> = {
  power: "More power",
  liners: "More line drives",
  consistency: "More consistent",
  oppo: "Hit to the opposite field",
  fewerPopups: "Fewer pop-ups",
  fewerGrounders: "Fewer ground balls",
  timing: "Better timing",
};

export type Player = {
  id: string;
  name: string;
  hand: Handedness;
  heightIn: number;
  createdAt: number;
  level?: PlayingLevel;
  positions?: Position[];
  goals?: HittingGoal[];
  /** Supabase player_profiles.id once synced. */
  remoteId?: string | null;
};

export type Bat = {
  id: string;
  playerId: string;
  brand: string;
  model: string;
  lengthIn: number | null;
  weightOz: number | null;
  certification: string;
  /** Balance class: where the weight sits. */
  balance?: BatBalance;
  /** The player's own photo of this bat (shrunk JPEG), kept on the device only. */
  photo?: Blob | null;
  createdAt: number;
};

export type BatBalance = "balanced" | "half-end" | "end-loaded" | "unknown";
export const BALANCE_LABEL: Record<BatBalance, string> = {
  balanced: "Balanced",
  "half-end": "Half-ounce end load",
  "end-loaded": "End-loaded (1 oz or more)",
  unknown: "Not sure",
};

export type Session = {
  id: string;
  playerId: string;
  /** "live" session or a processed "video". Older sessions have none (live). */
  kind?: "live" | "video";
  view: CameraView;
  startedAt: number;
  endedAt: number | null;
  swingCount: number;
  bestScore: number | null;
  avgScore: number | null;
  cameraFps: number;
  poseFps: number;
  batId: string | null;
  notes: string;
  syncedAt?: number | null;
};

export type SwingRecord = {
  id: string;
  sessionId: string;
  playerId: string;
  /** Swing number within its session (1-based). */
  n: number;
  at: number;
  view: CameraView;
  hand: Handedness;
  analysis: SwingAnalysis;
  /** Pose frames for the clip (rounded to save space). */
  pose: PoseFrame[];
  frameSize: { width: number; height: number };
  clipFrames: number;
  /** Bat used for this swing (from the session, changeable per swing). */
  batId?: string | null;
  /** "live": measured in real time during a live session. "video": processed from a recorded or uploaded video, every frame. */
  source?: "live" | "video";
  /** For processed videos: slow-motion factor the user set (1 = real speed). */
  slowMo?: number;
  /** Player marked this as their personal best / model swing. */
  pb?: boolean;
  tag?: ManualHitTag;
  note?: string;
  external?: ExternalMeasurement[];
  syncedAt?: number | null;
};

/** JPEG frames of one swing clip, stored separately so lists stay fast. */
export type ClipRecord = { swingId: string; frames: { t: number; blob: Blob }[] };

export type Settings = {
  activePlayerId: string | null;
  voiceOn: boolean;
  voiceURI: string | null;
  voiceFrequency: VoiceFrequency;
  /** Quiet mode: no voice, no sounds, results only on screen. */
  quiet: boolean;
  micOn: boolean;
  modelQuality: ModelQuality;
  lastView: CameraView;
  advancedView: boolean;
  /** Live mode: big after-swing readout (gap, score, cue) sized to read from the plate. */
  scoreboard: boolean;
  keepClips: boolean;
  /** Live mode: the camera the hitter picked for each view. Unset means the default for that view. */
  cameraFacing: Partial<Record<CameraView, CameraFacing>>;
};

export type CameraFacing = "environment" | "user";

/**
 * Side and front views face the hitter, so the front (selfie) camera lets them read the screen
 * between swings. From behind, the screen faces away either way, so use the sharper back camera.
 */
export function defaultFacing(view: CameraView): CameraFacing {
  return view === "behind" ? "environment" : "user";
}

export const DEFAULT_SETTINGS: Settings = {
  activePlayerId: null,
  voiceOn: true,
  voiceURI: null,
  voiceFrequency: "every",
  quiet: false,
  micOn: true,
  modelQuality: "full",
  lastView: "side",
  advancedView: false,
  scoreboard: true,
  keepClips: true,
  cameraFacing: {},
};
