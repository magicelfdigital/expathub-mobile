# ExpatHub Web Project - Handoff Document

Use this document to instruct the agent in the ExpatHub web project. Copy the relevant sections below as context.

---

## Product Overview

ExpatHub is an expat relocation app with 8 decision-ready launch countries: Portugal, Spain, Canada, Costa Rica, Panama, Ecuador, Malta, and United Kingdom. It provides country-specific guides, official resources, vendor directories, community connections, and premium "Decision Briefs" behind a subscription paywall.

### Business Model
- **Freemium**: Free country overviews, resources, vendors, community links, and basic pathway summaries.
- **Pro subscription**: $14.99/month or $99/year. Unlocks Decision Briefs (opinionated, detailed relocation advice), premium pathway guides, and comparison matrix pro-only rows.
- **Payment**: RevenueCat for iOS/Android, Stripe for web.

### App Descriptions

**Short (80 chars):**
Compare countries, get decision briefs & make your move abroad with clarity.

**Full:**
ExpatHub helps you cut through the noise of international relocation with decision-ready intelligence for 8 launch countries: Portugal, Spain, Canada, Costa Rica, Panama, Ecuador, Malta, and the UK.

Stop spending months on forums and Facebook groups trying to piece together outdated advice. ExpatHub gives you structured, opinionated guidance so you can actually make a decision.

WHAT YOU GET FOR FREE:
- Country comparison tools to narrow your shortlist
- Official government resource links (immigration offices, tax authorities, healthcare portals)
- Vetted vendor directories for each country (immigration lawyers, tax advisors, relocation services)
- Community connections and expat group links
- Cost of living overviews and quality of life factors

WHAT PRO UNLOCKS:
- Decision Briefs: detailed, opinionated guides that tell you what actually works
- Work authorization clarity: which visa lets you do what, and realistic timelines
- Sponsorship requirements: what employers need to hire you, and who actually does it
- Visa choice guidance: stop guessing which pathway fits your situation
- Financial reality checks: true costs beyond the glossy blog posts
- Common mistakes section: learn from others' expensive errors

WHO THIS IS FOR:
- Remote workers exploring where to base themselves
- Professionals considering an international career move
- Retirees researching affordable, high-quality destinations
- Digital nomads ready to put down roots
- Families evaluating the best country for their next chapter

ExpatHub doesn't sell you a dream. We give you the information you need to make a confident, informed decision about one of the biggest moves of your life.

8 countries. Decision-ready. Compare. Decide. Make the move.

---

## Brand Assets

Brand images are in `assets/brand/` in the mobile project. Key files:
- `icononly_nobuffer.png` - App icon (no background buffer)
- `fulllogo_nobuffer.png` - Full logo with tagline
- `fulllogo_transparent_nobuffer.png` - Transparent background version
- `icononly_transparent_nobuffer.png` - Transparent icon

You'll need to transfer these image files manually from the mobile project.

---

## Data Architecture

All content is stored as static TypeScript data files. Below are the complete data structures and content.

### Countries List

```typescript
export type Region = "Europe" | "North America" | "Central America" | "South America" | "Asia" | "Oceania";

export type Country = {
  name: string;
  slug: string;
  region: Region;
  popular?: boolean;
};

export const COUNTRIES: Country[] = [
  { name: "Portugal", slug: "portugal", region: "Europe", popular: true },
  { name: "Spain", slug: "spain", region: "Europe", popular: true },
  { name: "Ireland", slug: "ireland", region: "Europe" },
  { name: "United Kingdom", slug: "united-kingdom", region: "Europe" },
  { name: "France", slug: "france", region: "Europe", popular: true },
  { name: "Germany", slug: "germany", region: "Europe" },
  { name: "Italy", slug: "italy", region: "Europe" },
  { name: "Netherlands", slug: "netherlands", region: "Europe" },
  { name: "Sweden", slug: "sweden", region: "Europe" },
  { name: "Norway", slug: "norway", region: "Europe" },
  { name: "Denmark", slug: "denmark", region: "Europe" },
  { name: "Switzerland", slug: "switzerland", region: "Europe" },
  { name: "Austria", slug: "austria", region: "Europe" },
  { name: "Greece", slug: "greece", region: "Europe" },
  { name: "Canada", slug: "canada", region: "North America" },
  { name: "Mexico", slug: "mexico", region: "North America", popular: true },
  { name: "Costa Rica", slug: "costa-rica", region: "Central America", popular: true },
  { name: "Panama", slug: "panama", region: "Central America" },
  { name: "Belize", slug: "belize", region: "Central America" },
  { name: "Guatemala", slug: "guatemala", region: "Central America" },
  { name: "Colombia", slug: "colombia", region: "South America" },
  { name: "Ecuador", slug: "ecuador", region: "South America" },
  { name: "Uruguay", slug: "uruguay", region: "South America" },
  { name: "Chile", slug: "chile", region: "South America" },
  { name: "Argentina", slug: "argentina", region: "South America" },
  { name: "Brazil", slug: "brazil", region: "South America" },
  { name: "Japan", slug: "japan", region: "Asia" },
  { name: "Thailand", slug: "thailand", region: "Asia", popular: true },
  { name: "Singapore", slug: "singapore", region: "Asia" },
  { name: "Malaysia", slug: "malaysia", region: "Asia" },
  { name: "Australia", slug: "australia", region: "Oceania" },
  { name: "New Zealand", slug: "new-zealand", region: "Oceania" },
];

export const REGION_ORDER: Region[] = ["Europe", "North America", "Central America", "South America", "Asia", "Oceania"];
```

