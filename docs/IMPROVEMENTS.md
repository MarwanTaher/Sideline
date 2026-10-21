# Sideline — Improvements, Fixes and New Features

| | |
|---|---|
| Based on | Code review of `main` @ `a4342eb` + the product discussion that built it |
| Related | [REQUIREMENTS.md](./REQUIREMENTS.md) · [ARCHITECTURE.md](./ARCHITECTURE.md) |
| Supersedes | Open items of [review-improvements.md](./review-improvements.md) and [review-new-features.md](./review-new-features.md) (most of those are now built) |

**Legend.** Priority: **P0** do next · **P1** soon · **P2** when convenient · **P3** nice-to-have.
Effort: **S** < ½ day · **M** 1–2 days · **L** 3+ days. Each item states the *evidence* that
motivated it, so it can be checked rather than taken on trust.

## 0. Summary — recommended order

| # | Item | Area | Pri | Effort |
|---|---|---|---|---|
| 1 | C-1 Make `kickoff_at` impossible to be NULL | Correctness | P0 | S |
| 2 | C-2 Separate database for preview deployments | Correctness | P0 | S |
| 3 | P-1 Stop recomputing scores on draft & breakdown | Performance | P0 | S |
| 4 | C-3 Bring `drizzle/schema.ts` back in sync with the DB | Maintainability | P1 | M |
| 5 | C-4 Unit tests for time & money rules | Quality | P1 | M |
| 6 | U-1 "Your next action" card on Home | UX | P1 | M |
| 7 | F-1 Position-aware auto-balance | Feature (core problem) | P1 | M |
| 8 | P-2 Batch multi-statement writes with `sql.transaction([...])` | Perf + correctness | P1 | M |
| 9 | U-3 Optimistic availability toggle | UX/perf | P1 | S |
| 10 | F-3 Season release checklist & go-live | Feature | P1 | S |

---

## 1. Correctness and robustness fixes

### C-1 Make `kickoff_at` impossible to be NULL — P0 · S
**Evidence.** The 24h-lock bug was caused by match 16 having `kickoff_at = NULL`. Migration 0023
backfilled it and the read path now falls back to `played_on + match_time`, but nothing stops a
future code path from writing NULL again.
**Fix.** After confirming `SELECT count(*) FROM matches WHERE kickoff_at IS NULL` is 0, add
`ALTER TABLE matches ALTER COLUMN kickoff_at SET NOT NULL`. Keep the read fallback as
defence in depth. The database then enforces what NFR-3 ("fail closed") requires.

### C-2 Separate database for preview (`dev`) deployments — P0 · S
**Evidence.** Work is verified on `dev` and Vercel builds a preview for it; if the preview uses
the production `DATABASE_URL`, testing on preview mutates real data (votes, invoices, push sends).
**Fix.** Verify in Vercel → Settings → Environment Variables. If shared, create a Neon **branch**
(copy-on-write, free) for Preview and set a Preview-scoped `DATABASE_URL`. Also scope
`VAPID`/push so previews cannot notify real players.

### C-3 `drizzle/schema.ts` is out of sync — P1 · M
**Evidence.** `schema.ts` defines only the 0000 tables; none of `seasons`, `season_*`,
`push_*`, `match_rounds`, `round_goals`, `guest_charges`, `fund_adjustments`, … are typed. Those
are queried through raw SQL with hand-written row types, so a renamed column fails only at
runtime.
**Fix.** `npx drizzle-kit pull` against a Neon branch to regenerate `schema.ts`, review, commit.
New code can then use typed queries; old raw SQL can migrate gradually. Keep hand-written SQL
migrations as the source of truth.

### C-4 Unit tests for time and money rules — P1 · M
**Evidence.** The only automated tests are golden scoring/awards tests that need the live DB.
The lock, due-date, rounding and seat rules were verified manually and the lock still regressed.
**Fix.** Add `vitest` with DB-free tests for pure functions: `kickoffInstant` (incl. NULL
fallback and DST changes on the last Sundays of March and October), lock decision, `roundUpToPln`,
invoice gross maths, snake draft. Run in CI before `next build`.

### C-5 Error monitoring — P2 · S
**Evidence.** `error.tsx`/`global-error.tsx` exist, but failures are only visible in Vercel logs,
which are short-lived on Hobby.
**Fix.** Add Sentry (free tier) or at least log server-action failures to a small `app_errors`
table surfaced on the Diagnostics page.

