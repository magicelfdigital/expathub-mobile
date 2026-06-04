---
name: Async-hydrating branch flicker on gated screens
description: Why screens that pick a layout from multiple async-loading contexts flash on entry, and the gating rule that fixes it.
---

# Async-hydrating branch flicker

A screen that selects which body to render based on values that hydrate
asynchronously (and at different times) will visibly flash through several
intermediate layouts on every entry.

Concrete case: the planner "Your Plan" screen branches on `isPaidUser`
(EntitlementContext starts `loading=true`, so it reads false until RevenueCat
init + backend entitlement fetch resolve) and `hasPlanForThisCountry`
(PlanContext hydrates the active plan from AsyncStorage, so it is null on first
render). On entry the screen swapped: free/locked preview → "start a plan"
focus card → real tracker. Worse on native/TestFlight because RevenueCat init
widens the entitlement window.

**Rule:** when a screen's top-level branch depends on more than one
async-settling source, gate the whole render behind a single calm placeholder
until every branch-driver has settled — do not let it render partial/early
states. Put the gate AFTER all hooks so hook order is preserved.

**Why:** each driver resolving on its own schedule produces a distinct fully
rendered layout, and the user sees the swaps as flashing.

**How to apply:**
- Treat "still loading" as its own state, distinct from the resolved values.
- For entitlement, "resolved" means first determination is done — use a
  first-resolution marker (e.g. `lastRefreshAt != null`) rather than the raw
  `loading` flag, so background re-refreshes do not re-trigger the spinner.
- For AsyncStorage-backed contexts, expose and wait on an `isLoaded` flag.
- Verify the gate cannot get stuck: the underlying loads must always settle
  (success or failure) so the placeholder is never permanent.