### Launch Countries (Decision-Ready)

```typescript
const LAUNCH_COUNTRIES = ["portugal", "spain", "canada", "costa-rica", "panama", "ecuador", "malta", "united-kingdom"];
```

### Coverage Summary

```
Ready: Portugal, Spain, Canada, Costa Rica, Panama, Ecuador, Malta, UK
Coming Soon: France, Italy, Thailand, Mexico, and more
```

---

## Core Content Data

### Pathways (Visa/Immigration Routes)

Each country has pathways. Pathways marked `premium: true` require Pro subscription for the full Decision Brief. Free users see the summary, whoFor/notFor, and official links.

**Portugal:**
- D7 (Passive Income) - premium
- D8 (Digital Nomad) - premium
- Student Visa - free

**Spain:**
- Non-Lucrative Visa - premium
- Digital Nomad Visa - premium
- Student Visa - free

**Canada:**
- Express Entry - premium

**Costa Rica:**
- Rentista Visa - premium
- Pensionado Visa - free

**Panama:**
- Friendly Nations Visa - premium
- Pensionado Visa - premium
- Self Economic Solvency Visa - premium

**Ecuador:**
- Rentista Visa - premium
- Jubilado (Retirement) Visa - premium

**Malta:**
- Nomad Residence Permit - premium
- Global Residence Programme - premium

**United Kingdom:**
- Skilled Worker Visa - premium
- Global Talent Visa - premium
- Innovator Founder Visa - premium

Each pathway has: key, title, summary, whoFor[], notFor[], premium boolean, officialLinks[], steps[]?, timeline?, costRange?

The complete pathway data with all fields is in `data/pathways.ts` (374 lines).

---

### Resources (Official Government Links)

Countries with full resources: Portugal, Spain, France, Italy, Germany, Thailand, Costa Rica, Mexico, Canada.
Each resource has: label, note, url, sourceType (official/community/expert), category (visa/tax/housing/healthcare/work).

The complete resource data is in `data/resources.ts` (269 lines).

---

### Vendors (Service Providers)

Countries with vendors: Portugal, Spain, France, Italy, Germany, Thailand, Costa Rica, Mexico, Canada.
Each vendor has: name, category (Legal/Tax/Housing/Relocation), url, note.

The complete vendor data is in `data/vendors.ts` (59 lines).

---

### Community Links

Countries with community data: Portugal, Spain, France, Italy, Germany, Thailand, Costa Rica, Mexico, Canada.
Each link has: name, type (Meetups/Forums/Facebook/Expat groups/General/Discord/WhatsApp), url, note.

The complete community data is in `data/community.ts` (72 lines).

---

## Decision Briefs (Premium Content - Core Value Proposition)

Decision Briefs are the main paid feature. They are opinionated, detailed guides covering:
- Headline + decision summary
- Recommended for / Not recommended for
- Key requirements
- Financial reality (real costs, not official minimums)
- Timeline reality (actual processing times)
- Risk flags
- Common mistakes
- Better alternatives
- Work reality
- Family & dependents
- Lifestyle & culture
- Confidence level (High/Medium/Conditional)

There are TWO types of briefs per launch country:
1. **Country Overview Brief** - General country assessment (e.g., "portugal-overview")
2. **Pathway-Specific Briefs** - One per premium pathway (e.g., "portugal-d7", "portugal-d8")

### Complete Brief List (3,062 lines of content):

