---
name: Replit proxy URLs in package-lock.json break EAS builds
description: Why EAS "Install dependencies" fails with ENOTFOUND and the safe fix
---

# Replit package-firewall URLs poison package-lock.json for external CI

`npm install` run **inside the Replit container** can write Replit's internal proxy host into a lockfile `resolved` field, e.g. `http://package-firewall.replit.local/npm/<pkg>/-/<pkg>-<ver>.tgz`. It works in-repl (the proxy resolves there) but **any external builder cannot resolve that host**.

**Symptom:** EAS iOS/Android build fails in the **Install dependencies** phase running `npm ci --include=dev` with:
`npm error code ENOTFOUND ... request to http://package-firewall.replit.local/npm/<pkg> failed, reason: getaddrinfo ENOTFOUND package-firewall.replit.local`. Nothing to do with build number or app code.

**Why:** only a subset of entries get poisoned (saw exactly 1 of ~1864 — `drizzle-orm`), so it's easy to miss; the rest correctly point at `registry.npmjs.org`.

**How to apply / fix:**
- Do NOT "fix" by running `npm install` in-repl — that can re-inject the proxy host.
- Patch the text directly: replace every `http://package-firewall.replit.local/npm/` with `https://registry.npmjs.org/`. The path tail (`<pkg>/-/<file>.tgz`, scoped pkgs included) is identical, and `integrity` hashes are content-based so they stay valid. Re-`JSON.parse` to confirm validity.
- Audit with node, not grep (grep can mangle tokens here): count `package-firewall\.replit\.local` occurrences and list distinct hosts in `packages[*].resolved`.
- Push the corrected lockfile to **GitHub** too (EAS pulls source from the repo). Fetch GitHub's blob via the git tree+blob API (contents API caps ~1MB; the lockfile is ~950KB but use tree/blob to be safe), patch the single host, push as a one-file commit (see git-push-rejections.md for the API-push method).
- Also check for a committed `.npmrc` pointing `registry=` at the proxy — that would break EAS the same way (none present as of 2026-06-11).
