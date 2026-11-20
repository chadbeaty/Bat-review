import AVFoundation
import CoreMedia
import simd
import UIKit
import Vision

/// Gapper's high-speed capture engine (AVFoundation).
///
/// What it guarantees, because the speed engines depend on it:
/// - The fastest format the phone has (240 fps, else 120), chosen from the device's own format list, never assumed.
/// - Every written frame's presentation time is logged, and every frame the camera dropped is logged with its reason.
///   The web app uses the real times, so a phone that slips from 240 to 197 fps when hot can't inflate a speed.
/// - Video stabilization OFF (it warps geometry and smears timing), focus and exposure controllable.
/// - A short shutter in measurement mode (1/1000 s when the light allows), with ISO raised to keep the brightness,
///   and a warning when the light can't support it.
/// - The lens's intrinsic matrix when AVFoundation delivers it, so the web app knows the real focal length.
/// - A quick motion detector on a tiny copy of each frame that marks swings while recording.
final class CaptureEngine: NSObject, AVCaptureVideoDataOutputSampleBufferDelegate, AVCaptureAudioDataOutputSampleBufferDelegate {
    enum CaptureError: LocalizedError {
        case noCamera, noFormat, notAuthorized, writer(String), notRecording
        var errorDescription: String? {
            switch self {
            case .noCamera: return "No back camera found."
            case .noFormat: return "This phone has no 120 or 240 fps camera mode."
            case .notAuthorized: return "Gapper needs camera access. Turn it on in Settings › Gapper."
            case .writer(let m): return "Couldn't record: \(m)"
            case .notRecording: return "Not recording."
            }
        }
    }

    let session = AVCaptureSession()
    private let sessionQueue = DispatchQueue(label: "gapper.capture.session")
    private let videoQueue = DispatchQueue(label: "gapper.capture.video", qos: .userInteractive)
    private let audioQueue = DispatchQueue(label: "gapper.capture.audio")
    private let videoOutput = AVCaptureVideoDataOutput()
    private let audioOutput = AVCaptureAudioDataOutput()
    private(set) var device: AVCaptureDevice?
    private(set) var format: CaptureFormatInfo?
    let motion = MotionMonitor()

    // Measurement-mode exposure.
    private var targetExposureS = 1.0 / 1000.0
    private var lightShortfall = 1.0 // > 1: needed ISO above the format's maximum by this factor

    // Recording state (videoQueue only).
    private var writer: AVAssetWriter?
    private var videoIn: AVAssetWriterInput?
    private var audioIn: AVAssetWriterInput?
    private var recording = false
    private var firstPTS: CMTime?
    private var frameTimes: [Double] = []
    private var dropped: [DroppedFrame] = []
    private var exposures: [Double] = []
    private var isos: [Double] = []
    private var intrinsics: Intrinsics?
    private var swingMarks: [Double] = []
    private var outputURL: URL?
    private var rotationDeg: Int = 0

    // Preview stats (videoQueue only).
    private var previewTimes: [Double] = []
    private var previewDrops = 0
    private var tiny: [UInt8] = []
    private var tinyPrev: [UInt8] = []
    private var motionLevels: [Double] = []
    private var lastMarkT = -10.0
    private var lastFramingCheck = 0.0
    private(set) var framing: (box: CGRect?, at: Double) = (nil, 0)

    var onSwingMark: ((Double, String) -> Void)?

    // MARK: - Formats

