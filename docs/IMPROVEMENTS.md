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

**UX & engagement track** (sections 5–8, added after the first review):

| # | Item | Area | Pri | Effort |
|---|---|---|---|---|
| A | C-9 Availability bar ignores guests (shows free spots when full) | Bug | P0 | S |
| B | H-1 Phase-aware Home ("what matters now") | Home | P0 | M |
| C | AV-1 Availability page re-ordered: you → who's playing → admin | Availability | P0 | M |
| D | E-1 Moments system (one-time pop-ups) + MOTM confetti | Engagement | P1 | M |
| E | AV-3 Admin acts on the list itself (tap a player) + "Nudge no-replies" | Availability | P1 | M |
| F | O-2 Match opens on the tab that matters for its phase | Orientation | P1 | S |
| G | E-3 Bummer messages with a silver lining | Engagement | P2 | S |
| H | E-4 Personal matchday recap (story cards, shareable) | Engagement | P2 | M |

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

### C-9 Availability progress bar ignores guests — P0 · S (bug)
**Evidence.** The server cap check in `availability/actions.ts` counts *players IN + approved
guests* (`inCount + guestCount >= maxPlayers`). The page header bar uses `inPlayers.length`
only, while the count tile below uses `inCount + approvedGuests.length`. With 16 players and
2 guests on an 18 cap, the bar shows "Spots filled 16/18" while the server is already
rejecting new INs as full. Two numbers on one screen disagree.
**Fix.** One `squadCount = inPlayers + approvedGuests` used by the bar, tile and copy
("16/18 · incl. 2 guests").

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

### U-1 "Your next action" card on Home — P1 · M  (→ folded into H-1, section 8)
Today Home shows the next match, countdowns and links; players must know what to do. Show one
primary call-to-action derived from state, in priority order:
`Answer availability` → `Pay season invoice (due in 2 d)` → `Rate teammates` → `Submit your stats`
→ `Report MultiSport scan` → nothing ("You're all set ✅"). Admins get a second card:
`Approve 3 guests · 5 stats · 2 payments`.

### U-2 Match status timeline — P2 · S  (→ expanded in O-1, section 6)
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

## 5. Engagement and delight — make the app worth opening

**Principle: fun, not pressure.** Celebrate in public, commiserate in private, never shame.
Every pop-up shows once, can be dismissed with one tap, and respects
`prefers-reduced-motion` (no confetti, just the card).

**Evidence that the data already exists.** `getMotmWinner` (motm.ts),
`getRatingChangesForMatch` + `getLeaderboardMovement` (score-snapshots.ts), `syncAchievements`
returning `NewlyUnlocked` (achievements.ts), round results (results.ts), kudos (kudos.ts). They
are calculated but only appear if the player goes looking. Nothing *tells* the player.

### E-1 Moments system (foundation) — P1 · M
A small queue of personal events, shown as a full-screen sheet the **next time the player
opens the app**, oldest first, one at a time.

```
player_moments(id, player_id, kind, match_id NULL, payload jsonb,
               created_at, seen_at NULL, UNIQUE(player_id, kind, match_id))
```

- **Produced** server-side when the source event happens: matchday close (results, goals),
  voting close (MOTM, rating change), `syncAchievements` (badges), kudos received. The unique
  key makes generation idempotent; safe to re-run.
- **Consumed** by a client `<MomentsGate>` in the root layout: fetch unseen → show → mark
  `seen_at` (server action). DB-backed, so it works across phone and laptop and never repeats.
- Max 3 per open; the rest become a "You have 2 more highlights ▸" chip.
- Confetti: `canvas-confetti` (≈ 6 kB, lazy-loaded only when a celebration fires).
- Light haptic on supported phones (`navigator.vibrate(30)`).

### E-2 Celebrations (positive moments) — P1 · S each, on top of E-1

| Trigger | Pop-up | Effect |
|---|---|---|
| Man of the match | "🏆 Man of the Match! 9 of 14 votes went to you." | Gold confetti, trophy bounce, share button |
| New badge unlocked | Badge flips in with its name and rule | Small burst |
| Rank up (≥ 2 places) or entered top 5 / #1 | "▲ Up 3 places — you're now #4" | Rank number counts up |
| Hat-trick / top scorer of the day | "⚽⚽⚽ Hat-trick hero" | Ball confetti |
| Clean sheet (GK/DEF) | "🧤 Wall. 0 conceded in 3 rounds" | Gives defenders a moment too (balances the goals bias) |
| Unbeaten day | "No losses today — 4W 1D" | Green burst |
| Attendance streak 5/10/20 weeks | "🔥 10 Sundays in a row" | Flame on avatar for that week |
| Milestones | 1st goal, 25/50/100 matches, 1st MOTM | Big confetti |
| Kudos received | "Ahmed gave you kudos 👏" | Quiet card, no confetti |
| Got off the waitlist | "You're in! A spot opened." | Quick pop |

