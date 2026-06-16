---
name: RevenueCat logIn idempotency check
description: Why an idempotency guard around rc.logIn based on getAppUserId() may never actually skip, and why that is safe.
---

# RevenueCat logIn idempotency

`getAppUserId()` returns `customerInfo.originalAppUserId`. That value is the
*original* (first-seen) app user id, which on an anonymous→identified user can
remain the `$RCAnonymousID:...` value even after a successful `rc.logIn(realId)`.

**Consequence:** an idempotency guard that skips retries when the current id
`=== appUserId` or no longer starts with `$RCAnonymousID` may never trigger,
because `originalAppUserId` can stay anonymous post-login.

**Why it is still safe:** `rc.logIn` is itself idempotent — a redundant call
with the same id is a no-op that returns current `customerInfo`. So a retry
loop around it never double-binds or corrupts identity; the guard is only an
optimization to avoid a redundant network call, not a correctness requirement.

**How to apply:** do not rely on this guard to short-circuit; treat the retry
loop's correctness as resting on `logIn` idempotency, not on the skip check. If
you need a reliable "already identified?" signal, you cannot get it from
`originalAppUserId` alone.