**Portugal:** portugal-overview, portugal-d7, portugal-d8, portugal-student
**Spain:** spain-overview, spain-nlv, spain-dnv, spain-student
**France:** france-overview, france-talent-passport
**Italy:** italy-overview, italy-elective-residency, italy-digital-nomad
**Thailand:** thailand-overview, thailand-ltr, thailand-retirement
**Costa Rica:** costa-rica-overview, costa-rica-rentista, costa-rica-pensionado
**Mexico:** mexico-overview, mexico-temporary-resident, mexico-permanent-resident
**Canada:** canada-overview, canada-express-entry
**Panama:** panama-overview, panama-friendly-nations, panama-pensionado, panama-self-economic-solvency
**Ecuador:** ecuador-overview, ecuador-rentista, ecuador-jubilado
**Malta:** malta-overview, malta-digital-nomad, malta-grp
**United Kingdom:** united-kingdom-overview, united-kingdom-skilled-worker, united-kingdom-global-talent, united-kingdom-innovator-founder

The complete Decision Brief content is in `src/data/decisionBriefs.ts` (3,063 lines). This is the most important file to transfer.

---

## Comparison Matrix

Side-by-side comparison of launch countries across these dimensions:

**Free rows:**
- Residency pathways
- Work without sponsorship
- Path to permanent residency
- Typical timeline
- Language requirement

**Pro-only rows:**
- Work sponsorship reality
- Income thresholds
- Tax exposure risk
- Bureaucracy difficulty
- Not ideal for

The complete comparison data is in `src/data/compareMatrix.ts` (184 lines).

---

## Features to Implement in Web Version

### Free Features:
1. **Home/Landing page** - Country selection, value proposition, coverage summary
2. **Country Hub** - Per-country page with tabs/sections for pathways, resources, vendors, community
3. **Explore/Browse Countries** - Browse all countries grouped by region
4. **Pathway Summaries** - Title, summary, whoFor, notFor, official links (free for all pathways)
5. **Resources Section** - Official government links per country
6. **Vendor Directory** - Service providers per country
7. **Community Links** - Expat groups, forums, meetups per country
8. **Country Comparison** - Side-by-side matrix (free rows only)

### Pro/Premium Features (behind paywall):
1. **Decision Briefs** - Full detailed briefs with all sections
2. **Premium Pathway Details** - Steps, timeline, cost range for premium pathways
3. **Pro Comparison Rows** - Sponsorship reality, income thresholds, tax exposure, bureaucracy, not-ideal-for
4. **Pro Gate** - Component that blocks premium content and shows upgrade CTA

### Subscription Flow:
- Web uses Stripe Checkout for subscriptions
- Products: monthly ($14.99) and yearly ($99)
- Stripe Customer Portal for subscription management
- Sandbox/test mode for development

---

## Legal Pages

Privacy policy and terms of service are HTML files served by the backend:
- `server/templates/privacy-policy.html`
- `server/templates/terms-of-service.html`

Company: Magic Elf Digital
Support email: support@magicelfdigital.com
Privacy policy URL: https://magicelfdigital.com/privacy
Terms URL: https://magicelfdigital.com/terms

---

## Files to Transfer

The most important files to copy from the mobile project to the web project (in order of priority):

1. **`src/data/decisionBriefs.ts`** (3,063 lines) - All Decision Brief content
2. **`data/pathways.ts`** (374 lines) - All pathway/visa data
3. **`data/resources.ts`** (269 lines) - Official resource links
4. **`src/data/compareMatrix.ts`** (184 lines) - Comparison data
5. **`src/data/pro-offer.ts`** (189 lines) - Pro upsell copy/messaging
6. **`src/data/coverage.ts`** (137 lines) - Coverage status tracking
7. **`data/countries.ts`** (62 lines) - Country list
8. **`data/vendors.ts`** (59 lines) - Vendor directory
9. **`data/community.ts`** (72 lines) - Community links
10. **`src/data/briefHelpers.ts`** (212 lines) - Brief validation/confidence logic
11. **`src/data/severity.ts`** - Severity definitions
12. **`src/data/briefSeverity.ts`** - Brief severity rules
13. **`src/data/briefValidation.ts`** - Brief validation rules
14. **`src/data/briefReviewRules.ts`** - Review trigger rules
15. **`server/templates/privacy-policy.html`** - Privacy policy
16. **`server/templates/terms-of-service.html`** - Terms of service
17. **Brand assets from `assets/brand/`** - Logos and icons
