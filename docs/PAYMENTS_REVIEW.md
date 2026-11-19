# Payments review and simplification proposal

| | |
|---|---|
| Status | **Accepted** — all decisions made (§7); ready for implementation (§9). No code changed yet |
| Date | 2026-11-17 |
| Based on | `ai_dev` @ `f68714d` (migrations through `0037`) |
| Scope | Normal-match payments, season subscription billing, session charges, MultiSport credit, group fund — player and admin views |

## 1. Summary

Payments feel confusing because the app contains **three independent payment
systems** that were built at different times, each with its own tables, money
format, status model, screens and reminders:

| | A. Match pot | B. Season invoices | C. Session charges + fund |
|---|---|---|---|
| What | Split a match's total cost between everyone who played | Monthly subscription for the 14 core seats | Flat fee for non-core players on season matches; replacements pay the absent subscriber |
| Tables | `matches.total_payment`, `payments`, `match_guests.paid` | `season_invoices`, `multisport_scans` | `guest_charges`, `fund_adjustments`, `matches.extended` |
| Money | `double precision`, whole units, any currency | integer grosz, PLN | integer grosz, PLN |
| Amount owed | Recomputed live: `ceil(total ÷ heads)` | Snapshotted on the invoice | Snapshotted on the charge |
| Who marks paid | **Player sets it directly**, admin can too | Player declares → **admin confirms** | **Admin only** (even player-to-player debts) |
| Player sees it | Match ▸ Payments, only after admin opens it | Home card + Season ▸ Payments | **Nowhere** (except the seat-swap card) |
| Payment details | Re-entered **per match** | Per season | (none shown) |
| Reminders | Manual push from match page | Automatic cron (3 days before + due day) | None |

A player can't answer "what do I owe right now?" in one place, and an admin
can't answer "who owes the group money?" in one place. The proposal (§5) is to
keep the existing business rules but put them behind **one obligation model,
one status lifecycle, one "My payments" screen and one admin "Payments inbox"**,
rolled out in small backward-compatible phases (§6).

## 2. How it works today

### 2.1 A — Normal-match pot

Code: [`src/lib/payments.ts`](../src/lib/payments.ts),
[`matches/[id]/payments/actions.ts`](../src/app/matches/[id]/payments/actions.ts),
[`payments-admin.tsx`](../src/app/matches/[id]/payments/payments-admin.tsx),
[`payments-player.tsx`](../src/app/matches/[id]/payments/payments-player.tsx).

1. Admin opens Match ▸ Payments, types the **total** (e.g. pitch cost) and the
   **payment details** (recipient, phone/account, method, note, link, currency).
   Only the currency carries over to the next match; the rest is typed again
   every match ([`match-admin.ts:176`](../src/lib/match-admin.ts)).
2. Share = `ceil(total ÷ (rostered players + approved guests))`
   (`computeSummary`). It is **not stored** — it changes if the roster changes.
3. Admin presses **Open for players** (`payments_active`). Until then players see
   "Payments are not open for this match yet."
4. Player taps **I've paid** → `payments.paid = 1` immediately, covering their
   own share and every guest they host. They can also undo it. There is no
   "declared vs confirmed" distinction, so the admin's tick and the player's
   tick look identical.
5. "Collected" and "change" are inferred as `share × paid heads`, not recorded.
   "Change (all matches)" sums across every match regardless of currency.
6. Admin can send a manual push reminder to unpaid players and hosts of unpaid guests.

### 2.2 B — Season subscription invoices

Code: [`src/lib/season-billing.ts`](../src/lib/season-billing.ts),
[`admin/accounts/billing-actions.ts`](../src/app/admin/accounts/billing-actions.ts),
[`billing-admin.tsx`](../src/app/admin/accounts/billing-admin.tsx),
[`season/payments-tab.tsx`](../src/app/season/payments-tab.tsx),
[`src/lib/multisport.ts`](../src/lib/multisport.ts).

1. Super-admin creates the season, rates, transfer details, terms, and completes
   a 5-item go-live checklist.
2. Players take one of 14 numbered core seats.
3. Admin presses **Generate** for a month (`YYYY-MM`). Each active subscriber gets
   an invoice: `playing days × day rate ÷ subscriber_cap`, rounded up to whole PLN
   (surplus → fund), minus approved MultiSport credit that fits. Inputs are
   snapshotted.
4. Player sees it on Home and Season ▸ Payments with countdown, transfer details,
   QR code and reference; taps **I've sent it** (declared).
