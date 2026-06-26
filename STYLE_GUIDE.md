# ExpatHub Style Guide

A calm, advisory design system for people planning an international move. This guide documents the real design tokens used in the app. The single source of truth is `theme/tokens.ts` (which reads raw values from `constants/colors.ts`). Always reference tokens in code — never hardcode colours, spacing, or font sizes.

---

## 1. Brand Voice & Tone

ExpatHub is a measured, trustworthy guide — not a hype machine.

- **Calm and advisory.** Speak like a knowledgeable advisor, not a salesperson.
- **No exclamation marks.** Anywhere — UI copy, headings, errors, notifications.
- **No urgency language.** Avoid "Hurry", "Limited time", "Don't miss out", countdowns, or pressure framing.
- **Plain, simple language.** Short sentences. Everyday words over jargon. Explain immigration terms when first used.
- **Honest.** Never promise something the product cannot do (for example, do not offer to email a guide if there is no email capability).

---

## 2. Colour

Raw palette from `constants/colors.ts`:

| Name | Hex | Notes |
|------|-----|-------|
| Navy | `#1C2B5E` | Primary text, headers, dark surfaces |
| Blue | `#3E81DD` | Primary action / brand accent |
| Teal | `#33C4DC` | Secondary accent |
| Teal Light | `#E8F9FC` | Soft tint / selected backgrounds |
| Gold | `#E8991A` | Highlight, premium / Pro accent |
| Gold Light | `#FEF4E2` | Soft gold tint background |
| Cream | `#EEEEE4` | App background |
| Surface | `#FFFFFF` | Cards, sheets, white surfaces |
| Text Mid | `#5A6785` | Secondary text |
| Text Soft | `#9BA8C0` | Tertiary / muted text, placeholders |
| Border | `rgba(62,129,221,0.11)` | Hairline borders (blue at 11%) |
| Shadow | `rgba(28,43,94,0.08)` | Card shadow (navy at 8%) |

### Semantic roles (`tokens.color`)

Use these names in components, not the raw palette:

| Token | Resolves to | Use for |
|-------|-------------|---------|
| `bg` | Cream | Screen background |
| `surface` / `white` | Surface (white) | Cards, sheets, inputs |
| `text` / `dark` | Navy | Primary text, headings |
| `subtext` | Text Mid | Secondary text |
| `textSoft` | Text Soft | Muted text, placeholders |
| `primary` | Blue | Primary buttons, links, active states |
| `primarySoft` | Teal Light | Soft fill behind primary elements |
| `headerBlue` | Navy | Header background |
| `teal` / `tealLight` | Teal / Teal Light | Secondary accents, info tints |
| `gold` / `goldLight` | Gold / Gold Light | Pro / premium accents |
| `border` / `primaryBorder` | Border | Hairline dividers and outlines |
| `shadow` | Shadow | Elevation shadow colour |

**Rule:** prefer semantic tokens (`tokens.color.primary`) over raw colours (`colors.blue`) so intent stays clear and theming stays centralised.

---

## 3. Typography

Two families, loaded in `app/_layout.tsx`:

- **Lora** (serif) — display and headlines. Conveys editorial trust.
- **DM Sans** (sans-serif) — all UI and body text.

### Font tokens (`tokens.font`)

| Token | Family / weight |
|-------|-----------------|
| `display` | `Lora_600SemiBold` |
| `body` | `DMSans_400Regular` |
| `bodyMedium` | `DMSans_500Medium` |
| `bodySemiBold` | `DMSans_600SemiBold` |
| `bodyBold` | `DMSans_700Bold` |

### Type scale (`tokens.text`)

| Token | Size (pt) | Typical use |
|-------|-----------|-------------|
| `h1` | 26 | Screen titles (Lora display) |
| `h2` | 20 | Section headings |
| `h3` | 16 | Sub-headings, card titles |
| `body` | 14 | Default body copy |
| `small` | 12 | Captions, metadata, labels |

### Weights (`tokens.weight`)

`regular` 400 · `medium` 500 · `semibold` 600 · `bold` 700 · `black` 900

**Guidance:** use Lora (`font.display`) for headlines and hero numbers; use DM Sans for everything else. Pair size from `tokens.text` with a matching DM Sans weight token rather than setting `fontWeight` ad hoc.

---

## 4. Spacing

8-ish point rhythm from `tokens.space`:

| Token | Value (px) |
|-------|-----------|
| `xs` | 6 |
| `sm` | 10 |
| `md` | 14 |
| `lg` | 16 |
| `xl` | 20 |
| `xxl` | 28 |

Use these for padding, margin, and gaps. Avoid arbitrary numbers like `13` or `22`.

---

## 5. Radius

From `tokens.radius`:

| Token | Value (px) | Use |
|-------|-----------|-----|
| `sm` | 6 | Inputs, small chips |
| `md` | 12 | Cards, sheets |
| `lg` | 14 | Large cards, modals |
| `pill` | 999 | Pills, badges, fully rounded buttons |

---

## 6. Elevation

One shadow recipe, built from `tokens.color.shadow` (navy at 8% opacity). Keep elevation subtle — soft, low-contrast shadows that suit the calm tone. Avoid heavy drop shadows.

---

## 7. Iconography

- **Library:** Ionicons via `@expo/vector-icons`.
- **No emojis** anywhere in the UI.
- Use line/outline icons for inactive states and filled variants for active states where the pair exists.
- Tint icons with semantic colour tokens (`primary`, `subtext`, `gold`) to match context.

---

## 8. Component Patterns

Built entirely with `StyleSheet.create` — no external UI libraries.

- **Buttons:** primary uses `color.primary` fill with white label (`font.bodySemiBold`); pill or `radius.md` corners; comfortable padding (`space.md`–`space.lg`). Secondary uses a hairline `border` on `surface`.
- **Cards:** `surface` background, `radius.md`/`lg`, hairline `border`, subtle `shadow`, internal padding `space.lg`.
- **Pills / badges:** `radius.pill`, soft tint background (`tealLight` or `goldLight`) with matching accent text.
- **Pro / premium surfaces:** lean on gold (`gold` / `goldLight`) as the accent so paid value reads consistently.
- **Inputs:** `surface` background, hairline `border`, `radius.sm`, `textSoft` placeholders.

---

## 9. Do & Don't

**Do**
- Reference `theme/tokens.ts` for every colour, size, space, and radius.
- Keep copy calm, plain, and free of exclamation marks.
- Use Lora for headlines, DM Sans for everything else.
- Use Ionicons; tint with semantic tokens.

**Don't**
- Hardcode hex values, pixel sizes, or font names in components.
- Use emojis, urgency language, or exclamation marks.
- Introduce new colours outside the palette without adding them to `constants/colors.ts` and a semantic token.
- Add external UI component libraries.