    /// High-speed formats this phone offers (≥ 120 fps), best first.
    static func highSpeedFormats(for device: AVCaptureDevice) -> [(AVCaptureDevice.Format, Double)] {
        var out: [(AVCaptureDevice.Format, Double)] = []
        for f in device.formats {
            let sub = CMFormatDescriptionGetMediaSubType(f.formatDescription)
            guard sub == kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange || sub == kCVPixelFormatType_420YpCbCr8BiPlanarFullRange else { continue }
            let maxFps = f.videoSupportedFrameRateRanges.map { $0.maxFrameRate }.max() ?? 0
            guard maxFps >= 119 else { continue }
            out.append((f, maxFps))
        }
        // Prefer 240 over 120, then 1080p over 720p (more pixels on the ball), never above 1080p (bandwidth, heat).
        return out.sorted { a, b in
            let da = CMVideoFormatDescriptionGetDimensions(a.0.formatDescription)
            let db = CMVideoFormatDescriptionGetDimensions(b.0.formatDescription)
            let fa = min(a.1, 240), fb = min(b.1, 240)
            if fa != fb { return fa > fb }
            let pa = Int(da.width) <= 1920 ? Int(da.width) : 0
            let pb = Int(db.width) <= 1920 ? Int(db.width) : 0
            if pa != pb { return pa > pb }
            return sub(a.0) == kCVPixelFormatType_420YpCbCr8BiPlanarFullRange && sub(b.0) != kCVPixelFormatType_420YpCbCr8BiPlanarFullRange
        }
    }

    private static func sub(_ f: AVCaptureDevice.Format) -> FourCharCode { CMFormatDescriptionGetMediaSubType(f.formatDescription) }

    static func describe(_ f: AVCaptureDevice.Format, fps: Double, lens: String) -> CaptureFormatInfo {
        let d = CMVideoFormatDescriptionGetDimensions(f.formatDescription)
        return CaptureFormatInfo(width: Int(d.width), height: Int(d.height), fps: fps, lens: lens,
                                 minExposureS: f.minExposureDuration.seconds, maxExposureS: f.maxExposureDuration.seconds, hevc: true)
    }

