# Native capture bridge (contract)

The web app talks to the iOS capture engine through one Capacitor plugin, `GapperCapture`.
- Web side: `src/native/capture.ts` (types + `nativeCapture()`), UI in `src/components/NativeCapture.tsx`.
- Native side: `native-ios/ios/App/App/Capture/GapperCapturePlugin.swift` (bridge), `CaptureEngine.swift` (AVFoundation),
  `MotionMonitor.swift` (gravity, gyro), `CaptureSidecar.swift` (the JSON shape).

Change both sides together. The sidecar is also read by `ml/tools/extract_frames.py`.

## Detection

`nativeCapture()` returns the plugin only when `window.Capacitor.isNativePlatform()` is true, the platform is `ios`,
and the plugin is available. In any browser it returns null and the Record page shows only upload and live mode.

## Methods

| Method | Arguments | Returns | Notes |
| --- | --- | --- | --- |
| `formats()` | — | `{ formats: CaptureFormat[], device }` | Formats ≥ 120 fps, best first. |
| `startPreview(o)` | `{ fps?: 240 \| 120, maxExposureS?, lens?: "wide" \| "ultraWide", orientation? }` | `PreviewState` | Asks for camera/mic permission, picks the format, draws the camera behind the web view (the page turns see-through), starts the 0.5 s setup checks. |
| `stopPreview()` | — | — | Stops the camera and restores the page. |
| `startRecording()` | — | — | Rotation comes from the current screen orientation (landscape recommended). |
| `stopRecording()` | — | `NativeRecording { url, path, durationS, meta }` | `url` is loadable by the web view; `meta` is the sidecar. A `.json` copy is written next to the `.mov`. |
| `lockFocus(o)` | `{ x, y }` 0–1 | — | Focus on a point (e.g. the plate). |
| `deleteRecording(o)` | `{ path }` | — | Only files in Gapper's temp folder. |

## Events

| Event | Payload | When |
| --- | --- | --- |
| `previewState` | `PreviewState { format, checks, exposureS, iso, tiltDeg, rollDeg, thermal }` | Every 0.5 s while the camera is open. |
| `swingMark` | `{ t, kind: "motion" \| "audio" }` | A burst of motion while recording (a hint; the web app still runs its full swing detector). |

## Setup checks (`SetupCheck.id`)

`frameRate` (240 ok, 120 warn, less fail) · `thermal` (delivered fps < 85% of nominal, or phone hot) · `light`
(ISO needed for a 1/1000 s shutter vs the format's max) · `shutter` (≤ 1/900 s ok, ≤ 1/400 warn, slower fail) ·
`level` (roll > 6° or tipped up or > 35° down) · `framing` (Vision human rectangle: too big / too small) · `ballRoom`
(hitter centered = no room for the ball). Any `fail` disables the Record button.

## Sidecar (`NativeCaptureMeta`)

```json
{
  "version": 1,
  "device": "iPhone16,1",
  "format": { "width": 1920, "height": 1080, "fps": 240, "lens": "wide", "minExposureS": 0.000014, "maxExposureS": 0.004166, "hevc": true },
  "orientation": "landscape",
  "frameTimes": [0, 0.004166, 0.008333, "…one per written frame, seconds from the first"],
  "droppedFrames": [{ "t": 1.2375, "reason": "FrameWasLate" }],
  "measuredFps": 239.6,
  "exposureS": { "median": 0.001, "max": 0.0012 },
  "iso": { "median": 640, "max": 800 },
  "intrinsics": { "fx": 1420.5, "fy": 1420.5, "cx": 960.2, "cy": 539.8, "width": 1920, "height": 1080, "source": "per-frame" },
  "gravity": { "x": 0.01, "y": 0.96, "z": 0.27 },
  "stability": { "maxRotationDegS": 1.8, "moved": false },
  "swingMarks": [3.41, 9.87],
  "setupChecks": [{ "id": "light", "status": "ok", "message": "Light is good.", "value": 0.6 }]
}
```

- `frameTimes[i]` is the capture time of frame *i* of the video stream. The web analyzer snaps each decoded frame's
  media time to the nearest entry (`frameTimeSnapper`), so speeds use the camera's own clock.
- `intrinsics` are in the recorded video's orientation and pixel size; the analyzer scales them to its tracking frame.
- `gravity` is in camera coordinates of the recorded video: x right, y down, z out of the lens.
- `captureQuality(meta)` turns the sidecar into go/no-go: under 100 real fps, more than 25% dropped, or a moving phone
  → speeds are withheld with the reason.
