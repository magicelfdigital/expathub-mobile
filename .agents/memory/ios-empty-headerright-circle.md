---
name: iOS empty headerRight renders as a blank white circle
description: Why a header-right slot shows an empty white circle on iOS, and the fix
---

On a native-stack screen, setting `headerRight: () => <Component />` where the
component renders `null` (e.g. a badge gated behind an entitlement) still makes
the native iOS stack allocate a header bar button. Modern iOS draws that empty
button with a circular background, so users see a **blank white circle** in the
top-right corner.

**Why:** The native header button is created from the *presence* of the
`headerRight` option, not from whether the React subtree renders anything. A
component returning `null` is not the same as omitting the option.

**How to apply:** When the right-side content is conditional, set `headerRight`
to `undefined` (omit it) when there is nothing to show — do not pass a function
that returns `null`. Screens that never set `headerRight` (e.g. a hub screen)
never show the circle, which is a good way to confirm this diagnosis.

**Async-resolve caveat (the subtle one):** `headerRight: hasAccess ? undefined : () => <Badge />`
is NOT enough when `hasAccess` loads asynchronously. Entitlement/auth flags start
falsy, so on first render `headerRight` is a function; when the flag resolves and
the option flips function→`undefined`, native-stack does not reliably drop the
already-allocated button, leaving the blank circle for subscribers. Fix: only
attach `headerRight` once the value has RESOLVED and you have visible content —
`const show = !loading && !hasAccess; headerRight: show ? () => <Badge /> : undefined`.
That keeps subscribers on `undefined` the whole time (never a function) and the
badge always renders real text when shown.
