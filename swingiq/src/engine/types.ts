// Core data shapes shared by the live engine, storage and UI. The engine is plain TypeScript with no browser APIs so
// the same code can run in tests, in a worker, or be ported to the native iOS app.

/** One body point. x and y are 0–1 across the image (y down). z is relative depth. v is visibility 0–1. */
export type Landmark = { x: number; y: number; z: number; v: number };

/** 3D point in meters, centered between the hips (MediaPipe "world" landmarks). */
export type WorldLandmark = { x: number; y: number; z: number; v: number };

export type PoseFrame = {
  /** Milliseconds, from the camera clock (monotonic within a session). */
  t: number;
  /** 33 image landmarks, or null when no person was found. */
  lm: Landmark[] | null;
  /** 33 world landmarks, when the model provided them. */
  world?: WorldLandmark[] | null;
};

/** Camera placement. "side" faces the batter's chest; "behind" is the catcher's view; "front" is the pitcher's view. */
export type CameraView = "side" | "behind" | "front";
export type Handedness = "R" | "L";

export type FrameGeometry = { width: number; height: number };

export type SwingPhaseName = "stance" | "load" | "stride" | "launch" | "contact" | "finish";

export type SwingPhases = {
  /** Times in ms on the session clock. Any phase the footage couldn't support is null. */
  stanceStart: number;
  loadStart: number | null;
  strideStart: number | null;
  footPlant: number | null;
  launch: number;
  contact: number;
  finish: number;
  /** How contact time was found. */
  contactSource: "audio" | "pose";
};

/**
 * Where a number came from. Never show a number without this.
 * - measured: counted or timed directly (swing count, mic contact time)
 * - cv_estimated: derived from body tracking; has a confidence
 * - sensor: from an external device (radar, bat sensor), including manual entry from one
 * - unavailable: the footage can't support it; `reason` says why
 */
export type MetricSource = "measured" | "cv_estimated" | "sensor" | "unavailable";

export type MetricKey =
  | "swingTime"
  | "loadTime"
  | "tempoRatio"
  | "handSpeed"
  | "batSpeed"
  | "exitVelocity"
  | "launchAngle"
  | "attackAngle"
  | "strideLength"
  | "strideTiming"
  | "headMovement"
  | "handDrop"
  | "weightShift"
  | "balance"
  | "hipTurn"
  | "shoulderTurn"
  | "separation"
  | "sequence"
  | "contact"
  | "timingStyle"
  | "frontLegBlock"
  | "backKnee"
  | "backHeel"
  | "strideDirection"
  | "hipLead"
  | "frontFootSlide"
  | "handCast"
  | "handPathAngle"
  | "contactPoint"
  | "finishHeight"
  | "shoulderDrop"
  | "pitchSpeed"
  | "descentAngle";

export type MetricValue = {
  key: MetricKey;
  source: MetricSource;
  /** null when unavailable. */
  value: number | null;
  /** Human text for non-numeric values (e.g. "Hips → shoulders → hands"). */
  text?: string;
  /** 0–1. How much to trust the number. */
  confidence: number;
  /** Why it's unavailable or low-confidence, in plain words. */
  reason?: string;
  /** A supporting number used by scoring and challenges (e.g. stance-to-plant width ratio for stride). */
  aux?: number;
  /** ± uncertainty in the same units (about one standard deviation), for measured speeds and angles. */
  plusMinus?: number;
  /**
   * How the number was produced, for speeds and angles: e.g. "ball tracking" for exit velo, "barrel tracking" for a
   * bat speed measured from the bat itself, "from exit velo" for the collision-formula fallback.
   */
  method?: "ball tracking" | "barrel tracking" | "from exit velo";
};

export type ScoreCategoryKey = "balance" | "timing" | "rotation" | "batPath" | "contact" | "followThrough";

export type ScoreBreakdown = {
  /** 0–100: average of the categories the footage supported. */
  overall: number | null;
  /** The individual checks, each tied to one measured metric. */
  components: { key: string; label: string; score: number; weight: number; category?: ScoreCategoryKey; metric?: MetricKey }[];
  /** Balance, Timing, Rotation, Bat path, Contact, Follow-through. null score = nothing measurable for it. */
  categories?: { key: ScoreCategoryKey; label: string; score: number | null; inputs: string[]; reason?: string }[];
};

export type CueTone = "fix" | "praise" | "info";

export type Cue = {
  id: string;
  tone: CueTone;
  /** One sentence for the result card. */
  text: string;
  /** Two to five words for voice. */
  spoken: string;
  /** Metric that triggered it, for "why am I seeing this". */
  basedOn: MetricKey[];
};

export type QualityReport = {
  /** Pose frames per second actually processed during the swing. */
  poseFps: number;
  /** Camera frames per second reported by the camera. */
  cameraFps: number;
  /** Average visibility of the key joints during the swing (0–1). */
  visibility: number;
  /** Were feet visible for most of the swing? */
  feetVisible: boolean;
  /** Was height calibration available (player height known)? */
  calibrated: boolean;
};

export type SwingAnalysis = {
  phases: SwingPhases;
  metrics: Partial<Record<MetricKey, MetricValue>>;
  score: ScoreBreakdown;
  cue: Cue;
  /** Other observations, ranked; the first is `cue`. */
  observations: Cue[];
  quality: QualityReport;
  /** Hand path in image coordinates, for overlays. */
  handPath: { t: number; x: number; y: number }[];
  /** Tracked bat per frame (0–1 image coordinates): hands, barrel end and sweet spot. High-frame-rate videos only. */
  batPath?: { t: number; hx: number; hy: number; tx: number; ty: number; sx: number; sy: number }[];
};

export type HitDirection = "pull" | "center" | "oppo";
export type HitType = "grounder" | "liner" | "fly" | "popup" | "miss" | "foul";

export type ManualHitTag = { direction?: HitDirection; type?: HitType };
