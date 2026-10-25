# UI/UX Review & Enhancement Plan — football-web

**Scope:** Full sweep of every player-facing and admin-facing screen in `src/app` plus shared components (`src/components`).
**Goal:** Concrete, prioritized UX improvements with a clear implementation approach for each.
**Method:** Read every page/route and client component; cataloged design tokens, states (empty/loading/error), responsiveness, and accessibility.

> This document is a plan only — no source files were changed to produce it. Work is grouped into phases (P0 → P3). Each item lists **Issue → Change → How I'll implement it**.

---

## 1. What's already good (keep it)

- **Consistent visual language:** neutral palette, `rounded-xl`/`rounded-2xl` cards, `border-black/10`, dark-mode variants everywhere.
- **Consistent form inputs:** `rounded-lg border border-black/15 bg-white px-3 py-2 text-sm` used across nearly all inputs/selects.
- **Loading text on submit buttons:** `{pending ? "Saving…" : "Save"}` pattern is used app-wide.
- **Success/error feedback pattern:** emerald for success, red for error, applied consistently.
- **Destructive-action confirmation:** type-to-confirm ("DELETE" / "BACKFILL") on most dangerous actions.
- **Back-links** on nested pages, semantic `<main>/<h1>/<h2>`, `<label>`-wrapped inputs in most forms.

The main opportunity is **consolidation** (turn repeated class strings into shared primitives), **mobile/table polish**, and **accessibility**.

---

## 1a. Access model & information architecture (design decisions)

Two open questions were raised: (a) admins are also players — one login or two? (b) there are too many top-level tabs. Both are answered here because they shape everything else.

### 1a.1 Access model — **one login, split views (recommended)**

**Current state (from the code):** roles are `super | admin | player`; the session carries `role` **and** `playerId`. Today **admin/super accounts have `playerId = null`**, so an admin who also plays *cannot* vote, set availability, or appear on the leaderboard as a player. That is the real friction behind the question.

**Recommendation: keep a single login and make `role` and `playerId` independent.** An account can be `role = admin` **and** `playerId = 5` at the same time. Do **not** create separate admin/player logins or two accounts per person.

Why one login:
- **No double accounts / no re-login.** The same person plays and administers with one identity.
- **Correct data.** An admin who plays shows up in the leaderboard, availability, and voting like everyone else — no phantom "admin-only" identity.
- **Simpler mental model.** Role governs *tools*; `playerId` governs *participation*. They are orthogonal.

How the UI splits under one login:
- **Player view is the default** for everyone (Summary, Matches, Votes/voting, Payments, Leaderboard).
- **Admin tools are additive**, grouped behind a clearly separated **Admin** area (a menu group or an `/admin` section), only rendered when `role ∈ {admin, super}`.
- **Optional "Acting as" toggle** in the header (`Player ⇄ Admin`), stored in a cookie, so an admin who just wants to play can hide admin chrome. Purely cosmetic — it never grants/removes real permissions (those stay server-enforced by `requireAdmin()`).

**How I'll implement it:**
- **Data:** link each admin/super account that also plays to their `players` row (set `playerId`). No schema change needed — the column/relationship already exists; this is a data + auth-callback adjustment.
- **Auth:** confirm the next-auth callbacks allow `role = admin` with a non-null `playerId` (session already exposes both) and stop assuming `playerId = null` means "admin".
- **Guarding stays server-side:** keep `requireAdmin()` on every admin action/page; the view toggle is UI-only.
- **Header:** always render the player nav; render the Admin group only for admins; add the optional view toggle.

> Edge case: pure admins with no player identity (e.g., a treasurer who never plays) simply keep `playerId = null` and see only the Admin area — the model already supports that.

### 1a.2 Navigation — collapse 9 tabs into **5, ordered by the user's flow**

**Current:** an admin sees up to **9 top-level tabs** (Matches, Leaderboard, Awards, Stats, Players, Scoring, Votes, Payments, Diagnostics). Too many, and not ordered by how the evening actually runs.

**Proposed top-level, in flow order:**