    static func backCamera(lens: String) -> AVCaptureDevice? {
        let type: AVCaptureDevice.DeviceType = lens == "ultraWide" ? .builtInUltraWideCamera : .builtInWideAngleCamera
        return AVCaptureDevice.default(type, for: .video, position: .back) ?? AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back)
    }

    // MARK: - Session

    func configure(fps wanted: Double, maxExposureS: Double, lens: String, completion: @escaping (Result<CaptureFormatInfo, Error>) -> Void) {
        sessionQueue.async {
            do {
                let info = try self.configureSync(fps: wanted, maxExposureS: maxExposureS, lens: lens)
                self.motion.start()
                if !self.session.isRunning { self.session.startRunning() }
                completion(.success(info))
            } catch {
                completion(.failure(error))
            }
        }
    }

    private func configureSync(fps wanted: Double, maxExposureS: Double, lens: String) throws -> CaptureFormatInfo {
        guard AVCaptureDevice.authorizationStatus(for: .video) != .denied else { throw CaptureError.notAuthorized }
        guard let dev = CaptureEngine.backCamera(lens: lens) else { throw CaptureError.noCamera }
        let formats = CaptureEngine.highSpeedFormats(for: dev)
        guard let pick = formats.first(where: { $0.1 >= wanted - 1 }) ?? formats.first else { throw CaptureError.noFormat }
        let fps = min(pick.1, wanted)

        session.beginConfiguration()
        defer { session.commitConfiguration() }
        // .inputPriority: the device's activeFormat decides (otherwise a preset silently caps us at 30 fps).
        session.sessionPreset = .inputPriority
        session.inputs.forEach { session.removeInput($0) }
        session.outputs.forEach { session.removeOutput($0) }

        let input = try AVCaptureDeviceInput(device: dev)
        guard session.canAddInput(input) else { throw CaptureError.noFormat }
        session.addInput(input)
        if let mic = AVCaptureDevice.default(for: .audio), let micIn = try? AVCaptureDeviceInput(device: mic), session.canAddInput(micIn) {
            session.addInput(micIn)
        }

        videoOutput.alwaysDiscardsLateVideoFrames = false // we want to know about every late frame (didDrop), not hide it
        videoOutput.videoSettings = [kCVPixelBufferPixelFormatTypeKey as String: CaptureEngine.sub(pick.0)]
        videoOutput.setSampleBufferDelegate(self, queue: videoQueue)
        guard session.canAddOutput(videoOutput) else { throw CaptureError.noFormat }
        session.addOutput(videoOutput)
        if session.canAddOutput(audioOutput) {
            audioOutput.setSampleBufferDelegate(self, queue: audioQueue)
            session.addOutput(audioOutput)
        }

        try dev.lockForConfiguration()
        dev.activeFormat = pick.0
        let dur = CMTime(value: 1, timescale: CMTimeScale(fps.rounded()))
        dev.activeVideoMinFrameDuration = dur
        dev.activeVideoMaxFrameDuration = dur
        if dev.isFocusModeSupported(.continuousAutoFocus) { dev.focusMode = .continuousAutoFocus }
        if dev.isExposureModeSupported(.continuousAutoExposure) { dev.exposureMode = .continuousAutoExposure }
        if dev.isLowLightBoostSupported { dev.automaticallyEnablesLowLightBoostWhenAvailable = false }
        dev.unlockForConfiguration()

        if let conn = videoOutput.connection(with: .video) {
            if conn.isVideoStabilizationSupported { conn.preferredVideoStabilizationMode = .off }
            if conn.isCameraIntrinsicMatrixDeliverySupported { conn.isCameraIntrinsicMatrixDeliveryEnabled = true }
        }

        device = dev
        targetExposureS = max(pick.0.minExposureDuration.seconds, min(maxExposureS, 1.0 / fps))
        let info = CaptureEngine.describe(pick.0, fps: fps, lens: lens == "ultraWide" ? "ultraWide" : "wide")
        format = info
        return info
    }

    func stop() {
        sessionQueue.async {
            if self.session.isRunning { self.session.stopRunning() }
            self.motion.stop()
        }
    }

    /// Measurement exposure: hold the auto-exposure brightness but with a short shutter, raising ISO to compensate.
    /// Re-run about once a second while previewing (light changes as clouds pass, cage lights flicker on).
    func applyMeasurementExposure() {
        sessionQueue.async {
            guard let dev = self.device, !self.recording else { return }
            let autoDur = dev.exposureDuration.seconds
            let autoISO = Double(dev.iso)
            guard autoDur > 0, autoISO > 0 else { return }
            let f = dev.activeFormat
            let target = max(f.minExposureDuration.seconds, min(self.targetExposureS, f.maxExposureDuration.seconds))
            let neededISO = autoISO * autoDur / target
            let iso = min(Double(f.maxISO), max(Double(f.minISO), neededISO))
            self.lightShortfall = neededISO / Double(f.maxISO)
            guard dev.isExposureModeSupported(.custom), (try? dev.lockForConfiguration()) != nil else { return }
            // If even max ISO can't hold brightness, lengthen the shutter just enough (blur beats a black frame).
            let dur = self.lightShortfall > 1 ? min(f.maxExposureDuration.seconds, target * self.lightShortfall) : target
            dev.setExposureModeCustom(duration: CMTime(seconds: dur, preferredTimescale: 1_000_000), iso: Float(iso), completionHandler: nil)
            dev.unlockForConfiguration()
        }
    }

    /// Return to auto exposure (before re-measuring the scene).
    func autoExposure() {
        sessionQueue.async {
            guard let dev = self.device, (try? dev.lockForConfiguration()) != nil else { return }
            if dev.isExposureModeSupported(.continuousAutoExposure) { dev.exposureMode = .continuousAutoExposure }
            dev.unlockForConfiguration()
        }
    }

    func lockFocus(at p: CGPoint) {
        sessionQueue.async {
            guard let dev = self.device, (try? dev.lockForConfiguration()) != nil else { return }
            if dev.isFocusPointOfInterestSupported { dev.focusPointOfInterest = p }
            if dev.isFocusModeSupported(.autoFocus) { dev.focusMode = .autoFocus }
            dev.unlockForConfiguration()
        }
    }

    // MARK: - Recording

    func startRecording(rotationDeg: Int, completion: @escaping (Error?) -> Void) {
        videoQueue.async {
            guard let info = self.format else { return completion(CaptureError.noFormat) }
            let url = FileManager.default.temporaryDirectory.appendingPathComponent("gapper-\(Int(Date().timeIntervalSince1970 * 1000)).mov")
            do {
                let w = try AVAssetWriter(outputURL: url, fileType: .mov)
                var vs = self.videoOutput.recommendedVideoSettingsForAssetWriter(writingTo: .mov) ?? [:]
                vs[AVVideoCodecKey] = AVVideoCodecType.hevc // 1080p240 isn't supported in H.264
                vs[AVVideoWidthKey] = info.width
                vs[AVVideoHeightKey] = info.height
                var comp = (vs[AVVideoCompressionPropertiesKey] as? [String: Any]) ?? [:]
                comp[AVVideoExpectedSourceFrameRateKey] = info.fps
                comp[AVVideoAverageBitRateKey] = info.width >= 1920 ? 80_000_000 : 45_000_000 // high: the ball is small, keep its edges
                comp[AVVideoMaxKeyFrameIntervalKey] = Int(info.fps)
                vs[AVVideoCompressionPropertiesKey] = comp
                let vin = AVAssetWriterInput(mediaType: .video, outputSettings: vs)
                vin.expectsMediaDataInRealTime = true
                vin.transform = CGAffineTransform(rotationAngle: CGFloat(rotationDeg) * .pi / 180)
                guard w.canAdd(vin) else { throw CaptureError.writer("video input") }
                w.add(vin)
                if let asettings = self.audioOutput.recommendedAudioSettingsForAssetWriter(writingTo: .mov) as? [String: Any] {
                    let ain = AVAssetWriterInput(mediaType: .audio, outputSettings: asettings)
                    ain.expectsMediaDataInRealTime = true
                    if w.canAdd(ain) {
                        w.add(ain)
                        self.audioIn = ain
                    }
                }
                self.writer = w
                self.videoIn = vin
                self.outputURL = url
                self.rotationDeg = rotationDeg
                self.firstPTS = nil
                self.frameTimes = []
                self.dropped = []
                self.exposures = []
                self.isos = []
                self.swingMarks = []
                self.intrinsics = nil
                self.motion.beginRecording()
                self.recording = true
                completion(nil)
            } catch {
                completion(error)
            }
        }
    }

    func stopRecording(checks: [SetupCheck], completion: @escaping (Result<(URL, CaptureSidecar), Error>) -> Void) {
        videoQueue.async {
            guard self.recording, let w = self.writer, let url = self.outputURL, let info = self.format else {
                return completion(.failure(CaptureError.notRecording))
            }
            self.recording = false
            self.videoIn?.markAsFinished()
            self.audioIn?.markAsFinished()
            let (gravity, stability) = self.motion.endRecording()
            let times = self.frameTimes
            let span = (times.last ?? 0) - (times.first ?? 0)
            let measured = span > 0 ? Double(times.count - 1) / span : 0
            let (iw, ih) = self.rotationDeg % 180 == 0 ? (info.width, info.height) : (info.height, info.width)
            let sidecar = CaptureSidecar(
                device: hardwareModel(),
                format: info,
                orientation: iw >= ih ? "landscape" : "portrait",
                frameTimes: times,
                droppedFrames: self.dropped,
                measuredFps: measured,
                exposureS: RangeStat(median: median(self.exposures), max: self.exposures.max() ?? 0),
                iso: RangeStat(median: median(self.isos), max: self.isos.max() ?? 0),
                intrinsics: self.displayIntrinsics(),
                gravity: gravity,
                stability: stability,
                swingMarks: self.swingMarks,
                setupChecks: checks
            )
            w.finishWriting {
                self.writer = nil
                self.videoIn = nil
                self.audioIn = nil
                if w.status == .completed {
                    // Keep the sidecar next to the video (the dataset pipeline reads it).
                    if let data = try? JSONEncoder().encode(sidecar) {
                        try? data.write(to: url.deletingPathExtension().appendingPathExtension("json"))
                    }
                    completion(.success((url, sidecar)))
                } else {
                    completion(.failure(CaptureError.writer(w.error?.localizedDescription ?? "unknown")))
                }
            }
        }
    }

    /// Intrinsics in the orientation the video plays in (the web decodes it with the rotation applied).
    private func displayIntrinsics() -> Intrinsics? {
        let base: Intrinsics
        if let k = intrinsics {
            base = k
        } else if let info = format, let dev = device {
            // Fallback: focal length from the format's horizontal field of view (less exact: no per-unit calibration).
            let hfov = Double(dev.activeFormat.videoFieldOfView) * .pi / 180
            let fx = Double(info.width) / 2 / tan(hfov / 2)
            base = Intrinsics(fx: fx, fy: fx, cx: Double(info.width) / 2, cy: Double(info.height) / 2, width: Double(info.width), height: Double(info.height), source: "field-of-view")
        } else {
            return nil
        }
        switch (rotationDeg % 360 + 360) % 360 {
        case 90: // rotate clockwise: (x, y) → (H - y, x)
            return Intrinsics(fx: base.fy, fy: base.fx, cx: base.height - base.cy, cy: base.cx, width: base.height, height: base.width, source: base.source)
        case 180:
            return Intrinsics(fx: base.fx, fy: base.fy, cx: base.width - base.cx, cy: base.height - base.cy, width: base.width, height: base.height, source: base.source)
        case 270:
            return Intrinsics(fx: base.fy, fy: base.fx, cx: base.cy, cy: base.width - base.cx, width: base.height, height: base.width, source: base.source)
        default:
            return base
        }
    }

    // MARK: - Sample buffers

    func captureOutput(_ output: AVCaptureOutput, didOutput sampleBuffer: CMSampleBuffer, from connection: AVCaptureConnection) {
        if output === audioOutput {
            videoQueue.async { [weak self] in self?.appendAudio(sampleBuffer) }
            return
        }
        let pts = CMSampleBufferGetPresentationTimeStamp(sampleBuffer)
        let t = pts.seconds
        previewTimes.append(t)
        if previewTimes.count > 480 { previewTimes.removeFirst(previewTimes.count - 480) }
        if let pb = CMSampleBufferGetImageBuffer(sampleBuffer) {
            if previewTimes.count % 2 == 0 { motionCheck(pb, t: t) }
            if t - lastFramingCheck > 0.5 && !recording {
                lastFramingCheck = t
                framingCheck(pb, t: t)
            }
        }
        guard recording, let w = writer, let vin = videoIn else { return }
        if w.status == .unknown {
            w.startWriting()
            w.startSession(atSourceTime: pts)
            firstPTS = pts
        }
        guard w.status == .writing else { return }
        if intrinsics == nil, let att = CMGetAttachment(sampleBuffer, key: kCMSampleBufferAttachmentKey_CameraIntrinsicMatrix, attachmentModeOut: nil) as? Data,
           att.count >= MemoryLayout<matrix_float3x3>.size, let pb = CMSampleBufferGetImageBuffer(sampleBuffer) {
            let m = att.withUnsafeBytes { $0.load(as: matrix_float3x3.self) }
            intrinsics = Intrinsics(fx: Double(m.columns.0.x), fy: Double(m.columns.1.y), cx: Double(m.columns.2.x), cy: Double(m.columns.2.y),
                                    width: Double(CVPixelBufferGetWidth(pb)), height: Double(CVPixelBufferGetHeight(pb)), source: "per-frame")
        }
        let rel = (pts - (firstPTS ?? pts)).seconds
        if vin.isReadyForMoreMediaData {
            if vin.append(sampleBuffer) {
                frameTimes.append(rel)
            } else {
                dropped.append(DroppedFrame(t: rel, reason: "encoder"))
            }
        } else {
            dropped.append(DroppedFrame(t: rel, reason: "encoder-busy"))
        }
        if let dev = device {
            exposures.append(dev.exposureDuration.seconds)
            isos.append(Double(dev.iso))
        }
    }

    func captureOutput(_ output: AVCaptureOutput, didDrop sampleBuffer: CMSampleBuffer, from connection: AVCaptureConnection) {
        guard output === videoOutput else { return }
        previewDrops += 1
        guard recording else { return }
        let pts = CMSampleBufferGetPresentationTimeStamp(sampleBuffer)
        let reason = (CMGetAttachment(sampleBuffer, key: kCMSampleBufferAttachmentKey_DroppedFrameReason, attachmentModeOut: nil) as? String) ?? "dropped"
        dropped.append(DroppedFrame(t: (pts - (firstPTS ?? pts)).seconds, reason: reason))
    }

    private func appendAudio(_ sb: CMSampleBuffer) {
        guard recording, let ain = audioIn, writer?.status == .writing, ain.isReadyForMoreMediaData else { return }
        ain.append(sb)
    }

    /// Swing marks: motion energy on an 80×45 copy of the luma plane. A swing is a sudden burst far above the
    /// stance's waggles; marks are hints for the web app (it still runs the full swing detector).
    private func motionCheck(_ pb: CVPixelBuffer, t: Double) {
        CVPixelBufferLockBaseAddress(pb, .readOnly)
        defer { CVPixelBufferUnlockBaseAddress(pb, .readOnly) }
        guard let base = CVPixelBufferGetBaseAddressOfPlane(pb, 0) else { return }
        let w = CVPixelBufferGetWidthOfPlane(pb, 0)
        let h = CVPixelBufferGetHeightOfPlane(pb, 0)
        let stride = CVPixelBufferGetBytesPerRowOfPlane(pb, 0)
        let tw = 80, th = 45
        if tiny.count != tw * th { tiny = [UInt8](repeating: 0, count: tw * th) }
        let p = base.assumingMemoryBound(to: UInt8.self)
        for y in 0..<th {
            let row = (y * h / th) * stride
            for x in 0..<tw { tiny[y * tw + x] = p[row + x * w / tw] }
        }
        defer { tinyPrev = tiny }
        guard tinyPrev.count == tiny.count else { return }
        var sum = 0
        for i in 0..<tiny.count { sum += abs(Int(tiny[i]) - Int(tinyPrev[i])) }
        let level = Double(sum) / Double(tiny.count)
        motionLevels.append(level)
        if motionLevels.count > 240 { motionLevels.removeFirst() }
        let baseline = median(motionLevels)
        if recording, level > max(4, baseline * 5), t - lastMarkT > 1.5 {
            lastMarkT = t
            let rel = (CMTime(seconds: t, preferredTimescale: 1_000_000) - (firstPTS ?? .zero)).seconds
            swingMarks.append(rel)
            DispatchQueue.main.async { self.onSwingMark?(rel, "motion") }
        }
    }

    /// Where the hitter is in the picture (Apple Vision human rectangle), twice a second while setting up.
    private func framingCheck(_ pb: CVPixelBuffer, t: Double) {
        let req = VNDetectHumanRectanglesRequest()
        req.upperBodyOnly = false
        let handler = VNImageRequestHandler(cvPixelBuffer: pb, orientation: .up, options: [:])
        try? handler.perform([req])
        let box = (req.results ?? []).max { $0.boundingBox.height < $1.boundingBox.height }?.boundingBox
        framing = (box, t)
    }

    // MARK: - Setup assessment

    /// Live checks for the setup assistant. Plain words, one fix each.
    func setupChecks(thermal: ProcessInfo.ThermalState) -> (checks: [SetupCheck], exposureS: Double, iso: Double, tilt: (Double, Double)) {
        var checks: [SetupCheck] = []
        let fps = format?.fps ?? 0
        checks.append(fps >= 239
            ? SetupCheck(id: "frameRate", status: .ok, message: "Camera at 240 fps.", value: fps)
            : fps >= 119 ? SetupCheck(id: "frameRate", status: .warn, message: "This phone tops out at 120 fps. Speeds still work, with a wider ±.", value: fps)
            : SetupCheck(id: "frameRate", status: .fail, message: "This phone can't film fast enough for speeds.", value: fps))

        // Real delivered frame rate over the last second of preview.
        let recent = previewTimes.suffix(Int(max(30, fps)))
        if let a = recent.first, let b = recent.last, b > a, fps > 0 {
            let real = Double(recent.count - 1) / (b - a)
            if real < fps * 0.85 {
                checks.append(SetupCheck(id: "thermal", status: .warn, message: "The camera is only keeping up at \(Int(real)) fps. Close other apps; let a hot phone cool off.", value: real))
            }
        }
        if thermal == .serious || thermal == .critical {
            checks.append(SetupCheck(id: "thermal", status: .fail, message: "Your phone is too hot to film at full speed. Shade it for a few minutes.", value: nil))
        }

        let exp = device?.exposureDuration.seconds ?? 0
        let iso = Double(device?.iso ?? 0)
        if lightShortfall > 1.6 {
            checks.append(SetupCheck(id: "light", status: .fail, message: "Too dark for a fast shutter: the bat will blur. Turn on more lights or film in daylight.", value: lightShortfall))
        } else if lightShortfall > 1 {
            checks.append(SetupCheck(id: "light", status: .warn, message: "A bit dim. It'll work, but more light sharpens bat speed.", value: lightShortfall))
        } else {
            checks.append(SetupCheck(id: "light", status: .ok, message: "Light is good.", value: lightShortfall))
        }
        if exp > 0 {
            checks.append(exp <= 1.0 / 900
                ? SetupCheck(id: "shutter", status: .ok, message: "Shutter 1/\(Int(1 / exp)) s: sharp bat and ball.", value: exp)
                : SetupCheck(id: "shutter", status: exp <= 1.0 / 400 ? .warn : .fail, message: "Shutter 1/\(Int(1 / exp)) s: the bat will smear. More light lets it go faster.", value: exp))
        }

        let tilt = motion.tilt()
        if abs(tilt.rollDeg) > 6 {
            checks.append(SetupCheck(id: "level", status: .warn, message: "Straighten the phone (it's tipped \(Int(abs(tilt.rollDeg)))° sideways).", value: tilt.rollDeg))
        } else if tilt.pitchDeg < -5 {
            checks.append(SetupCheck(id: "level", status: .warn, message: "Tip the phone slightly down toward the plate, not up.", value: tilt.pitchDeg))
        } else if tilt.pitchDeg > 35 {
            checks.append(SetupCheck(id: "level", status: .warn, message: "The phone is pointed down too steeply. Raise it to chest height and aim at the hitter.", value: tilt.pitchDeg))
        } else {
            checks.append(SetupCheck(id: "level", status: .ok, message: "Phone angle is good.", value: tilt.pitchDeg))
        }

        if let box = framing.box {
            // Vision boxes are normalized with the origin at bottom-left, in the sensor's orientation.
            let tall = rotationOfPreviewIsPortrait ? box.width : box.height
            let side = rotationOfPreviewIsPortrait ? box.midY : box.midX
            if tall > 0.92 {
                checks.append(SetupCheck(id: "framing", status: .fail, message: "Move back: head to shoes and the whole bat need to fit.", value: tall))
            } else if tall < 0.35 {
                checks.append(SetupCheck(id: "framing", status: .warn, message: "Move closer: the hitter is small in the picture.", value: tall))
            } else {
                checks.append(SetupCheck(id: "framing", status: .ok, message: "Hitter fits in the picture.", value: tall))
            }
            if side > 0.38 && side < 0.62 {
                checks.append(SetupCheck(id: "ballRoom", status: .warn, message: "Slide the hitter to one side so the ball has room to fly after contact.", value: side))
            } else {
                checks.append(SetupCheck(id: "ballRoom", status: .ok, message: "Room in front for the ball.", value: side))
            }
        } else {
            checks.append(SetupCheck(id: "framing", status: .warn, message: "Step into the box so Gapper can check the framing.", value: nil))
        }
        return (checks, exp, iso, tilt)
    }

    var rotationOfPreviewIsPortrait = false
}
