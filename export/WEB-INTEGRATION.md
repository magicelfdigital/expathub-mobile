# ExpatHub Web Integration - Data Files

## Overview

The `export/` folder contains all ExpatHub content data as JSON files, exported from the mobile app's source of truth. These files power the web version at expathub.world.

## Files

| File | Description | Size |
|------|-------------|------|
| `countries.json` | All 33 countries with name, slug, region, and popularity flag | 3 KB |
| `pathways.json` | Visa/residency pathways per country (title, summary, who it's for, steps, timeline, cost, official links) | 17 KB |
| `resources.json` | Official government and community links per country (visa, tax, healthcare, housing, work) | 7 KB |
| `vendors.json` | Service providers per country (lawyers, accountants, relocation services) | 4 KB |
| `community.json` | Community links per country (meetups, forums, Facebook groups, expat organizations) | 5 KB |
| `decision-briefs.json` | 27 premium Decision Briefs across 8 launch countries - the core paid content | 232 KB |
| `coverage.json` | Which countries are "decision-ready" vs "coming-soon", and section-level coverage | 5 KB |

## Data Structures

### countries.json
```json
{
  "countries": [
    { "name": "Portugal", "slug": "portugal", "region": "Europe", "popular": true }
  ],
  "regionOrder": ["Europe", "North America", "Central America", "South America", "Asia", "Oceania"]
}
```

### pathways.json
Keyed by country slug. Each pathway has:
- `key` - unique identifier within country
- `title` - display name (e.g., "D7 (Passive Income)")
- `summary` - one-paragraph description
- `whoFor` / `notFor` - string arrays
- `premium` - boolean, true = behind paywall
- `officialLinks` - array of `{ label, url }`
- `steps` - optional string array of application steps
- `timeline` - optional string
- `costRange` - optional string

### resources.json
Keyed by country slug. Each resource has:
- `label` - display name
- `note` - optional description
- `url` - link to official/community resource
- `sourceType` - "official" | "community" | "expert"
- `category` - "visa" | "tax" | "housing" | "healthcare" | "work"

### vendors.json
Keyed by country slug. Each vendor has:
- `name` - display name
- `category` - "Legal" | "Tax" | "Housing" | "Relocation"
- `url` - link
- `note` - optional description

### community.json
```json
{
  "community": { "portugal": [...], "spain": [...] },
  "defaultCommunity": [...]
}
```
Each link has: `name`, `type` (Meetups/Forums/Facebook/etc), `url`, optional `note`.

### decision-briefs.json
Array of Decision Brief objects. Each has:
- `id` - unique identifier (e.g., "portugal-overview", "portugal-d7")
- `countrySlug` - which country
- `pathwayKey` - optional, links to a specific pathway (null = country overview brief)
- `headline` - punchy, opinionated headline
- `decisionSummary` - 2-3 sentence summary
- `recommendedFor` / `notRecommendedFor` - string arrays
- `keyRequirements` - string array
- `financialReality` - string array with real costs
- `timelineReality` - string array with real timelines
- `riskFlags` - string array of warnings
- `commonMistakes` - string array
- `betterAlternatives` - optional string array
- `workReality` - optional string array
- `familyAndDependents` - optional string array
- `lifestyleAndCulture` - optional string array
- `confidenceLevel` - "High" | "Medium" | "Conditional"
- `lastReviewedAt` - ISO date string
- `sourceLinks` - optional array of `{ label, url, type }`
- `changeLog` - optional array of `{ date, summary, severity }`

### coverage.json
```json
{
  "launchCountries": ["portugal", "spain", ...],
  "coverage": {
    "portugal": {
      "isLaunchCountry": true,
      "isDecisionReady": true,
      "coverage": {
        "ready": [{ "countrySlug": "portugal", "pathwayKey": "d7", "status": "decision-ready", "label": "D7 (Passive Income)" }],
        "soon": []
      }
    }
  },
  "summary": {
    "ready": "Portugal, Spain, Canada, Costa Rica, Panama, Ecuador, Malta, UK",
    "soon": "France, Italy, Thailand, Mexico, and more"
  }
}
```

## Premium Content Gating

Decision Briefs are the premium paid content. The web should gate access based on:

1. **30-Day Decision Pass** ($29) - full access to all briefs for 30 days
2. **Country Lifetime Unlock** ($69/country) - permanent access to one country's briefs
3. **Monthly Subscription** ($14.99/month) - ongoing full access

Free users can see pathway titles, summaries, and `whoFor`/`notFor` from pathways.json. The detailed Decision Briefs (financialReality, riskFlags, commonMistakes, etc.) should be behind the paywall.

## Launch Countries (8)

portugal, spain, canada, costa-rica, panama, ecuador, malta, united-kingdom

These have full Decision Briefs. Other countries have basic pathway/resource data but no briefs yet.

## Keeping Data In Sync

The source of truth for all data lives in the mobile app codebase (Replit). To regenerate these JSON files after content updates:

```
npx tsx scripts/export-data.ts
```

This reads from the TypeScript source files in `data/` and `src/data/` and outputs fresh JSON to `export/`.

## Authentication

The mobile app authenticates against the API at expathub.world. User accounts, subscription status, and entitlements should be shared between mobile and web.