1. **Summary** — role-aware dashboard / landing (`/`). Next match, your rank, and for admins: pending reviews, unpaid count, data warnings.
2. **Match data** — everything about a match: roster/availability → draft/teams → stats → results. Admin match tools (settings, scoring config, diagnostics) live here as sub-sections, not as separate top-level tabs.
3. **Votes** — voting (player) and vote review/scope (admin).
4. **Payments** — collection status and toggles.
5. **Leaderboard** — standings, with **Awards** and **Badges** as sub-tabs.

**Where the old tabs go (mapping):**

| Old top-level tab | New home |
|---|---|
| Home (`/`) | **Summary** (upgraded to a dashboard) |
| Matches | **Match data** |
| Stats (submit/review) | **Match data** → per-match sub-section |
| Scoring (config) | **Match data** → admin sub-section |
| Diagnostics | **Match data** → admin "Data health" sub-section |
| Votes | **Votes** |
| Payments | **Payments** |
| Leaderboard | **Leaderboard** |
| Awards | **Leaderboard** → sub-tab |
| Players (roster & auth) | **Account/Admin menu** (global admin, not part of a single match) |

Result: **players see 4–5 tabs** (Summary, Match data, Votes, Payments*, Leaderboard) and **admins see the same 5 plus an Admin menu** (Players + any global tools). `*`Payments visibility for players is a product call — show read-only "your payment status", or keep Payments admin-only.

**How I'll implement it:**
- Rework `src/components/site-header.tsx` to render the 5 primary links (role-filtered) + an **Admin** dropdown/menu group for `admin/super`.
- Introduce **per-area sub-navigation** (a secondary tab strip) inside Match data and Leaderboard rather than more top-level links — reuse the `role="tablist"` pattern from 2.2 so it's accessible.
- Keep existing routes working (no broken links): add the new grouping as the primary IA, and if desired, add redirects (e.g., `/awards` → `/leaderboard?tab=awards`) so bookmarks don't break.
- Sequence: this is a **P0/P1 structural change**; do it alongside the primitives so sub-tabs use the shared accessible tab component.

---

## 2. Cross-cutting foundation (do this first — unlocks everything else)

These are shared primitives. Building them once removes ~80% of the per-screen inconsistencies below.

### 2.1 Introduce a small UI primitives layer — `src/components/ui/`
**Issue:** Button/badge/banner/card/table class strings are copy-pasted with subtle drift (primary uses `px-4 py-2 hover:bg-neutral-700`; secondary uses `px-3 py-2`; danger uses `bg-red-600`; approve uses `bg-emerald-600`). No focus rings.
**Change:** Create reusable, typed components with one source of truth and built-in focus-visible rings.
**How I'll implement it:**
- `src/components/ui/button.tsx` — `variant: "primary" | "secondary" | "danger" | "success" | "ghost"`, `size`, `pending` prop that swaps label + shows a spinner and sets `disabled` + `aria-busy`. Add `focus-visible:ring-2 focus-visible:ring-neutral-900/40 dark:focus-visible:ring-white/40`.
- `src/components/ui/badge.tsx` — `tone: "neutral" | "success" | "warning" | "danger" | "info"`; used for matchday/vote-scope/stats/payment statuses.
- `src/components/ui/banner.tsx` — success/error/info/warning with `role="alert"` + `aria-live="polite"`.
- `src/components/ui/card.tsx`, `src/components/ui/empty-state.tsx`, `src/components/ui/data-table.tsx` (wraps table in a scroll container with an edge fade + `role` niceties).
- Migrate screens to these incrementally (P1/P2 below). Keep the exact current look as the default so nothing visually regresses.