### E-3 Bummer messages (private, with a silver lining) — P2 · S
Rules: **only the player sees it**, never shows exact low scores of others, always ends with
something positive or a next step, max **one per 2 weeks**, rotates copy, can be switched off
in Profile ("Show cheeky messages").

| Trigger | Example message |
|---|---|
| Lost every round | "0 wins today. Even Barça have those days. Your form over 5 matches is still ▲." |
| Rating dropped ≥ 0.5 | "Rating dipped 6.8 → 6.2. One good Sunday fixes it — 3 players climbed 1+ point last month." |
| Forward, no goals in 3 matches | "The goal is still there, we checked. 📏 Your assists are up though: 3 this month." |
| Missed voting | "Your teammates rated you — you didn't return the favour 😢 Vote closes in 6 h." |
| Marked OUT 3 weeks in a row | "We miss you on the pitch. Next match: Sun 10:00, 4 spots left." |
| Own goal recorded | "Wrong net, right spirit. 🙃" |

Tone guide: self-deprecating football humour, never about skill ("you're bad"), never
public, never on a rank page.

### E-4 Personal matchday recap ("story" cards) — P2 · M
After voting closes, a swipeable 4–5 card story (like Instagram stories): *Your day* (W/D/L,
goals, assists) → *Rating* (old → new, animated) → *MOTM* → *Best duo* (from chemistry) →
*Share*. The last card renders a shareable image (`next/og`) for the WhatsApp group.
`match-digest.ts` already builds the team-level text.

### E-5 Team reveal — P2 · S
When the admin publishes teams, players get a push, and opening the app shows a card-flip
reveal: "You're on **Team Blue**" + teammates' avatars + kit colour + "Rival to watch: X".
Turns a dry list into a moment and stops "which team am I?" messages in WhatsApp.

### E-6 Predictions mini-game — P3 · M
Before kickoff, players predict which team wins the day (from the published teams). Correct
guesses earn "pundit points" with a separate small leaderboard and a "Pundit of the Season"
award. Uses existing rounds/results.

### E-7 Micro-interactions — P2 · S
In/Out button "pop" + haptic, animated count when the squad number changes, rank numbers
counting up, skeleton shimmer, pull-to-refresh on Home. Cheap, makes the app feel alive.

---

## 6. Orientation — "I feel lost"

**Diagnosis.**
- Users don't know *where in the week* they are: the match status is shown as internal words
  (`draft` / `active` / `closed`) that mean something to admins, not players.
- A match has up to six tabs (availability, draft/teams, matchday, vote, stats, payments).
  Most are irrelevant at any given moment, but all look equally important.
- Home doesn't show the player's own status ("Am I in?"), so they open the match to check.

### O-1 One weekly status strip, everywhere — P1 · S
```
 Open ── Locked ── Teams out ── Live ── Rate ── Done
   ✓        ●
```
Shown on the Home match card and at the top of every match tab, with a one-line
explanation for the current step ("Locked: only admins can change the list now").
Replace `draft/active/closed` badges with these player words.

### O-2 Open the match on the tab that matters now — P1 · S
`/matches/[id]` redirects (or highlights) by phase: before lock → Availability; teams
published → Teams; live → Matchday (live score); after → Vote; done → Recap. Tabs not yet
relevant are shown greyed with "Opens after the match" instead of empty pages.

### O-3 "You" chip — P1 · S
A small chip on the match card and header: `You: IN ✅ · Team Blue` / `You: no reply ⚠️` /
`Waitlist #2`. Answers the most common question without navigation.

### O-4 Plain-language blocked states — P2 · S
Every disabled control says why and what to do: "Locked 24 h before kickoff. Need a change?
Message an admin ▸" (deep link to WhatsApp admin).

### O-5 Consistent page header — P2 · S
`← Sun 25 Oct` + title + phase strip on every match page, same position, same size. Today
availability has a back link + nav + a large title card; other tabs differ.

---

## 7. Availability page redesign

