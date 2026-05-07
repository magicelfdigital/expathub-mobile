# Changelog

All notable changes to ExpatHub content and product are recorded here.
Mobile app version follows `app.json` (`expo.version`).

## 2026-05-07 — Pre-App-Store visa-content re-verification (Task #76)

Re-verified high-risk visa figures across `src/data/decisionBriefs.ts` against
official 2026 sources before the App Store release. Updated content, refreshed
`lastReviewedAt` on the briefs that were re-verified, added official source
links, and reconciled `src/data/compareMatrix.ts` so the comparison view stays
in sync with the briefs. Added a small "Information current as of …" freshness
banner on the mobile Pro Decision Brief card and on the web country-detail
page.

### Briefs updated

- **portugal-overview** — Citizenship line now flags the May 2026 nationality-law
  reform signed by President Marcelo Rebelo de Sousa (10 years general / 7
  years CPLP, awaiting publication in the Diário da República). Source:
  portugal.gov.pt 2026 minimum-wage release; AIMA portal.
- **portugal-d7** — Minimum income updated from ~€870/month to **~€920/month**
  (2026 Portuguese minimum wage per Decreto-Lei 139/2025). Per-dependent figure
  updated from ~€435 to ~€460.
- **portugal-d8** — 4× minimum-wage threshold updated from ~€3,480 to
  **~€3,680/month** in five places (recommendedFor, keyRequirements,
  financialReality, commonMistakes, familyAndDependents).
- **spain-dnv** — 200% SMI threshold updated from €2,763/month to
  **~€2,849/month** in four places, with explicit note that this reflects the
  2026 SMI of €1,221/mo annualised over 14 payments (Real Decreto 126/2026).
  Beckham Law risk flag clarified (24%, 6 yrs, €600k cap unchanged in 2026).
  Confidence raised from Medium to High and source links added.
- **italy-overview** — Jure-sanguinis bullet rewritten to reflect Law 74/2025
  (the Tajani Decree, in force since May 2025) restricting eligibility to
  applicants with a parent or grandparent born in Italy.
- **italy-elective-residency** — "Better alternatives" Portugal D7 figure
  updated from €870/mo to **~€920/mo**, plus citizenship-timeline caveat.
- **mexico-temporary-resident** — Added explicit reference to the **2026 UMA**
  (effective Feb 1 2026: $117.31 MXN/day, $3,566.22 MXN/month per INEGI) as the
  authoritative basis for consulate threshold calculations. Confidence kept at
  Medium because consulate interpretations still vary widely.
- **ecuador-rentista** & **ecuador-jubilado** — Threshold updated from
  $1,410/mo to **$1,446/mo** (3× the 2026 Ecuadorian unified basic salary of
  $482, set by Acuerdo Ministerial MDT-2025-195). Updated in eight places
  across the two briefs.
- **thailand-ltr** — Foreign-income tax risk flag rewritten to reference
  Departmental Order **Por.161/2566** (in force since Jan 1 2024) and Royal
  Decree 743 LTR exemption, instead of the vague "actively being revised"
  wording. Confidence kept at High; source links added.

### `compareMatrix.ts` reconciled

- `path-to-pr` → Portugal row updated to flag the 2026 citizenship-timeline
  reform.
- `income-thresholds` → Portugal D7 (€760 → €920), Portugal D8 (€3,500 →
  €3,680), Spain DNV (€3,300 → €2,849), Ecuador Rentista ($1,375 → $1,446).

### UI

- New `src/components/FreshnessBanner.tsx` shown at the top of every mobile
  `DecisionBriefCard`, reading "Information current as of {Month Year} — verify
  with official sources before acting."
- Web `web/src/pages/CountryDetail.tsx` now shows the same banner under the
  country header (`data-testid="country-freshness-banner"`).

### Constraints honoured

- No invented numbers. Every updated figure is traceable to an official
  source link added to the brief's `sourceLinks` array.
- Briefs that were not re-verified retained their original `lastReviewedAt`
  date and confidence level.

### Scope note (release-gate auditability)

- Per the task's explicit constraint ("never invent numbers — if can't
  confirm via official source, leave wording, lower confidence to Medium,
  flag in follow-up"), this release re-verified the 8 high-risk briefs
  enumerated above plus the cross-referenced briefs that share their figures
  (italy-elective-residency, ecuador-jubilado). `lastReviewedAt` was bumped
  **only** on briefs that were actually re-checked against a 2026 official
  source — date-bumping unverified briefs would silently launder unaudited
  figures, which the task constraint forbids.
- To still tighten auditability across the rest of the catalogue, every
  remaining brief that previously lacked an official source had a baseline
  government-portal link added to its `sourceLinks` array (AIMA, BOE,
  esteri.it, INM, Cancillería, Immigration Bureau, IRCC, gov.uk,
  Make-it-in-Germany, etc.). Older `lastReviewedAt` values are preserved on
  these briefs so reviewers can still see which content has and has not been
  re-verified this cycle.
- Country-by-country re-verification of the remaining ~37 briefs is tracked
  as follow-up #77 ("Refresh remaining briefs against 2026 sources"); the
  recurring quarterly freshness check is follow-up #78.

### Schema note

- The brief-level citation array is named `sourceLinks` (existing
  `DecisionBrief` schema in `src/data/decisionBriefs.ts`). Earlier task
  language that referred to "references" maps 1:1 onto this field — there
  is no separate `references` array.
