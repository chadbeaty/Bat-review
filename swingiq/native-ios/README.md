# Gapper for iPhone (native shell + 240 fps camera)

The iPhone app is the Gapper website in an app shell, plus one native piece: Gapper's own high-speed camera
(`ios/App/App/Capture/`). Everything else (accounts, swings, analysis) is the same web app at getgapper.com, so the
app updates whenever the site does. Only the camera code needs an app update.

## What you need
- A Mac with **Xcode** (free from the Mac App Store).
- An **Apple Developer account** ($99/year) to put it on phones beyond your own and on the App Store.
- An iPhone that films 240 fps (iPhone 8 and newer film 240 fps at 1080p or 720p; the app checks the phone itself).

## First build (click by click)
1. On the Mac, open Terminal and run:
   `git clone https://github.com/chadbeaty/Bat-review.git && cd Bat-review/swingiq/native-ios && npm install && npx cap sync ios`
2. Run `npx cap open ios`. Xcode opens the project.
3. In Xcode's left sidebar click **App** (blue icon) › **Signing & Capabilities** › pick your Team. Change the Bundle
   Identifier if Xcode asks (e.g. `com.getgapper.app`).
4. Plug in your iPhone, pick it at the top of the Xcode window, press **▶ Run**.
5. On the phone: Settings › General › VPN & Device Management › trust your developer account (first time only).
6. In the app: Record › **Record at 240 fps**. Allow camera, microphone and motion when asked.

No Mac? You don't need one to check the code: GitHub builds the app on its own Macs every time the app code changes
(`.github/workflows/gapper-ios.yml`). It compiled cleanly there on 2026-11-20. It hasn't run on a real iPhone yet.
Putting it on phones without a Mac goes through TestFlight, which needs an Apple Developer account first.

## How it fits together
- `capacitor.config.json` loads `https://getgapper.com/start` in the app. If the phone is offline, `www/index.html`
  shows a short message.
- `GapperViewController.swift` registers the `GapperCapture` plugin. The bridge contract (methods, events, sidecar):
  `../docs/speed/NATIVE-BRIDGE.md`.
- Video stays on the phone. The web app reads it from the app's temp folder.

## Before the App Store
- App icon and splash (Assets.xcassets) in the Gapper brand.
- Privacy labels: camera, microphone and motion are used on device only; nothing is uploaded unless the player backs
  up clips.
- Apple rejects apps that are "just a website": the native 240 fps camera, setup assistant and on-device speed
  measurement are the native value. Say so in the review notes.