### C-6 Atomic multi-write operations — P1 · M (see P-2)
**Evidence.** Neon HTTP has no interactive transactions, so flows like *create match → auto-IN
subscribers → notify* or *generate invoices → apply MultiSport scans* run as separate statements.
A failure midway leaves partial state (for example scans applied to no invoice).
**Fix.** Use Neon's non-interactive `sql.transaction([q1, q2, …])`, which runs the batch
atomically in one round trip.

### C-7 Season lifecycle edge cases — P2 · M
- Subscriber **withdraws mid-month**: invoice stays (by rules §7) but there is no UI prompt to the
  admin; add a "withdrawn with open invoice" warning in Billing.
- **Seat freed** → no automatic offer to the next interested player; add a season waitlist that
  reuses the availability-waitlist pattern.
- **Rates changed mid-season** apply to future invoices only (snapshots), which is correct; show
  "rate changed on …" in the invoice detail to avoid disputes.

### C-8 Secrets hygiene — P0 · S (operational)
Rotate `CRON_SECRET` (it was once sent to a third-party domain). Document all env vars in
`.env.example` without values.

---

## 2. Performance

Context: every page is server-rendered on Vercel and each query is one HTTP round trip to Neon,
so **round trips and region distance dominate**.

### P-1 Stop recomputing scores on draft and score breakdown — P0 · S
**Evidence.** `getPlayerScores()` is a full recompute over all votes/stats. The leaderboard uses
the cached `getCachedLeaderboard` (tag `scores`), but `draft.ts:189` and `score-breakdown.ts:159`
call the **uncached** `getPlayerScores()` directly. The draft page is the one admins open on
matchday, often on mobile data.
**Fix.** Wrap `getPlayerScores` in `unstable_cache(…, { tags: [SCORES_CACHE_TAG] })` once and use
that everywhere. The existing `revalidateScores()` calls already invalidate it.

### P-2 Batch queries — P1 · M
Use `sql.transaction([...])` (one round trip, atomic) for pages that run several small reads
sequentially, and for multi-write actions (C-6). Home currently runs 7 awaits with 3
`Promise.all` groups; collapsing them into one batch removes the remaining sequential hops.

### P-3 Co-locate the function region and the database — P1 · S
Check Neon region (e.g. `aws-eu-central-1`) against the Vercel function region (Settings →
Functions). If functions run in `iad1` (US default) and Neon in Frankfurt, every query crosses
the Atlantic (~90 ms each). Set Vercel functions to `fra1`.

### P-4 More route-level skeletons — P2 · S
Only the root, `/season` and `/admin/accounts` have `loading.tsx`. Add them to
`/matches/[id]` (and children), `/leaderboard`, `/players/[id]` so taps respond instantly.

### P-5 Cache read-mostly pages — P2 · M
13 pages are `force-dynamic` (awards, players, stats, notifications, …). Awards, player profiles
and stats change only after a match closes or stats are approved: cache them with tags
(`scores`, `match:<id>`) and invalidate from the same actions that already call
`revalidateScores()`.

### P-6 Cache external API calls — P2 · S
Weather (Open-Meteo) and geocoding (Nominatim) should use `fetch(…, { next: { revalidate: 3600 } })`
or a small DB cache. This speeds up match pages and respects Nominatim's usage policy.

### P-7 Persist score snapshots after each matchday — P3 · M
`score-snapshots.ts` exists. Writing a snapshot row per player on matchday close would make
leaderboard, rank movement and trends cheap reads and remove the full recompute from the hot path.

---

## 3. UX and visual

### U-1 "Your next action" card on Home — P1 · M
Today Home shows the next match, countdowns and links; players must know what to do. Show one
primary call-to-action derived from state, in priority order:
`Answer availability` → `Pay season invoice (due in 2 d)` → `Rate teammates` → `Submit your stats`
→ `Report MultiSport scan` → nothing ("You're all set ✅"). Admins get a second card:
`Approve 3 guests · 5 stats · 2 payments`.

### U-2 Match status timeline — P2 · S
A single status strip on the match page: *Open → Locked → Teams out → Live → Rate → Closed*,
with the current step highlighted. It explains why buttons disappear (e.g. after the lock)
better than an error.

### U-3 Optimistic availability toggle — P1 · S
Use React `useOptimistic` on In/Out so the button flips immediately; roll back with a toast if
the server rejects (lock, cap → waitlist). This is the most-tapped control in the app.

