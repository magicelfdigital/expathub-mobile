---
name: Backend URL fallback
description: How getBackendBase() resolves the backend host and why it must not throw.
---

`src/billing/backendClient.ts#getBackendBase()` resolves the backend in this order:
1. `EXPO_PUBLIC_BACKEND_URL` (explicit override)
2. `EXPO_PUBLIC_DOMAIN` (https-prefixed)
3. `""` on web (same-origin), `PROD_BACKEND_URL` (`https://www.expathub.website`) on native

**Why:** an earlier version threw `"Missing EXPO_PUBLIC_BACKEND_URL — mobile builds must explicitly set backend base URL."` whenever the env var was missing on native. That intent ("fail loud so we never silently hit the wrong backend") kept biting us repeatedly — in Expo Go dev (env vars aren't baked in), and in prod when an EAS build was produced without the env var. The backend host is a known constant (mirrored in `eas.json` and `PRD.md`), so a hardcoded prod fallback is both safer and louder than a crash.

**How to apply:**
- Do not reintroduce the throw. If you need stricter behavior in a specific code path, gate it locally (e.g., refuse to call billing endpoints when running against an unexpected host) rather than crashing at module init.
- The `EXPO_PUBLIC_BACKEND_URL` baked into `eas.json` is still the source of truth for production; the hardcoded constant is the safety net.
- If `PROD_BACKEND_URL` ever needs to change, update it in `backendClient.ts` AND in `eas.json` together.