5. Admin confirms (single or bulk "confirm declared") → `paid_at`.
6. Cron sends reminders 3 days before and on the due day.
7. Admin tools: hide/show invoice (re-fits credit), edit playing days (recomputes
   unpaid bills), delete invoice, settle leftover MultiSport credit (refund or fund).

### 2.3 C — Session charges and the group fund (season matches only)

Code: [`src/lib/season-fund.ts`](../src/lib/season-fund.ts),
[`fund-actions.ts`](../src/app/matches/[id]/payments/fund-actions.ts),
[`session-charges.tsx`](../src/app/matches/[id]/payments/session-charges.tsx),
[`fund-admin.tsx`](../src/app/admin/accounts/fund-admin.tsx),
[`src/lib/seat-offers.ts`](../src/lib/seat-offers.ts).

1. On a season match, non-core players and approved guests owe a flat fee
   (default 36 PLN).
2. Charges exist only after an admin presses **Raise charges** on Match ▸ Payments
   (or when a seat swap is approved). They are never removed automatically.
3. Each charge is either **extra** (pays the group fund) or **replacement** (pays
   the absent subscriber directly). The admin can switch the kind.
4. Only an admin can mark a charge paid — including replacement payments that
   happen privately between two players.
5. The fund balance is derived: rounding on paid invoices + paid extra fees
   − extensions × **current** extension rate + manual adjustments.

### 2.4 Screen map — where payments live today

| Who | Screen | Shows |
|---|---|---|
| Player | Home | Season invoices only |
| Player | Match ▸ Payments | Pot share (A), only if admin opened it |
| Player | Match ▸ Availability (seat-swap card) | Replacement fee (C), only in that flow |
| Player | Season ▸ Payments / MultiSport / Group fund | Invoices (B), scans, fund balance |
| Admin | Home | Count of declared **season invoices** to confirm |
| Admin | Match ▸ Payments | Session charges + extension (C) **and** pot (A) on the same page |
| Admin | Admin ▸ Billing | Rates, transfer details, who owes (B), MultiSport, leftover credit |
| Admin | Admin ▸ Seasons | Subscribers, go-live checklist |
| Admin | Admin ▸ Billing (fund panel) / Season ▸ Fund | Fund breakdown and adjustments |

## 3. Problems found

Each item was checked in the code at `f68714d`.

**Player experience**

1. **No single "what do I owe" view.** Home shows only season invoices; match
   shares are hidden in each match's Payments tab; session charges and
   replacement debts are not shown to the payer at all
   (`guest_charges` is read only by admin screens and `seat-offers.ts`).
2. **Two different meanings of "paid".** On a match, "I've paid" is final; on a
   season invoice, "I've sent it" waits for confirmation. Players can't tell
   which applies.
3. **Shares can change after paying.** The match share is recomputed from the
   current roster, so adding or removing a player changes what everyone
   "owes" and what was "collected", even for people already marked paid.

**Admin experience**

4. **Payment work is spread over 5+ screens** (§2.4), and the Home counter only
   counts season invoices.
5. **Double-billing risk on season matches.** The pot (A) has no season
   awareness: on a season match it still splits the total across *all* heads,
   subscribers included, and the admin can open it to players. Subscribers
   would be asked to pay on top of their invoice.
6. **Manual, stale session charges.** Charges appear only after "Raise charges";
   a player who drops out afterwards keeps a charge until an admin deletes it.
7. **Admin must confirm payments it never sees.** Replacement fees are paid
   player-to-player, but only an admin can mark them paid.
8. **Payment details typed per match**, and stored separately for seasons —
   two forms with different field names (`payment_mobile` vs `payment_account`).

**Data / correctness**

9. **Mixed money formats.** Pot totals are `double precision` in whole units in
   any currency; everything else is integer grosz in PLN. `formatMinor` always
   prints "PLN". "Change (all matches)" adds amounts across currencies.
10. **Fund history is not stable.** Extensions are valued at the *current*
    season extension rate, so changing the rate rewrites past fund history.
    The match-pot "change" is a separate concept that never reaches the fund.
11. **Season split uses the seat cap, not active subscribers.** With fewer than
    14 subscribers, part of the pitch cost is uncovered and has to be patched
    with manual fund adjustments ("Covered unfilled place").
12. **Two ways to decide "is this a season match".** The payments page uses the
    match date (`getSubscriptionSeasonForDate`); charges use `matches.season_id`
    (`getSubscriptionSeasonForMatch`). A match in the season's date range but not
    linked to it shows nothing, silently.
13. **Inconsistent rounding paths.** New invoices use `Math.round` in JS
    (`invoiceAmountMinor`); recalculated invoices use SQL `ROUND`; collection
    uses `CEIL`. They agree today but are maintained in three places.