### U-4 Draft board clarity — P2 · S
- Per-team **position coverage** chips (e.g. "no GK" warning in amber).
- A balance meter showing the gap between strongest and weakest team, updating while dragging.
- Show *form* (last 3 matches) next to the score.

### U-5 Accessibility pass — P2 · S
Navigation already sets `aria-current`. Remaining items: status relies on colour alone
(green/grey) → add icon/label; check contrast of grey-on-white nav labels (WCAG AA 4.5:1);
tap targets ≥ 44 px on vote sliders and matchday +/- buttons; `prefers-reduced-motion` for
animations.

### U-6 Empty states and first-run — P2 · S
New players land on empty ranks/profile. Add friendly empty states ("Play 3 matches to get
ranked") and a 3-step welcome (install app → enable notifications → set preferred position).

### U-7 Payments made easier — P2 · M
- Polish bank **transfer QR code** on the season payment card (standard ZBP QR with IBAN,
  amount, reference), so paying is scan-and-confirm in the banking app.
- Admin **bulk confirm** for declared payments.
- A "who still owes" list for admins with a one-tap reminder push.

### U-8 Desktop layout — P3 · M
Mobile bottom bars are the primary navigation; on desktop, the section tabs could become a left
rail and wide pages (draft, admin billing) could use two columns.

### U-9 Dark mode — P3 · M
Tokens already exist in `design/design-tokens.json`; add a dark palette and `prefers-color-scheme`
support (useful at evening matches under floodlights).

---

## 4. New features

### F-1 Position-aware, fairer auto-balance — P1 · M (addresses the original problem directly)
**Evidence.** `autoBalanceDraft` ranks by score and snake-drafts; positions are recorded but not
used, so all goalkeepers or all defenders can land on one team.
**Proposal.**
1. Seed with the snake draft (as now).
2. Run a local-search improver: repeatedly try swapping two players between teams and keep the
   swap if it lowers a cost = `w1·(max−min team total) + w2·position-gap penalty
   + w3·repeat-teammates penalty`.
3. Ensure one GK per team when available.
4. Optional: weight recent form (last 3–5 matches) higher than older history.
It is deterministic per seed, runs in milliseconds for 18 players, and keeps "re-roll".

### F-2 Post-match "results are in" digest — P2 · S
`match-digest.ts` exists. Push it when matchday closes and voting ends: score lines, MOTM,
top scorer and each player's rating change ("+0.3 ▲").

### F-3 Season go-live checklist — P1 · S
Before switching `visible_to_players` on: transfer details filled, rates confirmed, terms text
final, test invoice generated and deleted, cron reminder text reviewed. Show this as a checklist
in Admin → Seasons that must be complete before the toggle is enabled.

### F-4 Season waitlist and replacements board — P2 · M
Players who want a core seat queue for the next free one; subscribers who will miss a Sunday can
post "seat available" so a replacement claims it (and pays the absent subscriber per §8).

### F-5 Payment reminders by push — P2 · S
Reuse the daily cron: 3 days before due day and on the due day, notify subscribers whose invoice
has neither `declared_paid_at` nor `paid_at`.

### F-6 Lock-time notification — P2 · S
At the lock moment, send "Final list is in: 16 players, 3 teams" and to waitlisted players
"You're on the waitlist (#2)". Needs a cron closer to kickoff; on Hobby, run it inside the daily
cron for the next day's matches.

### F-7 Head-to-head and chemistry insights — P3 · M
`chemistry.ts` exists for teammates. Add "record against" rivals and best/worst duos on profiles.

### F-8 Export and backup — P3 · S
Admin CSV export of matches, scores, invoices and fund ledger; scheduled Neon branch snapshot
before each season.

### F-9 Multi-language (EN/PL) — P3 · L
If non-English speakers join, externalise strings (`next-intl`). Not worth it until needed.

### F-10 Multi-group support — P3 · L
Only if another group wants to use Sideline: add `organisation_id` to top-level tables and
scope all queries. Keep deferred.

---

## 5. Things reviewed and deliberately not recommended

| Idea | Why not |
|---|---|
| Online card payments (Stripe/Przelewy24) | Fees and compliance for a friends group; bank transfer + QR covers it. |
| Native mobile apps | PWA + push already cover the needs. |
| Real-time sockets for matchday | One admin/scorekeeper writes at a time; server actions + refresh suffice. |
| Upgrading Vercel plan for frequent cron | Daily cron covers reminders; revisit only if F-6 needs exact timing. |
| Restoring the removed audit tables' UI | Explicitly removed at the user's request. |