### 2.2 Accessibility baseline
**Issue:** No focus rings; icon/emoji-only controls lack labels; custom tabs lack `role="tab"`/`aria-selected`; range sliders lack `aria-label`; status color used without text; `role="alert"`/`aria-live` missing on feedback; table headers lack `scope="col"`.
**Change:** Bake a11y into the primitives + fix the few bespoke widgets.
**How I'll implement it:**
- Focus rings in `Button`/inputs (global `globals.css` for `:focus-visible` on `input,select,textarea`).
- `Banner` gets `role="alert"`/`aria-live`.
- Vote-admin tabs → `role="tablist"`/`role="tab"` + `aria-selected` + arrow-key nav.
- Voting sliders → `aria-label={`Rate ${name} from 0 to 10`}` and a visible "0 = worst · 10 = best" caption.
- Availability/diagnostics emoji → wrap emoji in `<span aria-hidden>` and keep the text label as the accessible name.
- Tables → add `scope="col"` to `<th>`; ensure status columns always include a text label (not color alone).

### 2.3 Responsive/table pass
**Issue:** Wide tables use `overflow-x-auto` with no scroll affordance; several `grid-cols-3` layouts are cramped on phones; some tap targets (`text-xs` "Paid" toggle) are small; only `sm:` breakpoints are used.
**Change:** Add a scroll affordance, relax mobile grids, enlarge tap targets.
**How I'll implement it:**
- `DataTable` wrapper adds a right-edge gradient fade when horizontally scrollable + `min-w` on inner table.
- Change cramped `grid-cols-3` → `grid-cols-1 xs:grid-cols-3` / `sm:grid-cols-3` (mobile stacks).
- Bump small toggles to `min-h-9 px-3 py-1.5` for ≥44px targets.

---

## 3. Player-facing views — specific edits

### 3.1 Login (`src/app/login/login-form.tsx`)
- **Show/hide password toggle** and client-side "passwords don't need to match here" is fine, but add `aria-live` to the error. *How:* small eye button inside the password field; `role="alert"` on the error `<p>`.
- **Forgot-password** uses the currently-selected player — good; add a confirmation line echoing the player name. *How:* interpolate selected player's name into the success copy.

### 3.2 Home (`src/app/page.tsx`)
- **Make the three cards role-aware and add quick stats.** Currently generic. *How:* for players, add a "Your rank / next match" mini-summary; for admins, surface pending reset requests + pending stat reviews counts as badges on the relevant cards (data already available in `players-admin`/`stats` libs).

### 3.3 Leaderboard (`src/app/leaderboard/leaderboard-table.tsx`, `score-breakdown-panel.tsx`)
- **Ranked/Unranked uses color only.** *Change:* add an icon/text badge (`Badge tone`), not just green/gray text.
- **Active-filter feedback.** *Change:* show a small "Showing X of Y players" line and a "Reset filters" link when filters are non-default.
- **Sticky table header** on scroll for long lists. *How:* `sticky top-0` on `<thead>` inside the scroll container.
- **Score-breakdown "matchId" raw numbers.** *Change:* render as `Match {id}` linking to `/matches/{id}`, show formatted date (reuse `fmtDate`).
- **Mobile:** the 8-column table is the worst offender — wrap in `DataTable` with the scroll fade; consider hiding Peer/Stat columns on `<sm` behind a "details" toggle.

### 3.4 Match detail (`src/app/matches/[id]/page.tsx`) — *partially done this session*
- Action buttons now pill-styled and "Manage draft" is admin-only. **Next:** group them as a proper action bar and add short helper subtext under each (e.g., "Rate players — open until matchday closes").
- **Teams display:** color-code Team 1 vs Team 2 headers (subtle tinted border) for faster scanning.

### 3.5 Availability (`availability/page.tsx`, `availability-controls.tsx`)
- **`grid-cols-3` cramped on mobile.** *Change:* stack on mobile.
- **Buttons don't show pending/marked clearly.** *Change:* `Button pending` label ("Marking…") + a filled state for the currently-selected status (checkmark), not just opacity.
- **Emoji redundancy** → `aria-hidden` on emoji.

