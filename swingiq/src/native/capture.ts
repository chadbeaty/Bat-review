// Bridge between the Gapper web app and the native iOS capture engine (ios/ GapperCapture plugin).
//
// Gapper stays a web app. When it runs inside the Gapper iOS shell (Capacitor), this module finds the native
// "GapperCapture" plugin, which records with AVFoundation at 120/240 fps and hands back the video file plus a sidecar
// with the true timestamp of every frame, dropped frames, exposure, ISO, lens intrinsics and the phone's level. In a
// normal browser `nativeCapture()` returns null and the app falls back to uploads and live mode.
//
// No @capacitor/core import on purpose: the native shell injects `window.Capacitor`, and the web build stays free of
// native dependencies. The full contract is documented in docs/speed/NATIVE-BRIDGE.md; keep the two in step.

export type SetupCheckId = "frameRate" | "light" | "shutter" | "steady" | "level" | "framing" | "ballRoom" | "thermal";

export type SetupCheck = {
  id: SetupCheckId;
  status: "ok" | "warn" | "fail";
  /** Plain-language message for the player. */
  message: string;
  /** Raw value behind it (fps, lux-ish exposure index, deg/s, degrees…). */
  value?: number;
};

export type CaptureFormat = {
  width: number;
  height: number;
  fps: number;
  /** Which lens: the main wide camera is the default for measurement (least distortion, best light). */
  lens: "wide" | "ultraWide" | "telephoto";
  /** Shortest and longest shutter the format allows, seconds. */
  minExposureS: number;
  maxExposureS: number;
  hevc: boolean;
};

export type CaptureIntrinsics = {
  /** Focal lengths and principal point in pixels of the RECORDED video (same orientation as the file plays). */
  fx: number;
  fy: number;
  cx: number;
  cy: number;
  width: number;
  height: number;
  /** "per-frame" when AVFoundation delivered the camera's intrinsic matrix; "field-of-view" when computed from the format's FOV. */
  source: "per-frame" | "field-of-view";
};

export type NativeCaptureMeta = {
  version: 1;
  /** Hardware model, e.g. "iPhone16,1". */
  device: string;
  format: CaptureFormat;
  orientation: "landscape" | "portrait";
  /** Presentation time of every frame written to the file, seconds from the first frame. */
  frameTimes: number[];
  /** Frames the camera produced but couldn't deliver (late or out of buffers), seconds from the first frame. */
  droppedFrames: { t: number; reason: string }[];
  /** Real frame rate over the clip (frames written / duration). Phones quietly drop below 240 when hot. */
  measuredFps: number;
  exposureS: { median: number; max: number };
  iso: { median: number; max: number };
  intrinsics: CaptureIntrinsics | null;
  /** Gravity in camera coordinates (x right, y down, z out of the lens), averaged while recording. */
  gravity: { x: number; y: number; z: number } | null;
  /** Phone motion while recording, from the gyroscope. */
  stability: { maxRotationDegS: number; moved: boolean };
  /** Times (seconds) where the native swing detector saw a burst of motion in the batting zone or heard contact. */
  swingMarks: number[];
  setupChecks: SetupCheck[];
};

export type NativeRecording = {
  /** URL the web view can load (Capacitor converts the file path). */
  url: string;
  /** Native file path, for sharing or deleting. */
  path: string;
  durationS: number;
  meta: NativeCaptureMeta;
};

export type StartOptions = {
  /** Preferred frame rate: 240 when the phone has it, else 120. */
  fps?: 240 | 120;
  /** Shorter shutter means less blur on the bat and ball; native raises ISO to compensate and warns when it can't. */
  maxExposureS?: number;
  lens?: "wide" | "ultraWide";
  orientation?: "landscape" | "portrait";
};

export type PreviewState = {
  format: CaptureFormat;
  checks: SetupCheck[];
  /** Current exposure and ISO, for the light meter. */
  exposureS: number;
  iso: number;
  /** Degrees of tilt from level (0 = phone upright and level). */
  tiltDeg: number;
  rollDeg: number;
  thermal: "nominal" | "fair" | "serious" | "critical";
};

