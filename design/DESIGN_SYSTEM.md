# Sideline — Design System

Extracted from the live Next.js 16 + Tailwind CSS (v4) + React 19 codebase. This is the
source of truth for redesign work in Figma / Figma Make / v0. Keep it in sync with
`design/design-tokens.json` (Tokens Studio import).

> Note: a CSS `--brand: #a6ce39` (lime) exists but the **de-facto accent across the UI is
> emerald**. Decide which is canonical before a full redesign (see "Open decisions").

---

## 1. Foundations

### Color

**Theme base**

| Token | Light | Dark |
|---|---|---|
| background | `#ffffff` | `#0d0d0d` |
| foreground (text) | `#0d0d0d` | `#ededed` |
| brand (declared) | `#a6ce39` | `#a6ce39` |

**Accent (emerald — de-facto brand)**

| Role | Light | Dark |
|---|---|---|
| accent | emerald-600 `#059669` | emerald-500 `#10b981` |
| accent hover | emerald-500 `#10b981` | emerald-400 `#34d399` |
| accent soft bg | emerald-100 `#d1fae5` | emerald-950 `#022c22` |

**Primary action = neutral, not accent.** Primary buttons are `neutral-900` (invert to white
in dark). Emerald is used for success, links, avatar, positive emphasis.

**Neutrals:** 50, 100, 200, 300, 400, 500, 700, 800, 900, 950 + alpha borders `black/10`,
`black/15` (dark `white/10`, `white/15`).

**Semantic (from `Badge`)** — `-100/-800` fills in light, `-950/-300` in dark, `-500` dots:

| Tone | Hue |
|---|---|
| success | emerald |
| warning | amber |
| danger | red |
| info | sky |
| neutral | neutral |

**Team palette (matchday, 5 distinct):** rose-500 · sky-500 · emerald-500 · amber-500 · violet-500.

### Typography

- **Font:** Geist Sans (`--font-geist-sans`); Geist Mono for mono.
- **Scale in use:** `xs` 12 (caption/badge/sm button) · `sm` 14 (body / most UI) ·
  `lg` 18 (section `h2`) · `2xl` 24 (page `h1`).
- **Weights:** medium 500 (default), semibold 600 (headings), bold 700 + uppercase +
  `tracking-[0.2em]` (wordmark).
- **Tracking:** `tracking-tight` on headings.

### Spacing & layout

- **Containers:** `max-w-3xl` / `max-w-4xl`, `px-4`; page `py-10`, header `py-3`.
- **Scale:** 2, 4, 6, 8, 10, 12, 16, 20, 24, 32, 40 px (gaps + stacks use 2/3/4/8).

### Radius

`md` 6 (tiny controls) · `lg` 8 (buttons/inputs — default) · `xl` 12 (cards) · `full` (badges/avatar).

### Elevation

Borders over shadows. `shadow-sm` (avatar), `shadow-lg` (mobile drawer), `backdrop-blur`
(sticky header). Redesign can introduce a soft shadow scale if it stays subtle.

---

## 2. Components (current inventory)

| Component | Variants / states |
|---|---|
| **Button** | variant: primary, secondary, danger, success, ghost · size: sm (`px-2.5 py-1.5 text-xs`), md (`px-4 py-2 text-sm`) · states: default / hover / disabled (40%) / **pending (spinner + label swap)** / focus-ring |
| **Badge** | tone: neutral, success, warning, danger, info · optional leading **dot** · `rounded-full px-2 py-0.5 text-xs` |
| **Card** | `rounded-xl border border-black/10 p-4` |
| **Input / Select** | `rounded-lg border border-black/15 px-3 py-2 text-sm` + 3px focus ring |
| **Avatar** | `rounded-full`, emerald bg, initials **or** photo (`object-cover`), `ring-2`, h-8 / h-9 |
| **Header / Nav** | sticky + blur; mobile 3-zone app bar (menu · centered brand · avatar) + drawer; desktop inline nav |
| Also | banner / FeedbackMessage, data-table, empty-state, sub-nav, section-icon |

---

## 3. Product context (for designers)

Sideline is a **mobile-first PWA** for organizing recurring casual football matches. Core jobs:

- **Availability:** players mark in/out per match; admins set a cap; a **waitlist** (with
  auto-promotion + admin add/remove/reorder) fills freed spots.
- **Draft / Lineup builder:** drag players into 2–5 balanced teams (snake auto-balance).
- **Matchday console:** live goal/assist logging, substitutions, cross-team loans.
- **Voting:** peer rating after a match with outlier / in-scope-vs-out-of-scope handling.
- **Leaderboard / stats / awards:** season scores from votes (+ optional goal/assist stats).
- **Admin:** players (soft-delete + restore), match settings, feature toggles.

Audience: amateur players on their phones; a few admins who run the group. Tone should feel
like a **fun sports app**, not enterprise software.

---

## 4. Open decisions (resolve during redesign)

1. **Brand color:** lime `#a6ce39` vs emerald `#059669` — pick one canonical brand.
2. **Primary action color:** keep neutral-900, or move primary CTAs to the brand accent.
3. **Badge dark fills:** standardize solid `-950` vs `-950/50` alpha (both appear today).
4. **Elevation:** stay border-only, or adopt a subtle shadow scale for depth.

---

## 5. Constraints (must survive the redesign)

- Next.js App Router + **Tailwind CSS v4** utility classes; **dark mode via `prefers-color-scheme`**.
- Mobile-first, installable PWA; touch targets ≥ 40px.
- No heavy UI dependency; components are local (`src/components/ui`).
- Accessibility: visible focus rings, status conveyed beyond color (badge dots), semantic HTML.
