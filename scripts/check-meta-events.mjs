#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const MOBILE_EVENTS = [
  {
    event: "CompletedQuiz",
    file: "app/onboarding/result.tsx",
    requiredParams: ["top_country", "tier"],
  },
  {
    event: "ViewedPaywall",
    file: "src/components/ProPaywall.tsx",
    requiredParams: ["entry_point", "top_country"],
  },
  {
    event: "StartTrial",
    file: "src/components/ProPaywall.tsx",
    requiredParams: ["plan"],
  },
  // Note: `Subscribe` is intentionally NOT fired from the mobile client.
  // Both Monthly Explorer and Annual Pathfinder now include a 14-day free
  // trial, so the paywall fires `StartTrial` at trial activation. The paid
  // `Subscribe` conversion event is fired server-side from the
  // RevenueCat/Stripe webhook (upstream expathub.world repo) when the trial
  // converts to a paid charge. See `logFbPurchaseEvent` in
  // `src/components/ProPaywall.tsx` and docs/meta-app-promotion-setup.md.
  // Mid-funnel signal for Meta App Promotion optimisation. Fires when the
  // user taps a plan on the paywall, before purchase confirmation.
  {
    event: "AddToCart",
    file: "src/components/ProPaywall.tsx",
    requiredParams: ["plan"],
  },
  // Mid-funnel signal: visitor submitted an email in the country waitlist
  // modal. Mirrors web's `trackLead` from QuizSaveModal.
  {
    event: "Lead",
    file: "app/(tabs)/explore/index.tsx",
    requiredParams: ["source"],
  },
];

// The mobile SDK auto-stamps fb_currency: "USD" on any logEvent call that
// receives a numeric value (see src/lib/analytics.ts → logFbEvent). Assert
// that wiring is still in place so the doc's StartTrial/Subscribe currency
// promise is honored.
const MOBILE_LIB_REQUIREMENTS = [
  {
    label: "logFbEvent stamps fb_currency: \"USD\" on numeric-value events",
    regex: /fb_currency\s*:\s*"USD"/,
  },
];

const WEB_EVENTS = [
  {
    event: "PageView",
    file: "web/src/App.tsx",
    helper: "trackPageView",
  },
  {
    event: "InitiateCheckout",
    files: ["web/src/pages/Start.tsx", "web/src/pages/Pricing.tsx"],
    helper: "trackInitiateCheckout",
  },
  {
    event: "Lead",
    files: ["web/src/pages/Start.tsx", "web/src/components/QuizSaveModal.tsx"],
    helper: "trackLead",
  },
  // Mid-funnel signal: visitor tapped a plan on /pricing, before redirect
  // to Stripe Checkout. Mirrors mobile's `AddToCart` in ProPaywall.
  {
    event: "AddToCart",
    file: "web/src/pages/Pricing.tsx",
    helper: "trackAddToCart",
    requiredArgPatterns: [/plan/],
  },
  {
    event: "StartTrial",
    file: "web/src/pages/Pricing.tsx",
    helper: "trackStartTrial",
    requiredArgPatterns: [/value\s*:\s*0/, /currency\s*:\s*"USD"/, /plan\s*:\s*"annual"/],
  },
  {
    event: "Subscribe",
    file: "web/src/pages/Account.tsx",
    helper: "trackSubscribe",
    requiredArgPatterns: [/value\s*:/, /currency\s*:/, /plan\s*,?/],
  },
];

const PII_PATTERNS = [
  { name: "email", regex: /logFbEvent\([^)]*\bemail\b/ },
  { name: "userId", regex: /logFbEvent\([^)]*\b(userId|user_id|uid)\b/ },
  { name: "firstName", regex: /logFbEvent\([^)]*\b(firstName|first_name|lastName|last_name|name)\s*:/ },
];

async function readSource(rel) {
  return readFile(resolve(ROOT, rel), "utf8");
}

const failures = [];

for (const { event, file, requiredParams } of MOBILE_EVENTS) {
  const src = await readSource(file).catch(() => null);
  if (src == null) {
    failures.push(`[mobile] ${event}: file ${file} not readable`);
    continue;
  }
  const callRegex = new RegExp(`logFbEvent\\(\\s*["']${event}["']`);
  if (!callRegex.test(src)) {
    failures.push(`[mobile] ${event}: no logFbEvent("${event}", ...) call in ${file}`);
    continue;
  }
  for (const param of requiredParams ?? []) {
    const blockRegex = new RegExp(
      `logFbEvent\\(\\s*["']${event}["'][\\s\\S]*?\\b${param}\\b[\\s\\S]*?\\)`,
    );
    if (!blockRegex.test(src)) {
      failures.push(`[mobile] ${event}: missing param "${param}" in ${file}`);
    }
  }
}

let webCallSiteCount = 0;
for (const entry of WEB_EVENTS) {
  const { event, helper, requiredArgPatterns } = entry;
  const files = entry.files ?? [entry.file];
  for (const file of files) {
    const src = await readSource(file).catch(() => null);
    if (src == null) {
      failures.push(`[web] ${event}: file ${file} not readable`);
      continue;
    }
    const callRegex = new RegExp(`\\b${helper}\\s*\\(`);
    if (!callRegex.test(src)) {
      failures.push(`[web] ${event}: helper ${helper}() not called in ${file}`);
      continue;
    }
    webCallSiteCount += 1;
    for (const pat of requiredArgPatterns ?? []) {
      const blockRegex = new RegExp(
        `\\b${helper}\\s*\\([\\s\\S]*?${pat.source}[\\s\\S]*?\\)`,
      );
      if (!blockRegex.test(src)) {
        failures.push(`[web] ${event}: ${helper}() in ${file} missing required arg matching /${pat.source}/`);
      }
    }
  }
}

const analyticsSrc = await readSource("src/lib/analytics.ts");
for (const { name, regex } of PII_PATTERNS) {
  if (regex.test(analyticsSrc)) {
    failures.push(`[pii] mobile analytics.ts appears to forward "${name}" into a Meta event payload`);
  }
}
for (const { label, regex } of MOBILE_LIB_REQUIREMENTS) {
  if (!regex.test(analyticsSrc)) {
    failures.push(`[mobile-lib] src/lib/analytics.ts: ${label} — pattern ${regex} not found`);
  }
}

const callSiteFiles = MOBILE_EVENTS.map((m) => m.file);
for (const file of new Set(callSiteFiles)) {
  const src = await readSource(file);
  for (const { name, regex } of PII_PATTERNS) {
    if (regex.test(src)) {
      failures.push(`[pii] ${file} appears to forward "${name}" into a Meta event payload`);
    }
  }
}

if (failures.length > 0) {
  console.error("Meta event verification FAILED:\n");
  for (const line of failures) console.error("  - " + line);
  console.error(
    "\nUpdate the call sites or, if the event was intentionally renamed, " +
      "update scripts/check-meta-events.mjs and docs/meta-app-promotion-setup.md together.",
  );
  process.exit(1);
}

console.log("Meta event verification OK");
console.log(`  ${MOBILE_EVENTS.length} mobile events / ${MOBILE_EVENTS.length} call sites verified`);
console.log(`  ${WEB_EVENTS.length} web events / ${webCallSiteCount} call sites verified`);
console.log(`  no obvious PII leaks into Meta payloads`);
