---
name: Running the Jest suite locally
description: How to run the full Jest suite in this repl without OOM/timeouts, and a known suite-load failure.
---

# Running the Jest suite locally

The full `npx jest --ci` run does not finish inside the agent's 120s command cap, and
running large filtered batches with `--runInBand` OOMs the container (Node heap abort).

**How to apply:** run by project/area in smaller chunks with bounded workers, e.g.
`npx jest --ci --maxWorkers=2 "server/"`, or run individual heavy `.test.tsx` files.
The `server/` project is the heaviest. CI (`jest.yml` on GitHub runners) has more memory
and runs the whole thing in one shot, so a clean chunked local pass is sufficient signal.

**Known pre-existing failure (not env-specific):** the worksheets screen tests
(`app/(tabs)/(home)/worksheets/__tests__/anonymousFlow.test.tsx` and `worksheets.test.tsx`)
fail to *load* because `worksheets/[id].tsx` imports `expo/fetch` (ESM) and the ts-jest
config in `jest.config.js` only transforms `.tsx?` — there is no transform/ignore path for
expo's ESM JS, so the import throws at module-eval time. This is unrelated to most changes;
fixing it needs a transform or a `jest.mock("expo/fetch", ...)` in those suites.