### 7.1 What's wrong today (top-to-bottom, from `availability/page.tsx`)

| # | Finding | Effect |
|---|---|---|
| 1 | Order: header → my buttons → guest form → waitlist → **admin settings** → **guest admin** → counts → **who's in** lists | Players and admins scroll past admin boxes to see who's playing — the main question |
| 2 | The same number appears three times: progress bar, 3 count tiles, 3 list headers | Noise; and they disagree (C-9) |
| 3 | **Club-wide settings** (waitlist auto-promote, vote-gate, 24 h lock) live inside a *per-match* page, in the same collapsible as per-match settings | Easy to change every match by accident while editing one; belongs in Admin control |
| 4 | Admin sets someone's status in a **separate full player list** (`AdminPlayerControls`) instead of on the In/Out/Pending lists already on screen | The roster is shown twice; the admin has to search |
| 5 | In, Out and Pending lists get equal space | "Out" is the least useful; "No reply" is the one admins act on |
| 6 | No position mix (how many GK/DEF), no ★ for season core players | Admin can't judge if the draft will work until the draft page |
| 7 | No way to chase no-replies from here | Admin goes to WhatsApp manually |
| 8 | Guest request lives in a collapsed "Do you want to bring a guest?" `<details>` | Fine for players; for admins pending guest approvals are in a *different* collapsible further down |

### 7.2 Proposed layout — player

```
┌─────────────────────────────────────────────┐
│ ← Sun 25 Oct · 10:00 · Orlik Bemowo  ☀ 12°  │
│ Open ●── Locked ── Teams ── Live ── Rate    │
├─────────────────────────────────────────────┤
│  You:  [ ✅ I'm IN ]   [ Out ]              │
│  Locks in 18 h 20 m                         │
│  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░  16 / 18 · 2 guests    │
├─────────────────────────────────────────────┤
│ Who's playing (16)    GK 2 · DEF 5 · MID 6 · FWD 3
│  (●)(●)(●)(●)(●)(●)(●)(●)  avatar grid      │
│  ★ = season core   G = guest                │
├─────────────────────────────────────────────┤
│ Waitlist (2) ▸   No reply (7) ▸   Out (5) ▸ │
│ + Bring a guest                              │
└─────────────────────────────────────────────┘
```

### 7.3 Proposed layout — admin (same page, plus an action bar)

```
┌─ Admin ─────────────────────────────────────┐
│ ⚠ 2 guest requests  [Review]                │
│ ⏳ 7 no reply        [Nudge all 🔔]          │
│ 🔒 Locks in 18 h     ⚙ Match settings       │
└─────────────────────────────────────────────┘
 … then the same "Who's playing" grid as players.
 Tap any avatar → bottom sheet:
   Ahmed · MID · season core
   [ In ] [ Out ] [ Waitlist ] [ Remove guest ]
```

### 7.4 Items

- **AV-1 Re-order + de-duplicate — P0 · M.** You → squad → secondary lists → (admin) action
  bar. One squad number (fixes C-9). Collapse Out / No reply / Waitlist into tappable chips.
- **AV-2 Move club-wide settings to Admin control › Other — P0 · S.** Keep only *this match*
  settings (open/closed, cap) in a "⚙ Match settings" sheet. Link: "Club defaults ▸".
- **AV-3 Act on the list — P1 · M.** Tap a player → bottom sheet to set status. Removes the
  duplicate `AdminPlayerControls` list.