## 4. Design principles for the simpler version

1. **One obligation = one row** that says who owes whom how much for what.
   Every amount a person sees is a stored row, never a live formula.
2. **One lifecycle everywhere:** `open → declared → confirmed`
   (plus `waived` / `cancelled`). The payer declares; the payee confirms.
3. **One screen per role:** players get **My payments**; admins get a
   **Payments inbox**. Existing per-match and season screens stay as drill-downs.
4. **Automate the obvious:** create obligations from events (matchday closed,
   month started, seat swapped), not from buttons.
5. **Keep the business rules** (14 seats, CEIL to whole PLN, MultiSport, flat
   fee, extensions, fund) — the complexity to remove is in the handling, not the rules.

## 5. Proposal

### 5.1 Data model: a unified obligation ledger

Add one table that every source writes into. Existing tables stay as the
*detail* records (invoice breakdown, scan history), but status and amounts live here.

```text
dues
  id
  payer_player_id        -- who pays (a guest's dues go to the host)
  guest_id               -- optional, for display ("for guest Tom")
  payee                  -- 'group' | 'player'
  payee_player_id        -- set when payee = 'player' (replacement)
  source                 -- 'match_share' | 'season_invoice' | 'session_fee' | 'replacement'
  match_id / season_id / invoice_id   -- links to the detail record
  amount_minor, currency -- snapshotted at creation
  status                 -- 'open' | 'declared' | 'confirmed' | 'waived' | 'cancelled'
  declared_at, confirmed_at, confirmed_by, note
  created_at
```

And make the fund a real ledger instead of a formula:

```text
fund_entries
  id, season_id (nullable for non-season), amount_minor (+/-), kind
  ('core_payment' | 'session_fee' | 'facility_payment' | 'replacement_credit' |
   'rounding' | 'extension' | 'multisport_leftover' | 'adjustment' | 'match_change')
  due_id / match_id references, note, created_by, created_at
```