type Listener = { remove: () => Promise<void> };

export type GapperCapturePlugin = {
  /** Lists the formats this phone supports at 120 fps and up. */
  formats(): Promise<{ formats: CaptureFormat[]; device: string }>;
  /** Opens the camera full screen behind the web view and starts the live setup checks. */
  startPreview(o: StartOptions): Promise<PreviewState>;
  stopPreview(): Promise<void>;
  startRecording(): Promise<void>;
  stopRecording(): Promise<NativeRecording>;
  /** Locks focus and exposure on a point (0–1 coordinates), e.g. the plate. */
  lockFocus(o: { x: number; y: number }): Promise<void>;
  deleteRecording(o: { path: string }): Promise<void>;
  addListener(event: "previewState", cb: (s: PreviewState) => void): Promise<Listener>;
  addListener(event: "swingMark", cb: (m: { t: number; kind: "motion" | "audio" }) => void): Promise<Listener>;
};

type CapacitorGlobal = {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
  registerPlugin?: <T>(name: string) => T;
  isPluginAvailable?: (name: string) => boolean;
};

let cached: GapperCapturePlugin | null | undefined;

/** The native capture plugin when running in the Gapper iOS app, otherwise null. */
export function nativeCapture(): GapperCapturePlugin | null {
  if (cached !== undefined) return cached;
  if (typeof window === "undefined") return null;
  const cap = (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor;
  const ok = !!cap?.isNativePlatform?.() && cap?.getPlatform?.() === "ios" && !!cap.registerPlugin && (cap.isPluginAvailable?.("GapperCapture") ?? true);
  cached = ok ? cap!.registerPlugin!<GapperCapturePlugin>("GapperCapture") : null;
  return cached;
}

/** Snaps a decoded video's media time (seconds) to the frame's true capture time, using the sidecar. */
export function frameTimeSnapper(meta: Pick<NativeCaptureMeta, "frameTimes">) {
  const ts = meta.frameTimes;
  const gaps = ts.slice(1).map((t, i) => t - ts[i]).sort((a, b) => a - b);
  const gap = gaps.length ? gaps[Math.floor(gaps.length / 2)] : 1 / 240;
  return (mediaS: number): number | null => {
    if (!ts.length) return null;
    let lo = 0;
    let hi = ts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (ts[mid] < mediaS) lo = mid + 1;
      else hi = mid;
    }
    let best = lo;
    if (lo > 0 && Math.abs(ts[lo - 1] - mediaS) < Math.abs(ts[lo] - mediaS)) best = lo - 1;
    return Math.abs(ts[best] - mediaS) <= gap * 0.6 ? ts[best] : null;
  };
}

/**
 * Turns the sidecar into a go / no-go for speed measurement. A recording that can't support a trustworthy speed
 * says so up front, instead of quietly producing a number.
 */
export function captureQuality(meta: NativeCaptureMeta): { speedsOk: boolean; problems: string[] } {
  const problems: string[] = [];
  if (meta.measuredFps < 100) problems.push(`The camera only delivered ${Math.round(meta.measuredFps)} frames a second; speeds need at least 120. Let the phone cool down and close other apps.`);
  const dropShare = meta.frameTimes.length ? meta.droppedFrames.length / (meta.frameTimes.length + meta.droppedFrames.length) : 1;
  if (dropShare > 0.1) problems.push(`${Math.round(dropShare * 100)}% of frames were dropped. Close other apps; a hot phone drops frames.`);
  if (meta.stability.moved) problems.push("The phone moved while recording. Use a tripod or lean it against something solid.");
  if (meta.exposureS.median > 1 / 500) problems.push("The light was dim, so the shutter stayed slow and the bat blurs. Brighter light sharpens bat speed.");
  const speedsOk = meta.measuredFps >= 100 && dropShare <= 0.25 && !meta.stability.moved;
  return { speedsOk, problems };
}
