# Gapper on the App Store

Everything needed to get Gapper from this repo onto iPhones: first through TestFlight (Apple's tester app), then the
App Store. No Mac needed: GitHub builds, signs and uploads the app (`.github/workflows/gapper-testflight.yml`).

## Status
| Piece | State |
| --- | --- |
| App code (web shell + 240 fps camera) | Done; compiles on GitHub's Macs on every change |
| App icon and launch screen | Done, from the brand files (`public/brand/gapper-app-icon-square.svg`, `gapper-mark.svg`) |
| Privacy manifest (`ios/App/App/PrivacyInfo.xcprivacy`) | Done: no tracking; email and swing data only for signed-in sync |
| iPhone only | Yes (`TARGETED_DEVICE_FAMILY = 1`): fewer screenshots and reviews; iPads can still run it in iPhone mode |
| Encryption question | Answered in the app (`ITSAppUsesNonExemptEncryption = false`, HTTPS only), so uploads skip it |
| TestFlight upload button | Built; waits on the four Apple secrets below |
| Apple Developer account | **Owner: to do** |
| Support page with a contact email | **To do**: Apple requires a support URL with a way to reach you |
| App Store screenshots (6.9" iPhone, 1320 × 2868) | To do before App Store submission (not needed for TestFlight) |
| Real-iPhone test of the 240 fps camera | To do on the first TestFlight build |

## Owner steps (click by click)

### 1. Join the Apple Developer Program ($99/year)
1. Go to developer.apple.com/programs and click **Enroll**.
2. Sign in with your Apple ID (turn on two-factor if it asks).
3. Pick **Individual** (fastest; your own name shows as the seller) or **Organization** (shows your company name;
   needs an LLC and a free D-U-N-S number, which can take up to two weeks).
4. Pay. Approval is usually 1-2 days. You get an email when it's done.

### 2. Register the app and claim the name
1. Go to developer.apple.com/account › **Certificates, IDs & Profiles** › **Identifiers** › the blue **+**.
2. Pick **App IDs** › Continue › **App** › Continue.
3. Description: `Gapper`. Bundle ID: **Explicit**, `com.getgapper.app`. Leave the capability boxes as they are.
   Continue › Register.
4. Go to appstoreconnect.apple.com › **Apps** › the blue **+** › **New App**.
5. Platform: **iOS**. Name: **Gapper: Slowpitch Swing**. Primary language: English (U.S.). Bundle ID: pick
   `com.getgapper.app`. SKU: `gapper-ios`. User access: Full Access. Click **Create**.
   - If Apple says the name is taken, try `Gapper – Slowpitch Hitting`, then tell Claude which one worked.

### 3. Make the upload key and save it in GitHub
1. In App Store Connect: **Users and Access** › **Integrations** tab › **App Store Connect API** › **Team Keys**.
   (First time: click **Request Access** and accept.)
2. Click **+** (Generate API Key). Name: `GitHub TestFlight`. Access: **Admin** (needed so Apple can sign the app for
   us). Click **Generate**.
3. Click **Download** next to the new key. You get a file named like `AuthKey_ABC123XYZ.p8`. You can only download it
   once, so keep it somewhere safe.
4. On the same page, note the **Issuer ID** (above the list) and the **Key ID** (in the key's row).
5. Find your **Team ID**: developer.apple.com/account › **Membership details** › Team ID (10 characters).
6. On GitHub open the Bat-review repo › **Settings** › **Secrets and variables** › **Actions** › **New repository
   secret**, and add these four, one at a time:
   - `APPLE_TEAM_ID`: the Team ID
   - `ASC_KEY_ID`: the Key ID
   - `ASC_ISSUER_ID`: the Issuer ID
   - `ASC_KEY_P8`: open the `.p8` file in TextEdit or Notepad, copy everything (including the BEGIN and END lines)
     and paste it in
   Never paste these into a chat or an issue.

### 4. Send a build to TestFlight
1. On GitHub: **Actions** tab › **Gapper iOS: send to TestFlight** › **Run workflow** › green **Run workflow**.
2. Wait about 15 minutes for a green check, then about 15-30 more for Apple to process it.
3. App Store Connect › Gapper › **TestFlight** › **Internal Testing** › **+** › make a group, add yourself.
   Internal testers (people on your Apple team) don't need Apple's review.
4. On your iPhone, install **TestFlight** from the App Store, open the email invite, tap **Install**.
5. Anyone outside your team (league teammates) goes under **External Testing**. Apple checks the first external
   build, usually within a day.

You only need to run the workflow again when the native app code changes. Everything else (analysis, accounts,
design) comes from getgapper.com and updates the moment the site does.

## Store listing (paste into App Store Connect)
- **Name** (30 max): `Gapper: Slowpitch Swing`
- **Subtitle** (30 max): `Built for slowpitch softball`
- **Category**: Sports. Secondary: Health & Fitness.
- **Keywords** (100 max, no spaces after commas; the name is searched already, so it isn't repeated):
  `softball,slow pitch,hitting,batting,exit velo,bat speed,USSSA,coach,drills,rec league,senior`
- **Promotional text** (170 max): `Film your swing on your phone. See your timing, front-foot landing, bat path and
  rotation, get the one fix that matters most, and track your progress all season.`
- **Description**:

  > Gapper is swing analysis built for slow-pitch softball. Not baseball. Not fastpitch.
  >
  > Slow pitch is its own swing. The ball drops in on a high arc, skilled hitters land the front heel about two tenths
  > of a second before contact, and four outfielders leave three gaps to drive the ball through. Gapper is coached for
  > that swing, not a baseball swing with a softball setting.
  >
  > RECORD. Prop your phone up and film a swing, or upload one. Gapper's own camera films at up to 240 frames a second.
  >
  > ANALYZE. Gapper tracks your body through the swing, right on your phone: load-to-contact timing, front-foot landing,
  > balance, rotation and bat path. Watch your swing replay as a strobe-style multi-exposure with your hands' path drawn
  > as a light trail.
  >
  > IMPROVE. Get the one fix that matters most and the drill for it. Track your Gapper Score, strengths and work-ons
  > over the season.
  >
  > Honest numbers. Every number says whether it was measured or estimated. Exit velo, launch angle and bat speed come
  > only from slo-mo video, always with a ± range.
  >
  > Your video stays on your phone. No account needed. Sign in only if you want your swings on every device. No ads, and
  > we never sell your data.

- **Privacy policy URL**: https://getgapper.com/privacy
- **Support URL**: https://getgapper.com/support (page still to be built, with a contact email)
- **Marketing URL**: https://getgapper.com
- **Age rating**: answer "None" / "No" to every question. Gives 4+.
- **Price**: Free.

## App Privacy answers (App Store Connect › App Privacy)
- Do you collect data? **Yes.**
- **Contact Info › Email Address**: used for App Functionality; linked to the user; not used for tracking.
- **User Content › Other User Content** (hitter profile, bats, swing scores, notes, tracked body points): App
  Functionality; linked to the user; not used for tracking.
- Everything else: not collected. Camera, microphone and video stay on the phone, so they aren't "collected".
- Keep these in step with `ios/App/App/PrivacyInfo.xcprivacy` and getgapper.com/privacy.

## Notes for Apple's reviewer (App Review Information › Notes)
> Gapper is swing analysis for adult slow-pitch softball players. No account is needed: the app opens on hitter setup;
> after the short setup you can record or upload a swing.
>
> Native features: the app has its own high-speed camera (AVFoundation, 240/120 fps with true frame timestamps,
> dropped-frame detection, lens data and a level/steadiness check from the motion sensors). A browser camera can't
> film at these frame rates or report true frame times, and Gapper needs both to measure bat speed and exit velocity. Pose tracking and analysis run on
> the device; video never leaves the phone.
>
> To try the high-speed camera: Record › Record at 240 fps (needs a real iPhone; the simulator has no camera).
>
> Accounts are optional (email and password). Account deletion: sign in, then Profile › "Delete account" (at the
> bottom of the account section).

Sign-in is optional, so no demo account is needed. If Apple asks for one anyway, make a throwaway account and put its
email and password in the Sign-in fields of App Review Information (never in this repo).

## If Apple pushes back
- **"Just a website" (Guideline 4.2):** reply pointing at the native 240 fps camera, sensor checks and on-device speed
  measurement above. If they still refuse, the fix is moving more of the record flow into native screens.
- **Name taken:** use a different store name; the name under the icon stays "Gapper".