Fund entries are written when the event happens (fee confirmed, extension
confirmed at *that day's* rate, invoice confirmed with rounding), so history
never changes when rates change. Balance = `SUM(amount_minor)`.

### 5.2 Rules per match type (same rules as today, made explicit)

| Situation | Who owes | Payee | Created when |
|---|---|---|---|
| Normal match | Each rostered player (+ their guests): total split between heads | Group / organiser | Admin presses **Finalize cost** (snapshots the share); player "I've paid" is final (trusted) |
| Season match, core subscriber | Nothing per match | — | — (covered by monthly invoice) |
| Season match, extra player / guest | Flat fee, minus MultiSport credit if they scanned | Group fund | Matchday closed (auto), removed if they were OUT |
| Season match, replacement | Flat fee, minus MultiSport credit if they scanned | Group; absent subscriber is credited on next invoice (recommended, §8.3) | Seat swap approved (already automatic) |
| Season month | Each active subscriber | Group | Draft created by cron, admin publishes (§8.6) |
| Season matchday | The group pays the facility | Facility | Admin records the actual amount paid (§8.4) |

The pot (A) is **hidden on season matches**, which removes the double-billing risk.

### 5.3 Player view — "My payments"

One page (and a Home card linking to it):

```text
My payments                                   You owe 179 PLN
────────────────────────────────────────────────────────────
● Season · November          143 PLN   due 3 Dec  [QR] [I've paid]
● Match Sun 23 Nov           36 PLN    session fee → group fund
● Match Sun 16 Nov (Tom)     36 PLN    replacement → pays Adam directly
                                             [Pay all to group]
Waiting for confirmation (1)    History (12)
```

- One **I've paid** per row, plus **Pay all** for dues with the same payee.
- Payment details come from one **payment profile** (season, or group default),
  so they are shown consistently with the QR code and reference.
- Replacement rows show the subscriber's name; that subscriber confirms receipt
  from their own My payments ("Adam says he paid you 36 PLN — Confirm").

### 5.4 Admin view — "Payments inbox"

```text
Payments inbox                    To confirm 4 · Overdue 2 · Open 11
──────────────────────────────────────────────────────────────────
To confirm   [Confirm all]
  Marek   Season · Nov        143 PLN  declared 2h ago  [Confirm] [Reject]
  Ola     Match 23 Nov fee     36 PLN  declared 1d ago  [Confirm] [Reject]
Overdue
  Piotr   Season · Oct        143 PLN  due 3 Nov        [Remind] [Waive]
Filters: source ▾  match ▾  season ▾  player ▾
```

- The Home counter counts **all** declared dues.
- Match ▸ Payments becomes a drill-down filtered to that match; Admin ▸ Billing
  keeps rates, transfer details, invoice generation, MultiSport and the fund.
- One **payment profile** form (group default, optionally overridden per
  season or match) replaces the two duplicate detail forms.

### 5.5 Money format

All amounts become `integer` minor units plus a currency code, including the
match pot (`total_payment` → `total_minor`). Move rounding into a single shared
helper used by both JS and SQL paths, and make `formatMinor` currency-aware.

## 6. Rollout plan

Local development shares the **Preview** database with the deployed `ai_dev`
and `dev` previews, so every migration must be **additive and backward
compatible** until the code that uses it reaches production.

Each phase delivers something usable on its own. Item IDs are used in §9 and in
branch names (`feature/pay-<id>`).

### Phase 0 — Quick wins (no schema change)

| ID | Change | Fixes | Main files |
|---|---|---|---|
| P0.1 | Hide the pot on season matches (admin section, player view, unpaid reminders) | 5 | `matches/[id]/payments/page.tsx`, `lib/payments.ts`, `app/actions/push.ts` |
| P0.2 | Show the player's own session/replacement charges on Match ▸ Payments and a Home card | 1 | `lib/season-fund.ts` (new `listPlayerCharges`), `payments/page.tsx`, `app/page.tsx`, `lib/home.ts` |
| P0.3 | Prefill new matches' payment details from the previous match | 8 | `lib/match-admin.ts` (insert at line ~176) |
| P0.4 | Detect season matches only through `matches.season_id` | 12 | `payments/page.tsx` (`getSubscriptionSeasonForDate` → `…ForMatch`) |
| P0.5 | Admin Home counter includes unpaid session charges | 4 | `lib/home.ts`, `app/page.tsx` |
| P0.6 | "Raise charges" becomes **Sync charges**: also removes unpaid charges for players now OUT / removed guests | 6 | `lib/season-fund.ts`, `session-charges.tsx` |
| P0.7 | Seat-cap gap warning on Admin ▸ Billing when subscribers < cap (decision 5) | 11 | `lib/season-billing.ts`, `billing-admin.tsx` |

### Phase 1 — Unified views (no schema change)

| ID | Change | Main files |
|---|---|---|
| P1.1 | `src/lib/dues.ts`: one read model that `UNION`s pot shares, invoices and session charges into the `dues` shape (§5.1) | new |
| P1.2 | Player **My payments** page (`/payments`) + Home card, using existing actions | new route, `app/page.tsx` |
| P1.3 | Admin **Payments inbox** (To confirm / Overdue / Open, bulk confirm), linked from Home | new route, `lib/home.ts` |

### Phase 2 — Accepted season rules (additive migration `0038`)

| ID | Change | Schema |
|---|---|---|
| P2.1 | **Replacements pay the group; subscriber credited on next invoice** (decision 3). Generalise MultiSport credit into a `season_credits` source so the existing allocator applies both | new `season_credits` table; `guest_charges` keeps `owed_to_player_id` as the credit target |
| P2.2 | **Non-core scans reduce that session's fee** (36 → 21); approved after payment → refund | `guest_charges.scan_credit_minor`; widen `multisport_scans_settled_check` to allow `settled_as = 'fee'` |
| P2.3 | **Matchday settlement**: expected facility bill vs. amount actually paid, scan-count mismatch warning | new `matchday_settlements` table |
| P2.4 | **Snapshot extension cost** when confirmed, so fund history never changes with rates | `matches.extension_cost_minor` (nullable); `CREATE OR REPLACE` of `sideline_confirm_extension` |
| P2.5 | Normal-match pot: **Finalize cost** snapshots the share; "I've paid" stays trusted (decisions 1–2) | `matches.share_minor` (nullable) |
| P2.6 | Per-season split setting, default `cap` (decision 5) | `seasons.split_mode` (`'cap'` default) |

### Phase 3 — Ledger tables (additive, then dual-write)

| ID | Change |
|---|---|
| P3.1 | Create `dues` and `fund_entries` (migration `0039`), backfill from existing rows |
| P3.2 | Dual-write from all payment server actions; switch reads in `lib/dues.ts` to the tables |
| P3.3 | Fund balance = `SUM(fund_entries)`; reconcile against the old derived formula on Preview |
| P3.4 | Retire old columns — **separate later migration**, only after production runs on the new model |

### Phase 4 — Automation and cleanup

| ID | Change |
|---|---|
| P4.1 | **Monthly draft invoices** from the daily cron (decision 6). Drafts reuse `hidden_at`, so already-deployed code keeps them invisible to players; admin presses Publish |
| P4.2 | Auto-sync session charges when the matchday is closed |
| P4.3 | Remove knobs made redundant (manual "Sync charges" once P4.2 runs it automatically, "Reset all unpaid", separate season/match detail forms) and the leftovers listed in §9.8 |

## 7. Decisions

| # | Question | Decision |
|---|---|---|
| 1 | Normal matches: does "I've paid" need admin confirmation? | **Keep trusting players.** Normal-match dues are auto-confirmed when the player declares; the admin can still undo. |
| 2 | Normal-match pricing | **Keep splitting** the total between heads. Snapshot the share at "Finalize cost" so it stops drifting. |
| 3 | How replacement money reaches the absent subscriber | **Via the group** (§8.3 option B): every non-core player pays the group; the subscriber whose offered seat was taken gets 36 PLN off the next invoice. |
| 4 | Currencies other than PLN | **Not for now, maybe later.** Build PLN-first but keep a `currency` column so it can return. |
| 5 | Season split: seat cap or active subscribers | **Split by seat cap (14)** (§8.5), with a gap warning for the admin and a per-season `cap` / `active` setting. |
| 6 | Auto-generate monthly invoices | **Yes**, as drafts the admin publishes (§8.6). |
| 7 | Where to start | Recommended: Phase 0 items 0.1 and 0.2 first, then Phase 1. |

## 8. Season money flow analysis

### 8.1 The real-world flow (as described by the organiser)

- The facility contract is **500 PLN per 1.5 h**, or **600 PLN per 2 h** when more
  than 14 players turn up and the group agrees to extend by 30 minutes.
- The **14 core players pay monthly, upfront**: `Sundays × 500 ÷ 14`
  (4 Sundays → 142.86 → **143 PLN**; 5 Sundays → 178.57 → **179 PLN**).
- The group pays the facility **on each matchday**, after MultiSport scans are
  counted: every scan takes **15 PLN** off that day's bill
  (10 scans → 500 − 150 = **350 PLN**).

So the group always holds money between "collected upfront" and "paid on the
day", and MultiSport savings only become known on the day. That timing is the
root of most of the confusion: the app tracks what players owe, but **not what
the group actually pays the facility**, so nobody can see where the difference went.

### 8.2 Scenarios

Per Sunday, in a 4-Sunday month, 14 subscribers, flat fee 36 PLN, scan credit 15 PLN.
"Group result" = core money for that Sunday (500) + fees received − facility bill
− credits returned to core scanners.

| # | Situation | Facility bill | Who pays whom | Group result | App today |
|---|---|---|---|---|---|
| S1 | 14 core play 1.5 h, 10 core scan | 500 − 150 = **350** | Core already prepaid; 10 scanners get 15 off next invoice | 500 − 350 − 150 = **0** ✓ | Handled (credit applied next month) |
| S2 | 11 core play, 3 absent, nobody replaces, 8 scan | 500 − 120 = **380** | Absent players get nothing back (rules §8) | 500 − 380 − 120 = **0** ✓ | Handled |
| S3 | 11 core + 3 non-core fill to 14; 8 core + 2 replacement scans | 500 − 150 = **350** | Each replacement pays 36 to an absent subscriber | 500 − 350 − 120 = **+30**, the replacements' scans, **unassigned** | Replacements default to "extra → fund" unless they came via seat swap; their scans sit as leftover credit until an admin decides |
| S4 | 14 core + 4 extras = 18, extended to 2 h, 10 core scan | 600 − 150 = **450** | Extras pay 36 each into the fund; fund pays the 100 extension | 500 + 144 − 450 − 150 = **+44** → fund ✓ | Handled (extension valued at *current* rate) |
| S5 | 8 core + 3 non-core = 11 (6 core absent) | 500 − 15 × scans | 3 fees, but **6** absent subscribers — who gets paid? | Depends on the rule | Arbitrary: "extra" unless seat swap |
| S6 | Only 12 subscribers signed (cap 14), 12 play | 500 − 15 × scans | Core pay 143/month each = 429 per Sunday | **−71 per Sunday** must come from the fund | Not shown; admin patches with a manual "Covered unfilled place" adjustment |
| S7 | A non-core player scans | Bill −15 | Player still pays the full 36 | +15 sits as unassigned leftover credit | Admin must refund or move it to the fund by hand |

### 8.3 Non-core → core money (decision 3 — option B accepted)

| Option | How it works | Pros | Cons |
|---|---|---|---|
| **A. Direct** (today) | Replacement pays the absent subscriber privately; admin ticks it | No cash through the group; subscriber gets money immediately | App can't see the transfer, yet the admin must confirm it; with several absentees and fewer replacements (S5) who is owed is arbitrary; replacement's scan saving is lost (S7) |
| **B. Via group + invoice credit** (recommended) | Every non-core player pays the **group**; the subscriber whose seat was taken gets a **36 PLN credit on their next invoice**, using the same mechanism as MultiSport credits | One rule for all non-core players ("pay the group 36, or 21 if you scanned"); one payee; no player-to-player confirmation; scan savings stay correct; last-month credits use the existing leftover-credit settlement | Subscriber gets the money a month later; the group holds a little more cash |
| C. Via fund only | Replacements are treated as extras; subscribers get nothing | Simplest | Contradicts rules §8; subscribers have no reason to free their seat |

With **option B**, "who gets the credit" follows one clear rule: the subscriber
**whose seat offer was taken** (the existing seat-swap flow). A non-core player
who joins without a seat swap is an extra and pays the fund. This resolves S5
deterministically and encourages subscribers to offer their seat.

Checking B against S3 (2 of 3 replacements scanned): replacements pay 36 + 21 + 21
= 78 to the group, absent subscribers get 3 × 36 = 108 credit, and the facility
bill drops by 30. The group result is 500 − 350 − 120 + 78 − 108 = **0** ✓, and
nobody's money is in limbo.

### 8.4 MultiSport for everyone, and recording the facility payment

Proposed rule: **a scan always saves the person who scanned 15 PLN.**

- Core player → 15 PLN off the next invoice (as today).
- Non-core player or replacement → fee drops from 36 to **21 PLN** for that match.
  If the scan is approved after they already paid, it becomes a refund.
- Guest without an account → the host reports the scan for them.

Add a **matchday settlement** to each season match: the app shows the expected
bill (`500 + 100 if extended − 15 × approved scans`), and the admin records what
was actually paid to the facility. A mismatch means a scan was missed or
reported wrongly. With this entry, the fund ledger (§5.1) shows real cash
instead of a formula.

### 8.5 Season split: seat cap or active subscribers (decision 5 — split by cap accepted)

Example: only 12 subscribers sign up, 4 Sundays (2,000 PLN per month).

| | Split by cap (14), today | Split by active subscribers (12) |
|---|---|---|
| Each subscriber pays | **143 PLN** | 166.67 → **167 PLN** |
| Collected per month | 1,716 | 2,004 |
| Gap per month | **−284** (−71 per Sunday) | +4 (rounding) |
| Who covers the gap | Fund: needs about 2 non-core players per Sunday (2 × 36 = 72) | Nobody |
| Non-core fees | Mostly fill the gap | All go to the fund (surplus) |
| Predictability | Price fixed when people sign up | Price changes if someone joins or withdraws mid-season |

**Recommendation:** keep **split by cap**. It matches the contract ("4 × 500 ÷ 14"),
gives subscribers a fixed price, and the empty seats are in practice sold
per session to non-core players at 36 PLN (≈ the 35.71 seat cost). Add two safeguards:

1. When there are fewer subscribers than the cap, show the admin the monthly
   gap and whether the fund covers it ("2 empty seats → 284 PLN/month; fund
   currently 610 PLN").
2. Make the split a season setting (`cap` / `active`), so the group can switch
   for a season that clearly won't fill.

### 8.6 Automatic monthly invoices (decision 6)

The existing daily cron (`/api/cron/reminders`, 17:00 UTC) can create **draft**
invoices for next month on a fixed day (e.g. the 25th), using the recurrence and
waived dates the automation already knows. Drafts are invisible to players; the
admin reviews and presses **Publish**, or they auto-publish N days before the due
date. Re-running stays safe because generation already skips existing invoices.

### 8.7 Accepted season rules, in one list

1. Core players pay `Sundays in month × 500 ÷ 14`, rounded up to whole PLN, upfront by the due day.
2. Missing a Sunday does not reduce a core player's bill.
3. Every non-core player (extra, replacement or guest) pays the **group 36 PLN** per session.
4. A subscriber whose **offered seat** is taken gets **36 PLN off the next invoice**.
5. Every approved MultiSport scan saves the scanner **15 PLN**, on the next invoice (core) or on that session's fee (non-core).
6. Extending to 2 hours costs **100 PLN from the fund**, decided per matchday, recorded at that day's price.
7. The admin records what was paid to the facility each matchday; the fund is the running sum of real money in and out.
8. Credit left at season end is refunded or moved to the fund (existing flow).

## 9. Implementation readiness

### 9.1 Working agreement

1. `git pull` on `ai_dev` before starting a phase.
2. One local branch per phase, cut from `ai_dev`: `feature/pay-phase<n>` (e.g. `feature/pay-phase0`).
3. **Work one complete phase at a time**, not item by item: implement every item of the
   phase, run the gates (§9.3) and test on localhost against the Preview database.
4. **Commit locally as the work goes.** A phase can have many commits, as long as each
   commit covers **one topic** (normally one item ID, with its tests and requirement
   updates) so the organiser can review it and `git revert` it on its own. Commit
   subjects start with the item ID (e.g. `P0.1: Hide the pot on season matches`).
5. Open questions during a phase are answered by following this plan (§5–§8); the
   choice made is noted in the commit message and the phase summary instead of
   stopping the work.
6. The organiser reviews **phase by phase**. Review fixes are new topic commits on the
   same branch.
7. **Claude never pushes.** The organiser fast-forwards local `ai_dev` and pushes it
   manually; production goes out by the organiser's PR from `ai_dev` to `main`.

### 9.2 Prerequisites

| Check | State |
|---|---|
| Baseline gates (`test:unit`, `lint`, `build`) green on `ai_dev` @ `f68714d` | ✅ verified 2026-11-17 |
| `.env.local` → Preview database; `scripts/db-guard.mjs` approves the host | ✅ |
| Local server (`npm run build && npm run start`, `AUTH_TRUST_HOST=true`) | ✅ |
| Next migration number | `0039` (`0038` written in Phase 2, **not applied yet**; last applied: `0037`) |
| Decisions 1–6 | ✅ all made (§7) |

### 9.3 Gates and tests for every item

- `npm run test:unit`, `npm run lint`, `npm run build` must pass.
- New unit tests go in `tests/*.test.ts` **and must be added to the explicit file list
  in the `test:unit` script** in `package.json`, or they will not run.
- SQL and migration logic is tested in an isolated in-memory PGlite database,
  following `tests/match-automation-sql.test.ts`, so tests never touch Neon.
- Money is integer grosz; reuse `src/lib/format-money.ts` helpers.
- Keep server-only modules (`src/lib/db.ts` importers) out of `"use client"` components.

### 9.4 Migration rules (shared Preview database)

- Every migration is **additive and backward compatible**: the deployed `ai_dev`/`dev`
  Previews and production keep running the old code against the new schema.
- Apply to Preview only after explicit approval, through the guard:
  `node --env-file=.env.local scripts/db-guard.mjs && node --env-file=.env.local scripts/apply-migration.mjs drizzle/0038_<name>.sql`.
- Apply to production **before** merging the code that needs it into `main`.
- No retroactive financial changes: issued invoices, paid charges and existing
  `replacement` charges (owed directly) keep today's behaviour; new rules apply
  from a cutover date stored with the season.

### 9.5 Requirements to update alongside the code

| Requirement | Change | Item |
|---|---|---|
| FR-PAY-1 / FR-PAY-3 | Share snapshotted at "Finalize cost"; trusted "I've paid"; pot hidden on season matches | P0.1, P2.5 |
| FR-SE-8 | MultiSport credit also reduces non-core session fees | P2.2 |
| FR-SE-9 | Replacements pay the group; offered-seat subscriber credited on next invoice | P2.1 |
| FR-SE-11 | Fund includes facility payments and snapshotted extension costs | P2.3, P2.4, P3.3 |
| New | Matchday settlement; seat-cap gap warning; draft invoices; My payments; Payments inbox | P2.3, P0.7, P4.1, P1.2, P1.3 |

### 9.6 Design points settled for Phase 2

1. **`season_credits` and the allocator.** MultiSport scans stay in
   `multisport_scans`; `season_credits` holds only replacement credits (one per
   paid replacement charge). Every allocator path (`generateInvoices`,
   `REALLOCATE_CREDIT_SQL` for recalculate / show / unpaid, hide, delete) applies
   scans first, then season credits of the same season into what is left, oldest
   first. Deployed code never reads `season_credits`, so nothing is spent twice.
2. **Refund path.** A scan approved after a non-core fee was paid in full puts
   the credit on the charge (`scan_credit_minor`) and shows the admin a
   "refund X" row with a **Refunded** button (`scan_refunded_at`).
3. **Cutover.** `seasons.new_rules_from` (Admin ▸ Billing ▸ Rates & pricing),
   empty by default. Matches on or after it use the new replacement and scan
   rules; earlier matches, issued invoices and existing charges are unchanged.
   **Set it only after production runs the Phase 2 code**: older code that
   recalculates a bill would drop replacement credit from its total. The same
   applies to switching a season's split to `active` (P2.6).

### 9.7 Recommended order

P0.1 → P0.2 → P0.4 → P0.6 → P0.3 → P0.5 → P0.7 → Phase 1 → Phase 2 → Phase 3 → Phase 4.
**Start with P0.1**: it removes the double-billing risk and needs no migration.

### 9.8 Cleanup backlog (collected during implementation)

Small leftovers noticed while building a phase. They are done in P4.3 unless a
later item touches the same code first. Tick them off here when removed.

| Found in | Item |
|---|---|
| P0.4 | `getSubscriptionSeasonForDate` (`src/lib/season-subscriptions.ts`) has no callers left; remove it |
| P0.1 | Unused `fmtDate` import in `src/lib/payments.ts` (lint warning, older than P0.1) |
| P0.3 | `sideline_generate_match` does not copy pot payment details; fine while automated matches are season-only, revisit if automation creates normal matches |
| P0.5 | The admin Home unpaid-charges count in `getHomeAdminCounts` has no PGlite test; move its SQL to a `*-sql.ts` module and test it |
| P1.1 | `listDues` reads season invoices regardless of `seasons.visible_to_players`; the old Home invoice to-do checked it. Fine while drafts use `hidden_at` (P4.1); add the check if a hidden season can have visible invoices |
| P1.2 | The "Your session charges" box on Match ▸ Payments (P0.2) and `listPlayerCharges` overlap with My payments; fold them into a `dues` filter when P3.2 switches reads |
| P1.2 | Session and replacement charges can't be declared by the player yet (no `declared` state on `guest_charges`); comes with the `dues` table in P3 |
| P1.3 | ~~The admin mobile tab bar has no Payments inbox tab~~ — done: Payments is in the main navigation and opens the inbox in admin view |
| P1.3 | "Confirm all" marks dues paid one query per due; batch it once writes go through `dues` (P3.2) |
| Status | Phase 0 accepted by the organiser on 2026-11-19 (tested locally) |
| P2.1 | `generateInvoices`' credit CTE is still inline in `season-billing.ts` (the reallocation SQL moved to `season-billing-sql.ts` and is tested); move it too and test it in PGlite |
| P2.2 | Scans for guests without an account (reported by the host, §8.4) are not supported; `multisport_scans` has no `guest_id` |
| P2.2 | A scan refund (`refundDueMinor`) is not a due in the inbox / My payments yet; it shows on the charge rows only. Add it with the `dues` table (P3) |
| P2.3 | The matchday settlement is per match; a facility invoice covering several Sundays has to be split by hand |
| P2.5 | The player view of a finalized share doesn't say it's finalized |
| Status | Phase 1 accepted by the organiser on 2026-11-19 (tested locally); Payments tab moved into the main navigation |
| Status | Phase 2 implemented 2026-11-19, waiting for review; migration `0038` not applied to Preview or production |

## Appendix — files involved

| Area | Files |
|---|---|
| Schema | [`drizzle/schema.ts`](../drizzle/schema.ts); migrations `0005`, `0017`–`0021`, `0032`, `0035`, `0036`, `0037` |
| Match pot | [`src/lib/payments.ts`](../src/lib/payments.ts), [`src/lib/guests.ts`](../src/lib/guests.ts), [`src/app/matches/[id]/payments/`](../src/app/matches/[id]/payments/) |
| Season billing | [`src/lib/season-billing.ts`](../src/lib/season-billing.ts), [`src/lib/season-calculations.ts`](../src/lib/season-calculations.ts), [`src/lib/format-money.ts`](../src/lib/format-money.ts), [`src/app/season/`](../src/app/season/) |
| MultiSport | [`src/lib/multisport.ts`](../src/lib/multisport.ts), [`src/app/season/billing-panels.tsx`](../src/app/season/billing-panels.tsx) |
| Charges + fund | [`src/lib/season-fund.ts`](../src/lib/season-fund.ts), [`src/lib/seat-offers.ts`](../src/lib/seat-offers.ts), [`fund-admin.tsx`](../src/app/admin/accounts/fund-admin.tsx) |
| Admin | [`src/app/admin/accounts/`](../src/app/admin/accounts/) (`billing-*`, `subscription-*`, `fund-admin.tsx`) |
| Reminders | [`src/app/api/cron/reminders/route.ts`](../src/app/api/cron/reminders/route.ts), [`src/lib/season-reminders.ts`](../src/lib/season-reminders.ts), [`src/app/actions/push.ts`](../src/app/actions/push.ts) |
| Requirements | [`docs/REQUIREMENTS.md`](REQUIREMENTS.md) §4.8–4.9, §7.3 |
