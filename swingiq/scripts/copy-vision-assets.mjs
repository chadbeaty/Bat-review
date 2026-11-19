// Copies the MediaPipe vision runtime (WebAssembly) and the pose model into public/ so the app serves them itself:
// no third-party CDN at runtime, long browser caching, and the camera works on flaky cage Wi-Fi once loaded.
import { cpSync, existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const wasmSrc = join(root, "node_modules/@mediapipe/tasks-vision/wasm");
const wasmDst = join(root, "public/vision/wasm");
const modelDir = join(root, "public/vision/models");

if (existsSync(wasmSrc)) {
  mkdirSync(wasmDst, { recursive: true });
  for (const f of ["vision_wasm_internal.js", "vision_wasm_internal.wasm"]) cpSync(join(wasmSrc, f), join(wasmDst, f));
  console.log("vision: copied MediaPipe wasm runtime");
}

// Google publishes the pose models on a public bucket. "full" is the default: it is far steadier on fast hands
// than "lite" and still runs in real time on a recent phone. "lite" is the fallback for older phones.
const MODELS = {
  "pose_landmarker_lite.task":
    "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
  "pose_landmarker_full.task":
    "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task",
};

mkdirSync(modelDir, { recursive: true });
for (const [name, url] of Object.entries(MODELS)) {
  const dst = join(modelDir, name);
  if (existsSync(dst) && statSync(dst).size > 1_000_000) continue;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    writeFileSync(dst, Buffer.from(await res.arrayBuffer()));
    console.log(`vision: downloaded ${name}`);
  } catch (err) {
    // Don't fail the install: the app falls back to loading the model straight from Google's bucket.
    console.warn(`vision: could not download ${name} (${err.message}); the app will load it from Google instead`);
  }
}
