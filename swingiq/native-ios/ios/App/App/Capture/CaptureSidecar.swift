import Foundation

// The sidecar that travels with every Gapper recording. Its JSON shape is the contract with the web app
// (src/native/capture.ts, NativeCaptureMeta) and the dataset pipeline (ml/). Change both together.

struct SetupCheck: Codable {
    enum Status: String, Codable { case ok, warn, fail }
    let id: String
    let status: Status
    let message: String
    let value: Double?

    var dict: [String: Any] {
        var d: [String: Any] = ["id": id, "status": status.rawValue, "message": message]
        if let v = value { d["value"] = v }
        return d
    }
}

struct CaptureFormatInfo: Codable {
    let width: Int
    let height: Int
    let fps: Double
    let lens: String
    let minExposureS: Double
    let maxExposureS: Double
    let hevc: Bool

    var dict: [String: Any] {
        ["width": width, "height": height, "fps": fps, "lens": lens, "minExposureS": minExposureS, "maxExposureS": maxExposureS, "hevc": hevc]
    }
}

struct Intrinsics: Codable {
    let fx: Double
    let fy: Double
    let cx: Double
    let cy: Double
    let width: Double
    let height: Double
    /// "per-frame" (AVFoundation's camera intrinsic matrix) or "field-of-view" (from the format's FOV).
    let source: String
}

struct Vec3: Codable {
    let x: Double
    let y: Double
    let z: Double
}

struct RangeStat: Codable {
    let median: Double
    let max: Double
}

struct DroppedFrame: Codable {
    let t: Double
    let reason: String
}

struct Stability: Codable {
    let maxRotationDegS: Double
    let moved: Bool
}

struct CaptureSidecar: Codable {
    var version = 1
    let device: String
    let format: CaptureFormatInfo
    let orientation: String
    let frameTimes: [Double]
    let droppedFrames: [DroppedFrame]
    let measuredFps: Double
    let exposureS: RangeStat
    let iso: RangeStat
    let intrinsics: Intrinsics?
    let gravity: Vec3?
    let stability: Stability
    let swingMarks: [Double]
    let setupChecks: [SetupCheck]

    /// Dictionary for the Capacitor bridge (same keys as the JSON file).
    func bridgeObject() -> [String: Any] {
        guard let data = try? JSONEncoder().encode(self),
              let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return [:] }
        return obj
    }
}

func hardwareModel() -> String {
    var info = utsname()
    uname(&info)
    let mirror = Mirror(reflecting: info.machine)
    return mirror.children.reduce(into: "") { s, el in
        if let v = el.value as? Int8, v != 0 { s.append(Character(UnicodeScalar(UInt8(v)))) }
    }
}

func median(_ xs: [Double]) -> Double {
    guard !xs.isEmpty else { return 0 }
    let s = xs.sorted()
    return s[s.count / 2]
}
