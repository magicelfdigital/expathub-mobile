# Meta App Promotion — Post-Install Setup Checklist

This is the manual Ads Manager checklist to upgrade the existing Traffic-objective campaign to **App Promotion** (iOS) and to start a parallel **App Promotion** (Android) campaign once the SDK is shipped to both stores.

**Reference IDs (do not change without coordination):**

- Meta App ID: `2089699021599989`
- iOS App Store ID: `6759266175`
- iOS Bundle ID: `com.expathub.app`
- Android Package: `com.expathub.app`

This checklist assumes the SDK + Pixel work in this task is already merged and a build with `react-native-fbsdk-next` is live in TestFlight (and eventually the App Store / Play Store).

---

## 0. Smoke-test the events first

Before changing campaigns, verify the funnel events are landing in **Meta Events Manager**.

### Mobile app (iOS, react-native-fbsdk-next)

1. Open **Events Manager** → select the **App** dataset for ExpatHub (App ID `2089699021599989`).
2. Open **Test Events**.
3. On a real iOS device with the dev build (or TestFlight), trigger:
   - Open the app → expect SDK init (no event yet — auto-logged events show up as "Activate App").
   - Complete the readiness quiz → expect `CompletedQuiz` with `top_country` parameter.
   - Open the paywall → expect `ViewedPaywall`.
   - Tap the annual / 14-day-trial button and confirm purchase (sandbox account) → expect `StartTrial` (value `0`).
   - Buy the monthly plan after the trial → expect `Subscribe` with the actual USD amount.
4. Confirm **no PII** appears in any payload (no email, no name, no user ID — only `top_country`, `value`, `plan`, `entry_point`).

### Website (react-facebook-pixel, Pixel ID `2089699021599989`)

1. Install the **Meta Pixel Helper** Chrome extension.
2. Visit the production / staging website. The extension should show the Pixel firing.
3. Verify these fire at the right moments:
   - Any route change → `PageView`.
   - Land on `/start` → `InitiateCheckout` (`funnel: readiness_quiz`).
   - Submit the quiz email capture (when the web quiz funnel ships) → `Lead`.
   - Start a Stripe trial (when web pricing ships) → `StartTrial` with `value: 0`.
   - Stripe purchase success page → `Subscribe` with `value` set to the actual price.
4. Cross-check in **Events Manager** → **Test Events** → enter the test browser ID.

If any of the above does **not** fire, stop and fix before proceeding to campaign work.

---

## 1. Connect the iOS app in Events Manager

1. Open **Events Manager** → **Data Sources** → confirm the iOS app row exists with App ID `2089699021599989`.
2. If missing, click **Connect Data** → **App** → **iOS** → enter Bundle ID `com.expathub.app` and App Store ID `6759266175`.
3. In the app's **Settings** → **Basic** in [developers.facebook.com](https://developers.facebook.com), confirm:
   - iOS Bundle ID: `com.expathub.app`
   - iPhone Store ID: `6759266175`
   - Client token: matches the `EXPO_PUBLIC_META_CLIENT_TOKEN` Replit Secret.

> **Why no `react-native-fbsdk-next` config plugin in `app.json`?** The plugin
> would require the Facebook client token to be hard-coded in source. Instead,
> the SDK is initialized **at runtime** in `src/lib/analytics.ts` →
> `initFbSdk()` using `Settings.setAppID()` and `Settings.setClientToken()`
> with the values pulled from `EXPO_PUBLIC_META_APP_ID` and
> `EXPO_PUBLIC_META_CLIENT_TOKEN`. This is sufficient for App Events. If you
> later add Facebook Login, you'll need to add the iOS URL scheme
> (`fb2089699021599989`) to `app.json` → `ios.infoPlist.CFBundleURLTypes`.

## 2. Configure the SKAdNetwork conversion schema (iOS)

1. Events Manager → iOS app → **Settings** → **Aggregated Event Measurement**.
2. Add the conversion schema with this priority order (highest priority at the top):
   1. `Subscribe` (value optimization on)
   2. `StartTrial`
   3. `ViewedPaywall`
   4. `CompletedQuiz`
3. Save and wait ~24h for Meta to validate the schema before launching ads.

## 3. Pause the existing Traffic campaign

1. Ads Manager → find the current Traffic-objective campaign that points to the App Store URL.
2. Note its daily budget, targeting, and best-performing creatives — you'll reuse them.
3. **Pause** the campaign once the new App Promotion campaign is live and serving (do not pause first; keep the bridge running until App Promotion is delivering).

## 4. Create the iOS App Promotion campaign

1. Ads Manager → **Create** → **App Promotion** → **App Installs**.
2. App store: **iOS App Store**. App: select the ExpatHub iOS app (it must show up because the SDK is now installed and reporting App Events).
3. Optimisation event:
   - For Months 1–2 (warm-up): optimise for **App Installs**.
   - Once `Subscribe` has fired ≥ 50× per week per ad set: switch to **Value optimisation** with `Subscribe`.
4. Audience: start with the same audience that worked in the Traffic campaign. Layer in **Lookalike (1%)** off paying customers once you have ≥ 100 `Subscribe` events.
5. Placements: **Advantage+ placements** (default).
6. Creatives: reuse the top 3 creatives from the Traffic campaign + add 1 new app-install-style creative (screen recording of the quiz → Decision Brief).
7. Daily budget: match the Traffic campaign's daily budget; do not increase by more than 20% per week.

## 5. Create the Android App Promotion campaign

Android is **not** currently published via Replit's Expo Launch flow; do this only after the Android build is live in the Play Store and the SDK has fired ≥ 1 App Event from a Play Store install.

1. Ads Manager → **Create** → **App Promotion** → **App Installs**.
2. App store: **Google Play**. App: select the ExpatHub Android app (package `com.expathub.app`).
3. Optimisation event: same warm-up sequence as iOS.
4. Audience: separate ad set from iOS — Android CPI and conversion rates differ.
5. Reuse iOS creatives but check that any iOS-only screen text is swapped (e.g., "App Store" → "Google Play").

## 6. Retargeting (web Pixel-driven)

Once the Pixel has been firing for ≥ 7 days:

1. Audiences → **Create Audience** → **Custom Audience** → **Website**.
   - "Visited /start in last 30 days" → quiz starters.
   - "Fired `Lead` in last 30 days" → email-captured leads.
   - "Fired `ViewedPaywall` AND NOT `Subscribe` in last 14 days" → cart abandoners.
2. Create one retargeting **Conversions** campaign per audience, optimising for `Subscribe`.

## 7. Reporting

- Add the columns: `App Installs`, `Cost per App Install`, `Subscribe`, `Cost per Subscribe`, `StartTrial`, `Cost per StartTrial`, `Purchase ROAS`.
- Compare CPI / CPS against the old Traffic campaign benchmark for 2 weeks before declaring the upgrade a success.

---

## Source of truth

- Funnel event firing for mobile: `src/lib/analytics.ts` (`logFbEvent`).
- Funnel event firing for web: `web/src/lib/pixel.ts`.
- SDK / Pixel keys: `EXPO_PUBLIC_META_APP_ID`, `EXPO_PUBLIC_META_CLIENT_TOKEN`, `VITE_META_PIXEL_ID` (Replit Secrets — **never** committed to source).
- iOS / Android SDK init: runtime only via `initFbSdk()` in `src/lib/analytics.ts` (no `react-native-fbsdk-next` config plugin in `app.json`).
