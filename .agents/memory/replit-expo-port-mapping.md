---
name: Replit Expo Go port mapping
description: Why scanning the Expo QR in Replit can return 502 and how to fix it.
---

Expo's QR code on Replit encodes `exp://<repl-domain>` with no explicit port. The `exp://` scheme defaults to port 80, so the QR target is whatever `localPort` is mapped to `externalPort = 80` in `.replit`.

**Why:** if Metro is bound to a port that is NOT the one mapped to externalPort 80, scanning the QR returns 502 from Replit's edge (nothing is listening on the requested external port). The standard Replit Expo template puts Expo on 8081 mapped to 80, but this project has 8082 mapped to externalPort 80 and 8081 mapped to externalPort 8081.

**How to apply:**
- The `Start Frontend` workflow must pass `--port 8082` so Metro binds to the localPort that resolves to externalPort 80.
- Do not try to edit `.replit` directly — the platform blocks it. Adjust the workflow command instead.
- If the QR ever 502s again, first check which localPort is mapped to externalPort 80 in `.replit`, then make sure Metro binds there.