### 3.6 Vote (`vote/page.tsx`, `vote/vote-form.tsx`)
- **Slider has no meaning label.** *Change:* caption "0 = worst · 5 = average · 10 = best" + `aria-label` per slider + show the numeric value prominently.
- **Skipped rows only dim.** *Change:* add a clear "Skipped" pill + keep controls obviously interactive; add "Skip all / Clear skips" quick actions.
- **Disabled submit when nothing to rate** → add helper text ("Rate at least one player, or skip the rest").
- **Notice severity:** draft/closed/not-on-roster should read as info vs the amber "previous votes" warning — unify via `Banner tone`.

### 3.7 Stats submission (`stats/stats-form.tsx`)
- **No min/max on goals/assists.** *Change:* `min={0} max={50}` + inline validation message; block negative.
- **Status → next step unclear.** *Change:* under the status badge add a one-liner ("Pending admin review" / "Approved — counts toward scoring" / "Rejected — you can resubmit").
- Make the helper text `text-sm` (not `text-xs`).

### 3.8 Profile (`profile/page.tsx`, `change-password.tsx`) — *change-password added this session*
- **Add show/hide password** on the three fields and a lightweight strength hint (length only, to match server rule).
- Consider a "Your active sign-in links" note if the player has magic links (optional).

### 3.9 Password reset (`reset/reset-form.tsx`) & Magic (`magic/page.tsx`)
- **Reset:** add show/hide toggle + client-side "passwords match" check before submit (server still authoritative).
- **Magic:** add a spinner/skeleton while auto-submitting; the current "tap Continue" fallback stays for no-JS.

### 3.10 Badge gallery (`components/badge-gallery.tsx`)
- **Locked badges are too subtle and unexplained.** *Change:* add a tooltip/`title` with the earn requirement and a lock icon overlay; keep grayscale.

---

## 4. Admin-facing views — specific edits

### 4.1 Players & Auth (`players/players-admin.tsx`) — *heavily built this session*
- **Roster is a long list of expanders.** *Change:* add per-card status badges (active/inactive, 🔒 password, 🔗 links) as `Badge` components; add column-ish alignment.
- **Separate Approve/Dismiss + magic/revoke forms** are fine but visually dense. *Change:* group into a small "Access" subsection inside each card with clear dividers.
- **`#id` next to names** — keep for admins (disambiguation) but render muted; you asked earlier about removing these app-wide — this is the one place I recommend keeping them.

### 4.2 Match settings (`matches/[id]/match-settings.tsx`)
- **Matchday status via emoji buttons.** *Change:* `role="radiogroup"` segmented control with text + colored dot; `aria-checked`.
- **State transitions have no confirmation.** *Change:* confirm on Close/Delete (Delete already type-to-confirm; add a lightweight confirm on Close submissions/Close matchday).

### 4.3 Draft board (`matches/[id]/draft/draft-board.tsx`)
- **Drag-and-drop is not obvious/touch-friendly.** *Change:* add explicit "move to Team N" buttons as a fallback (dnd-kit keyboard sensor + a menu), and a visible drag handle. Add an empty-bench empty state.
- Confirm the `DATABASE_URL` client-bundle fix (done this session) resolved the crash end-to-end for admins.

### 4.4 Votes admin (`votes/votes-admin.tsx`)
- **5 custom tabs without ARIA.** *Change:* real tablist (see 2.2); make active tab bolder.
- **7-column table + verbose select labels.** *Change:* `DataTable` scroll affordance; truncate long option labels with `title` full text.
- **Instant destructive edits.** *Change:* keep type-to-confirm on delete; add inline "Undo" toast after scope changes (optional, uses existing audit/reverse action if present).

### 4.5 Payments (`payments/payments-admin.tsx`)
- **"Reset all" has no confirmation** (the only destructive action without one). *Change:* add type-to-confirm or a confirm step.
- **Small "Paid" toggle tap target.** *Change:* enlarge; use `Badge`-style toggle.
- **No "collected so far" summary.** *Change:* add a metric card: collected / remaining / % paid (values already computed).
- **Player-facing payment info gap:** admins enter name/mobile/method but players never see instructions. *Change (optional, needs product call):* surface read-only payment instructions on the player's match page.

