---
name: Jest cannot load .mjs ESM without an explicit transform
description: Why a jest project that imports a shared .mjs helper needs a babel-jest transform entry, or its whole test suite fails to load.
---

A jest project configured with `transform: tsJestTransform` (only `^.+\.tsx?$`)
will throw `SyntaxError: Unexpected token 'export'` the moment a test imports a
`.ts` that transitively imports a `.mjs` ESM module (e.g. `freshnessThresholds.mjs`,
`extractBriefs.mjs`). ts-jest only transforms `.ts`/`.tsx`; the `.mjs` is left raw
and jest tries to run it as CommonJS.

**Fix:** add `"^.+\\.mjs$": "babel-jest"` to that project's `transform` map
(babel-jest + babel-preset-expo transpile the ESM to CJS). Done for the `server`
project in `jest.config.js`.

**Why it matters:** the failure takes down the *entire* test suite file, not just
the assertion that uses the helper, and it's silent locally because the full jest
run OOMs/times out — so you only see it when running that one project. We share
RN-graph-free helpers as plain `.mjs` (so node monitoring scripts can import them
without the Expo module graph); any new server/test that imports such a helper
relies on this transform being present.

**How to apply:** if you add a `.mjs` import to a jest-tested area, confirm that
project's `transform` includes the `.mjs` babel-jest entry, or add it.

For a `.mjs` file, the matching TypeScript declaration must be named `.d.mts`
(not `.d.ts`) or `allowJs` inference will win and produce loose/`null`-widened types.
