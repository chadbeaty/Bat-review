import AVFoundation
import Capacitor
import UIKit

/// The "GapperCapture" Capacitor plugin: the bridge between the web app (src/native/capture.ts) and CaptureEngine.
/// Every method and event here is listed in docs/speed/NATIVE-BRIDGE.md.
@objc(GapperCapturePlugin)
public class GapperCapturePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "GapperCapturePlugin"
    public let jsName = "GapperCapture"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "formats", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startPreview", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopPreview", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startRecording", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopRecording", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "lockFocus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "deleteRecording", returnType: CAPPluginReturnPromise),
    ]

    private let engine = CaptureEngine()
    private var previewLayer: AVCaptureVideoPreviewLayer?
    private var timer: Timer?
    private var ticks = 0
    private var lastChecks: [SetupCheck] = []

    // MARK: - Methods

    @objc func formats(_ call: CAPPluginCall) {
        guard let dev = CaptureEngine.backCamera(lens: "wide") else { return call.reject("No back camera found.") }
        let list = CaptureEngine.highSpeedFormats(for: dev).map { CaptureEngine.describe($0.0, fps: min($0.1, 240), lens: "wide").dict }
        call.resolve(["formats": list, "device": hardwareModel()])
    }

    @objc func startPreview(_ call: CAPPluginCall) {
        let fps = call.getDouble("fps") ?? 240
        let maxExp = call.getDouble("maxExposureS") ?? 1.0 / 1000.0
        let lens = call.getString("lens") ?? "wide"
        requestAccess { granted in
            guard granted else { return call.reject(CaptureEngine.CaptureError.notAuthorized.localizedDescription) }
            self.engine.onSwingMark = { [weak self] t, kind in self?.notifyListeners("swingMark", data: ["t": t, "kind": kind]) }
            self.engine.configure(fps: fps, maxExposureS: maxExp, lens: lens) { result in
                DispatchQueue.main.async {
                    switch result {
                    case .failure(let e):
                        call.reject(e.localizedDescription)
                    case .success:
                        self.showPreview()
                        self.startTimer()
                        // Let auto exposure settle on the scene, then switch to the short measurement shutter.
                        DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) { self.engine.applyMeasurementExposure() }
                        call.resolve(self.previewState())
                    }
                }
            }
        }
    }

    @objc func stopPreview(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.timer?.invalidate()
            self.timer = nil
            self.hidePreview()
            self.engine.stop()
            call.resolve()
        }
    }

    @objc func startRecording(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let rot = self.rotationDegrees()
            self.engine.startRecording(rotationDeg: rot) { err in
                if let err { call.reject(err.localizedDescription) } else { call.resolve() }
            }
        }
    }

    @objc func stopRecording(_ call: CAPPluginCall) {
        engine.stopRecording(checks: lastChecks) { result in
            switch result {
            case .failure(let e):
                call.reject(e.localizedDescription)
            case .success(let (url, sidecar)):
                let asset = AVURLAsset(url: url)
                let web = self.bridge?.portablePath(fromLocalURL: url)?.absoluteString ?? url.absoluteString
                call.resolve(["url": web, "path": url.path, "durationS": asset.duration.seconds, "meta": sidecar.bridgeObject()])
            }
        }
    }

    @objc func lockFocus(_ call: CAPPluginCall) {
        engine.lockFocus(at: CGPoint(x: call.getDouble("x") ?? 0.5, y: call.getDouble("y") ?? 0.5))
        call.resolve()
    }

    @objc func deleteRecording(_ call: CAPPluginCall) {
        guard let path = call.getString("path") else { return call.reject("path missing") }
        let url = URL(fileURLWithPath: path)
        // Only files Gapper wrote to its own temporary folder.
        guard url.path.hasPrefix(FileManager.default.temporaryDirectory.path) else { return call.reject("not a Gapper recording") }
        try? FileManager.default.removeItem(at: url)
        try? FileManager.default.removeItem(at: url.deletingPathExtension().appendingPathExtension("json"))
        call.resolve()
    }

    // MARK: - Preview and live checks

    private func requestAccess(_ done: @escaping (Bool) -> Void) {
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized: done(true)
        case .notDetermined:
            AVCaptureDevice.requestAccess(for: .video) { ok in
                AVCaptureDevice.requestAccess(for: .audio) { _ in DispatchQueue.main.async { done(ok) } }
            }
        default: done(false)
        }
    }

    private func showPreview() {
        guard let vc = bridge?.viewController, let web = bridge?.webView else { return }
        if previewLayer == nil {
            let layer = AVCaptureVideoPreviewLayer(session: engine.session)
            layer.videoGravity = .resizeAspect
            vc.view.layer.insertSublayer(layer, at: 0)
            previewLayer = layer
        }
        previewLayer?.frame = vc.view.bounds
        updatePreviewOrientation()
        web.isOpaque = false
        web.backgroundColor = .clear
        web.scrollView.backgroundColor = .clear
        vc.view.backgroundColor = .black
        UIApplication.shared.isIdleTimerDisabled = true
    }

    private func hidePreview() {
        previewLayer?.removeFromSuperlayer()
        previewLayer = nil
        bridge?.webView?.isOpaque = true
        UIApplication.shared.isIdleTimerDisabled = false
    }

    private func startTimer() {
        timer?.invalidate()
        ticks = 0
        timer = Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { [weak self] _ in
            guard let self else { return }
            self.ticks += 1
            if let vc = self.bridge?.viewController { self.previewLayer?.frame = vc.view.bounds }
            self.updatePreviewOrientation()
            // Re-meter every 3 s while setting up (light changes; the measurement shutter follows it).
            if self.ticks % 6 == 0 {
                self.engine.autoExposure()
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) { self.engine.applyMeasurementExposure() }
            }
            self.notifyListeners("previewState", data: self.previewState())
        }
    }

    private func previewState() -> [String: Any] {
        let r = engine.setupChecks(thermal: ProcessInfo.processInfo.thermalState)
        lastChecks = r.checks
        let thermal: String
        switch ProcessInfo.processInfo.thermalState {
        case .nominal: thermal = "nominal"
        case .fair: thermal = "fair"
        case .serious: thermal = "serious"
        default: thermal = "critical"
        }
        return [
            "format": engine.format?.dict ?? [:],
            "checks": r.checks.map { $0.dict },
            "exposureS": r.exposureS,
            "iso": r.iso,
            "tiltDeg": r.tilt.0,
            "rollDeg": r.tilt.1,
            "thermal": thermal,
        ]
    }

    private func interfaceOrientation() -> UIInterfaceOrientation {
        bridge?.viewController?.view.window?.windowScene?.interfaceOrientation ?? .portrait
    }

    /// Rotation to apply to the back camera's buffers so the file plays upright (sensor native = landscape right).
    private func rotationDegrees() -> Int {
        switch interfaceOrientation() {
        case .landscapeRight: return 0
        case .landscapeLeft: return 180
        case .portraitUpsideDown: return 270
        default: return 90
        }
    }

    private func updatePreviewOrientation() {
        let o = interfaceOrientation()
        engine.rotationOfPreviewIsPortrait = o.isPortrait
        guard let conn = previewLayer?.connection, conn.isVideoOrientationSupported else { return }
        switch o {
        case .landscapeLeft: conn.videoOrientation = .landscapeLeft
        case .landscapeRight: conn.videoOrientation = .landscapeRight
        case .portraitUpsideDown: conn.videoOrientation = .portraitUpsideDown
        default: conn.videoOrientation = .portrait
        }
    }
}
