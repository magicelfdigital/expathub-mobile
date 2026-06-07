---
name: Planner render-gate fail-safe
description: Why the planner screen needs a timeout escape hatch and can otherwise spin forever
---

The country planner screen hard-gates its render on EVERY async driver settling
(entitlement loading, PlanContext load, progress query). The underlying network
calls (entitlement fetch via the billing backend client, and the `/api/progress`
fetch via `expo/fetch`) have NO request timeout. If any one hangs on-device, its
loading flag never flips false and the gate spins on a spinner forever — the
"planner doesn't load at all" report. Other screens don't hard-gate, so they
stay usable while only the planner appears dead.

**Rule:** any render gate that blocks on multiple no-timeout async drivers MUST
have a ceiling/fail-safe that renders best-known state after a bounded wait.
The planner uses `PLANNER_GATE_MAX_WAIT_MS` + a one-shot timer that flips
`gateTimedOut`; `screenReady = screenReadyRef.current || gateTimedOut`.

**Why:** a one-time free/locked flicker is far better than a permanently dead
screen. Normal loads settle well under 1s, so the ceiling only fires on the
pathological hang path.

**How to apply:** when debugging "X never loads", first check whether the gate
depends on a flag fed by a fetch with no timeout/abort. The real root-cause fix
is adding request timeouts; the UI fail-safe is the guaranteed backstop. Note
the entitlement fetch lives in protected billing files — do not add timeouts
there without an explicit task.