### 4.6 Stats review (`stats/review-controls.tsx`)
- **One-by-one approve/reject only.** *Change:* add "Approve all as submitted" bulk action with a confirm.
- **No min/max on the editable goals/assists.** *Change:* same validation as 3.7.

### 4.7 Scoring config (`scoring/scoring-form.tsx`)
- **Sliders/number fields lack range labels & bounds.** *Change:* add 0%/100% track labels; add `min`/`max` to number inputs (e.g., neutralScore 0–100) with inline validation.
- **5 confidence thresholds are opaque.** *Change:* add a short "?" popover per field explaining effect (copy can come from the Streamlit help text).

### 4.8 Diagnostics (`diagnostics/page.tsx`)
- **Warnings are flat text.** *Change:* render as `Banner tone="warning"` list with severity; emoji `aria-hidden`; add `scope="col"` to the table.

---

## 5. Consistency fixes (quick wins)

| Area | Fix |
|---|---|
| Button padding/hover drift | Unify via `Button` variants (2.1). |
| Focus rings missing | Add `:focus-visible` rings globally + in primitives. |
| Status colors ad-hoc | Centralize in `Badge` tones. |
| Feedback not announced to SR | `role="alert"`/`aria-live` in `Banner`. |
| `grid-cols-3` on mobile | Stack on `<sm`. |
| Raw numeric IDs in tables | Render as `Match {id}` links + formatted dates. |
| Reset-payments no confirm | Add confirm (matches other destructive actions). |
| Date/timezone | Standardize on `fmtDate` (DD-MM-YYYY) everywhere; add a tz note where times show. |
| `text-xs` helper text | Promote key helper text to `text-sm`. |

---

## 6. Proposed implementation phases

**P0 — Foundation (no visual regressions):**
1. `Button`, `Badge`, `Banner`, `Card`, `EmptyState`, `DataTable` primitives (2.1).
2. Global focus-visible styles + `Banner` a11y (2.2).
3. **Access model:** link admin/super accounts to their `players` row; confirm auth allows `role=admin` + non-null `playerId`; keep `requireAdmin()` server guards (1a.1).
4. **Navigation restructure:** 5 flow-ordered top-level areas + Admin menu + per-area sub-tabs; add redirects for old routes (1a.2).

**P1 — High-impact player flows:**
5. Vote form (slider labels, skip clarity, quick actions) — 3.6.
6. Stats submit + review validation & next-step copy — 3.7 / 4.6.
7. Availability mobile + button states — 3.5.
8. Leaderboard ranked badge, filter feedback, sticky header, breakdown links — 3.3.

**P2 — Admin polish:**
9. Votes-admin tabs a11y + table affordance — 4.4.
10. Match settings segmented control + confirms — 4.2.
11. Payments confirm + collected summary + tap targets — 4.5.
12. Scoring bounds + field help — 4.7.
13. Diagnostics banners — 4.8.

**P3 — Nice-to-have:**
14. Draft board touch/keyboard fallback — 4.3.
15. Home role-aware summaries — 3.2.
16. Badge earn-requirements tooltip — 3.10.
17. Show/hide password across login/reset/profile — 3.1 / 3.8 / 3.9.

---

## 7. Acceptance checklist (per migrated screen)

- [ ] Uses shared `Button`/`Badge`/`Banner`/`Card` (no bespoke class drift).
- [ ] Visible `:focus-visible` ring on every interactive element.
- [ ] Every status conveys meaning via text + color (not color alone).
- [ ] Feedback messages use `role="alert"`/`aria-live`.
- [ ] Tables wrapped in `DataTable` with scroll affordance + `scope="col"`.
- [ ] No `grid-cols-3` (or more) forced on mobile; stacks `<sm`.
- [ ] Numeric inputs have `min`/`max` + inline validation.
- [ ] Destructive actions confirmed.
- [ ] Tap targets ≥ ~44px.
- [ ] `npm run build` green; no client bundle pulls server-only `@/lib/db`.

---

### Notes
- All class names/paths above reflect the current code at review time.
- Migrations are incremental and back-compatible: primitives default to the existing look, so screens can be converted one PR at a time without a visual "big bang".
