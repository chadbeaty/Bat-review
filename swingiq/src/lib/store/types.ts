import type { ExternalMeasurement } from "@/engine/external";
import type { CameraView, Handedness, ManualHitTag, PoseFrame, SwingAnalysis } from "@/engine/types";
import type { ModelQuality } from "@/live/pose";
import type { VoiceFrequency } from "@/live/voice";

export type Player = {
  id: string;
  name: string;
  hand: Handedness;
  heightIn: number;
  createdAt: number;
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
  createdAt: number;
};

export type Session = {
  id: string;
  playerId: string;
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
  keepClips: boolean;
};

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
  keepClips: true,
};
