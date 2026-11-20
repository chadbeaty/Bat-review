import CoreMotion
import Foundation

/// The phone's level and steadiness from the motion sensors.
/// - Gravity, converted into camera coordinates of the RECORDED video (x right, y down, z out of the back lens), so
///   the web app can turn barrel motion into a true up/down attack angle.
/// - Peak rotation rate while recording: a phone that moved can't measure speed (the background "moves" too).
final class MotionMonitor {
    private let manager = CMMotionManager()
    private let queue = OperationQueue()
    private let lock = NSLock()
    private var gravitySum = (x: 0.0, y: 0.0, z: 0.0)
    private var gravityCount = 0
    private var latestGravity = (x: 0.0, y: -1.0, z: 0.0)
    private var maxRate = 0.0
    private var recording = false

    func start() {
        guard manager.isDeviceMotionAvailable else { return }
        manager.deviceMotionUpdateInterval = 1.0 / 60.0
        manager.startDeviceMotionUpdates(to: queue) { [weak self] m, _ in
            guard let self, let m else { return }
            self.lock.lock()
            self.latestGravity = (m.gravity.x, m.gravity.y, m.gravity.z)
            if self.recording {
                self.gravitySum.x += m.gravity.x
                self.gravitySum.y += m.gravity.y
                self.gravitySum.z += m.gravity.z
                self.gravityCount += 1
                let r = m.rotationRate
                let degS = sqrt(r.x * r.x + r.y * r.y + r.z * r.z) * 180 / .pi
                self.maxRate = max(self.maxRate, degS)
            }
            self.lock.unlock()
        }
    }

    func stop() { manager.stopDeviceMotionUpdates() }

    func beginRecording() {
        lock.lock()
        gravitySum = (0, 0, 0)
        gravityCount = 0
        maxRate = 0
        recording = true
        lock.unlock()
    }

    func endRecording() -> (gravity: Vec3?, stability: Stability) {
        lock.lock()
        defer { lock.unlock() }
        recording = false
        let g: Vec3? = gravityCount > 0 ? toCamera(gravitySum.x / Double(gravityCount), gravitySum.y / Double(gravityCount), gravitySum.z / Double(gravityCount)) : nil
        // A tripod bump or a hand-held phone shows up as rotation; 6°/s is well above sensor noise on a stand.
        return (g, Stability(maxRotationDegS: maxRate, moved: maxRate > 6))
    }

    /// Tilt from level for the live setup check: (pitch down, roll) in degrees for a phone held sideways or upright.
    func tilt() -> (pitchDeg: Double, rollDeg: Double) {
        lock.lock()
        let g = latestGravity
        lock.unlock()
        let c = toCamera(g.x, g.y, g.z)
        // Camera pitched down → gravity has a component along +z (out of the lens).
        let pitch = asin(max(-1, min(1, c.z))) * 180 / .pi
        let roll = atan2(c.x, c.y) * 180 / .pi
        return (pitch, roll)
    }

    /// Device gravity → camera coordinates of the picture as recorded. The back camera looks along -z of the device;
    /// image "down" depends on how the phone is turned, so of the four quarter-turns pick the one where gravity points
    /// most nearly down the picture (true for any phone within 45° of upright, which is every usable tripod setup).
    private func toCamera(_ gx: Double, _ gy: Double, _ gz: Double) -> Vec3 {
        // Portrait: image x = device x, image y (down) = -device y, lens axis = -device z.
        let base = (x: gx, y: -gy, z: -gz)
        let turns = [(base.x, base.y), (base.y, -base.x), (-base.x, -base.y), (-base.y, base.x)]
        let best = turns.max { $0.1 < $1.1 }!
        return Vec3(x: best.0, y: best.1, z: base.z)
    }
}
