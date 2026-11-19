"use client";
import type { PoseLandmarker as PoseLandmarkerType } from "@mediapipe/tasks-vision";
import type { Landmark, WorldLandmark } from "@/engine/types";

export type ModelQuality = "full" | "lite";

type Loaded = { quality: ModelQuality; landmarker: PoseLandmarkerType; delegate: "GPU" | "CPU" };
let cached: Loaded | null = null;
let loading: Promise<Loaded> | null = null;

const MODEL_FILES: Record<ModelQuality, string> = {
  full: "pose_landmarker_full.task",
  lite: "pose_landmarker_lite.task",
};
const GOOGLE_MODELS: Record<ModelQuality, string> = {
  full: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task",
  lite: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
};

async function modelUrl(q: ModelQuality): Promise<string> {
  const own = `/vision/models/${MODEL_FILES[q]}`;
  try {
    const head = await fetch(own, { method: "HEAD" });
    if (head.ok) return own;
  } catch {
    /* fall through */
  }
  return GOOGLE_MODELS[q];
}

/**
 * Loads the MediaPipe pose model once per page and reuses it. Tries the GPU first (fast), then the CPU.
 * The runtime and model are served from this site (see scripts/copy-vision-assets.mjs).
 */
export async function loadPose(quality: ModelQuality, only?: "GPU" | "CPU"): Promise<{ landmarker: PoseLandmarkerType; delegate: "GPU" | "CPU" }> {
  const current = (): Loaded | null => (cached && cached.quality === quality && (!only || cached.delegate === only) ? cached : null);
  const hit = current();
  if (hit) return hit;
  if (loading) await loading.catch(() => null);
  const after = current();
  if (after) return after;
  const old: Loaded | null = cached;
  if (old) {
    old.landmarker.close();
    cached = null;
  }
  loading = (async () => {
    const { FilesetResolver, PoseLandmarker } = await import("@mediapipe/tasks-vision");
    const fileset = await FilesetResolver.forVisionTasks("/vision/wasm");
    const url = await modelUrl(quality);
    const make = (delegate: "GPU" | "CPU") =>
      PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: url, delegate },
        runningMode: "VIDEO",
        numPoses: 1,
        minPoseDetectionConfidence: 0.5,
        minPosePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });
    let loaded: Loaded;
    if (only === "CPU") loaded = { quality, landmarker: await make("CPU"), delegate: "CPU" };
    else {
      try {
        loaded = { quality, landmarker: await make("GPU"), delegate: "GPU" };
      } catch {
        loaded = { quality, landmarker: await make("CPU"), delegate: "CPU" };
      }
    }
    cached = loaded;
    return loaded;
  })();
  try {
    return await loading;
  } finally {
    loading = null;
  }
}

export function toLandmarks(raw: { x: number; y: number; z: number; visibility?: number }[] | undefined): Landmark[] | null {
  if (!raw) return null;
  return raw.map((p) => ({ x: p.x, y: p.y, z: p.z, v: p.visibility ?? 0 }));
}

export function toWorld(raw: { x: number; y: number; z: number; visibility?: number }[] | undefined): WorldLandmark[] | null {
  if (!raw) return null;
  return raw.map((p) => ({ x: p.x, y: p.y, z: p.z, v: p.visibility ?? 0 }));
}