- **AV-4 Nudge no-replies — P1 · S.** Button sends the existing reminder push only to
  pending players (reuses the cron's sender), rate-limited to once per 6 h per match.
- **AV-5 Position mix + core marker — P2 · S.** `GK 2 · DEF 5 · MID 6 · FWD 3` with amber
  warning when there's no GK; ★ on season subscribers.
- **AV-6 Guest approvals at the top for admins — P1 · S.** Pending requests in the action bar,
  approve/decline inline.

---

## 8. Home screen review — does it show the most useful info?

**Short answer: partly.** It shows *links to* useful places, but not the *answers*. The top
quarter is a greeting, and the most useful facts — "am I in?", "which team?", "how did I do?",
"do I owe money?" — aren't on it.

### 8.1 What a player needs vs what Home shows

| Moment in the week | What they want to know | Home today |
|---|---|---|
| Mon–Fri (before lock) | Am I in? How many are in? When/where? | Generic "Set your availability" card — shown **even after answering**; own status not shown (`MatchListItem` has no `myStatus`) |
| Lock → kickoff | Which team am I on? Teammates? Weather? Map? | Not shown; card title says "Latest match" with an admin badge `draft` |
| Live | Score now | Badge `active` only |
| After match | How did I do? MOTM? Rating change? | Rate card + W/D/L bar. MOTM and rating change exist in the DB but aren't shown |
| Month start | Do I owe money? By when? | Not shown (season invoice lives in /season) |
| Any time | My form, streak, rank | Rank (twice: hero chip + "Your standing" card) |
| Admin | What needs me? | Pending stats + password resets only. Not: guest requests, no-replies, teams not drafted, unpaid invoices, MultiSport approvals |

Other issues: up to **5 full-width banners** can stack (notification prompt, install prompt,
season prompt, vote, availability) with equal visual weight; rank is shown twice.

### 8.2 H-1 Proposed phase-aware Home — P0 · M

```
┌─────────────────────────────────────────────┐
│ Hi Mohamed  · #4 ▲2 · 🔥 6 weeks            │  ← slim header (hero shrinks)
├─────────────────────────────────────────────┤
│ NEXT MATCH · Sun 25 Oct 10:00               │  ← one card, changes by phase
│ Open ●── Locked ── Teams ── Live ── Rate    │
│ You: [ ✅ IN ] [ Out ]   16/18 · locks 18 h │  ← answer inline (optimistic)
│ Orlik Bemowo · ☀ 12° · Map ▸                │
├─────────────────────────────────────────────┤
│ TO DO (max 3)                                │
│ ⭐ Rate Sunday's match       closes in 6 h ▸ │
│ 💳 Season · 143 PLN          due in 3 days ▸ │
│ ⚽ Submit your goals                         ▸│
│        (or: "You're all set ✅")             │
├─────────────────────────────────────────────┤
│ LAST MATCHDAY · Sun 18 Oct                   │
│ 3W 1D 1L · 2 ⚽ 1 🅰 · rating 6.8 → 7.1 ▲     │
│ MOTM: Ahmed 🏆        Recap ▸                │
├─────────────────────────────────────────────┤
│ FORM  W W D L W   · Top 20%                  │
├─────────────────────────────────────────────┤
│ ADMIN (admins only)                          │
│ 2 guests · 7 no reply · 3 stats · 4 unpaid  │
└─────────────────────────────────────────────┘
```

Phase variants of the NEXT MATCH card:
- **Open:** inline In/Out + squad count + lock countdown.
- **Locked / teams out:** "You're on **Team Blue**" + teammate avatars + venue/weather/map.
- **Live:** live round score, auto-refresh.
- **Done:** collapses into the LAST MATCHDAY card; NEXT MATCH shows "Next match not created
  yet" (or the next one).

Implementation notes: add `myStatus`, `myTeam`, `squadCount` to the Home query (one SQL with
joins, not more round trips); TO DO is a pure function over already-fetched obligations; show
the notification/install prompts in **one** slot, at most once per week.

### 8.3 Suggested bundles

| Bundle | Contains | Why together |
|---|---|---|
| **1. "Clarity"** | C-9, AV-1, AV-2, H-1 (without moments), O-1, O-3 | Fixes "lost" and "too much for admins"; mostly layout, low risk |
| **2. "Delight"** | E-1, E-2 (MOTM, badge, rank up, clean sheet), E-7 | One table + one gate component; immediate wow on next Sunday |
| **3. "Personality"** | E-3, E-4, E-5 | Builds on bundle 2 |
| **4. "Admin speed"** | AV-3, AV-4, AV-6, O-2 | Faster matchday admin |

---

## 8b. Round 2 ideas — stories, tap-spam sound, editable messages

Agreed with the group owner after the UX bundles shipped to dev. Order of work: **M-1 → T-1 → S-1**
(smallest first; S-1 needs a migration).

### M-1 Editable moment messages (celebrations + bummers) — P2 · S

- **What:** admins rewrite the pop-up text for every moment kind (MOTM, hat-trick, team reveal,
  bummers, …). Several variants per kind; one is picked at random per moment and stays stable
  if the pop-up is shown again. An empty kind falls back to the built-in copy.
- **Placeholders:** `{name}`, `{votes}`, `{goals}`, `{team}`, `{teammates}`, `{streak}`, `{rank}`,
  `{n}`. The editor lists which ones each kind supports; unknown placeholders are left as typed.
- **Storage:** one `app_settings` row `moment_copy` = `{ [kind]: [{ emoji?, title, body }] }`. No migration.
- **Runtime:** `momentView(m, overrides?)` applies the override, keeps the default CTA and the
  bummer silver-lining footnote. Overrides are read once per request by `MomentsGate` and cached.
- **Admin UI:** Admin control › new **Messages** tab (admins and super). Grouped *Celebrations* /
  *Bummers*; per kind: the default text, the custom variants, a live preview pop-up, **Reset**.
- **Tests:** placeholder fill, fallback to defaults, stable pick.
- **Status:** built on `dev`. The Messages tab sits in Admin control, which is super-admin only, so
  only super admins can edit messages for now.

### T-1 Tap-spam sound easter egg — P3 · S

- **Trigger:** a 4th tap on the IN / OUT buttons within 2 s (taps count even when the button is
  disabled, e.g. already IN). Plays once, then a 3 s cooldown. Sound plays on that phone only.
- **Default sound:** three different fart variations synthesised with Web Audio (noise + wobbling
  low oscillator), one picked at random. No audio files, no licensing.
- **Custom sounds:** admin uploads up to 3 files (mp3 / ogg / m4a, ≤ 200 KB each) in Admin control ›
  Messages; stored in Vercel Blob, list in `app_settings` `tap_spam_sounds`. When the list is empty
  the synth farts are used. Admin master switch to disable the egg entirely.
- **Opt-out:** "Silly sounds" switch in Profile (per device, `localStorage`), default on.
- **Caveat:** an iPhone on silent mutes web audio; that is expected.
- Exception to §9 "sounds on by default": this only fires on deliberate spam, never on normal use.
- **Status:** built on `dev`. The settings load from `GET /api/tap-spam` on the first tap (not on
  page load, and not via a server action, which would queue ahead of the IN/OUT save). Disabled
  buttons use `pointer-events: none` so taps on them still reach the counter.

### S-1 24-hour photo stories — P2 · M

- **Who:** any player. Max 5 live stories per player.
- **Post:** "+" on the Home stories row → pick / take photo → optional caption (≤ 120 chars) →
  optional match link (defaults to this week's match) → share. The phone resizes to 1080 px
  JPEG/WebP (~150–250 KB) before upload; the server re-checks type and size (≤ 1 MB) and stores it
  in Vercel Blob under an unguessable path, like profile photos.
- **See:** a stories row at the top of Home (avatar rings, green = unseen), grouped per player.
  Tapping opens the full-screen story viewer (the recap viewer, generalised): auto-advance,
  tap left / right, hold to pause, swipe down / ✕ to close.
- **Interact:** one emoji reaction per viewer (🔥 😂 👏 ⚽ 😮 ❤️, changeable). The owner sees
  **Seen by N** with names and reactions. A linked match shows as a chip that opens the match.
- **Moderation:** owner and any admin can delete a story at once (blob + rows).
- **Expiry:** every query filters `expires_at > now()`, so a story disappears exactly at 24 h.
  The existing daily cron also deletes expired blobs and rows (no extra cron needed on Hobby).
- **DB (migration 0026, additive):** `stories(id, player_id, image_url, caption, match_id,
  created_at, expires_at)`, `story_views(story_id, player_id, seen_at)`,
  `story_reactions(story_id, player_id, emoji)`.
- **Not in v1:** video, text-only stories, replies / DMs, push on every new story (too noisy).

## 9. Things reviewed and deliberately not recommended

| Idea | Why not |
|---|---|
| Online card payments (Stripe/Przelewy24) | Fees and compliance for a friends group; bank transfer + QR covers it. |
| Native mobile apps | PWA + push already cover the needs. |
| Real-time sockets for matchday | One admin/scorekeeper writes at a time; server actions + refresh suffice. |
| Upgrading Vercel plan for frequent cron | Daily cron covers reminders; revisit only if F-6 needs exact timing. |
| Restoring the removed audit tables' UI | Explicitly removed at the user's request. |
| "Worst player of the week" or public low-score call-outs | Shaming drives people away from a friends' game; bummers stay private (E-3). |
| Sounds on by default | Phones at work/home; haptics + visuals are enough. Only exception: the T-1 tap-spam egg, which needs deliberate spamming and has a Profile mute. |
| Coins, loot boxes, paid cosmetics | Wrong incentive for a social group; badges and moments cover the fun. |
| Confetti on every action | Loses meaning; reserve for real achievements (E-2). |
