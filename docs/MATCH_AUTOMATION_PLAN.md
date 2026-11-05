# Winter match automation implementation plan

Status: implemented; migration 0037 applied to Preview and production on
2026-11-05. Automation remains disabled until an admin enables it. Revised after a
user-approved, read-only inspection of Preview on 5 November 2026.

Implemented: existing-season Automation tab and location picker, recurring
creation/linking, durable close-triggered retries, timestamp-based public opening,
core pre-opening responses, relational match queues/capacity guards, seat-swap
lock, optional-extension confirmation/duration, skip/cost decisions, billing-day
reuse, paid-invoice protection, notification retries and activity UI.

Validation includes isolated in-memory PostgreSQL execution of the reviewed
migration; no Preview or production migration/fixture writes are implied.
The club time zone remains Europe/Warsaw, consistent with existing billing and
kickoff helpers. Existing match kickoff edits recalculate opening snapshots;
the explicit template-apply button changes pitch/capacity/duration, not kickoff.

## 1. Confirmed requirements

The follow-up confirmation supersedes the original 11 November start date.
The later season review also supersedes the fixed two-hour/600 PLN assumption:
the booking is 90 minutes for a guaranteed 500 PLN, with an optional extra
30 minutes for 100 PLN when 18 participants are confirmed. An admin confirms
the extension; reaching capacity does not automatically purchase it.

| Setting | Initial value |
|---|---|
| Season window | Reuse the existing season: 8 November 2026 through 30 March 2027 |
| Scheduled matches | Every Sunday, 8 November 2026 through 28 March 2027 |
| Time zone | Europe/Warsaw |
| Kickoff and duration | 21:00, 90 minutes; ends at 22:30, or 23:00 after extension |
| Location | Fame Sport Club, Krakow |
| Venue | Indoor |
| Guaranteed pitch cost | Existing 500 PLN day rate, stored as 50,000 grosz |
| Optional extension | Existing 100 PLN extension rate, stored as 10,000 grosz, for 30 minutes |
| Extension decision | Admin confirms at 18 participants; no extension below 18 |
| Total capacity | 18 participants, including guests that consume seats |
| Core membership | Existing active season subscribers; expected core size 14 |
| Public signup and waitlist opening | Friday before kickoff at 15:00 Warsaw time |
| Creation trigger | Closing matchday, not closing voting/stat submissions |
| First occurrence | Created or explicitly linked when an admin enables automation |
| Change deadline | Exactly 24 elapsed hours before kickoff |
| Seat swaps | Also subject to the 24-hour deadline |
| Configuration access | Admins and super-admins |
| Exclusions | None initially; admins can add exceptions |

There are **21 Sundays**, with a guaranteed base cost of **10,500 PLN**.
If all 21 sessions are extended, the additional cost is **2,100 PLN**, for a
combined **12,600 PLN**. The 500 PLN remains owed even if nobody attends.
Monthly occurrence counts are November 4, December 4, January 5, February 4,
and March 4. These are pitch expenditures, not newly defined individual fees.
Retaining the saved 30 March end date gives the same Sundays as 31 March and
avoids an unnecessary contract/leaderboard date edit.

Core subscribers start each newly generated match IN. They can mark OUT before
public signup opens. Released seats become claimable only when public signup
opens, so more than four public places can become available.

## 2. Existing functionality to extend

- [Match creation and lifecycle](../src/lib/match-admin.ts) already insert
  active subscribers as IN, support a capacity and a manual availability switch,
  and distinguish matchday closure from submission closure.
- [Availability actions](../src/app/matches/[id]/availability/actions.ts) already
  enforce the ordinary 24-hour lock, support admin overrides and waitlist promotion,
  and count guests against capacity.
- [Season subscriptions](../src/lib/season-subscriptions.ts) already define the
  core group. Do not introduce a second membership list.
- [Seat-swap rules](../src/lib/seat-offer-rules.ts) currently allow swaps until
  kickoff. This must deliberately change, together with server-side SQL guards.
- [Season billing](../src/lib/season-billing.ts) currently counts Sundays in the
  season window, uses the configured day rate and subscriber cap, and preserves
  existing invoices on regeneration.
- [Session charges and fund](../src/lib/season-fund.ts) distinguish extra players
  from replacements for absent subscribers. Preserve that distinction.
- [Cron configuration](../vercel.json) and the
  [reminder endpoint](../src/app/api/cron/reminders/route.ts) currently run daily.
  A daily job cannot guarantee a notification at an arbitrary Friday opening time.

The referenced design-system document is absent from this workspace. Follow the
existing season, availability and shared component styles instead of inventing
a separate visual system.

### Saved Preview setup

Inspected only configuration, counts and readiness booleans in read-only
transactions. No names, bank details, terms text, credentials or production
records were retrieved. No database values were changed.

| Existing setting | Verified Preview value | Implementation treatment |
|---|---|---|
| Selected active subscription season | Season ID 2 | Extend this record, do not create another winter season |
| Dates | 2026-11-08 to 2027-03-30 | Reuse |
| Subscription / core signup / player visibility | All enabled | Preserve; core signup is not Friday match signup |
| Subscriber cap / active eligible subscribers | 14 / 14 | Reuse the existing commitments |
| Base / extension rate | 500 / 100 PLN | Preserve existing allocation and optional extension |
| Extension threshold | 4 extra participants | Retain funding threshold; additionally require 18 total for this template |
| Non-core session rate | 36 PLN | Preserve extra/replacement charging |
| MultiSport credit / invoice due day | 15 PLN / day 3 | Preserve |
| Terms version / terms present | v1 / yes | No replacement terms or forced re-enrolment |
| Transfer details present | Yes | Reuse without displaying them in this plan |
| Rates / terms / test invoice / reminder confirmations | All false | Show existing checklist; never auto-confirm |
| Linked season matches / invoices | None | First enable can create the first occurrence; no historical financial rewrite needed in Preview |
| 24-hour lock / auto-promotion / waitlist visibility | Enabled | Reuse existing feature settings |

This snapshot describes Preview, not production. In particular, a visible season
with unset checklist confirmations must not be presented as verified ready.
Automation can be drafted without releasing anything; enabling requires an
active subscription season and the existing publication/readiness checks.
Do not hide the existing season or alter memberships to resolve missing checks.

### Reuse map and boundaries

| Concern | Existing implementation to extend | What is actually new |
|---|---|---|
| Season identity, dates, archive state | [seasons](../src/lib/seasons.ts), [season admin](../src/app/admin/accounts/seasons-admin.tsx) | Automation reads the same season ID and date range |
| Core cap, members, terms, visibility | [subscription domain](../src/lib/season-subscriptions.ts), [subscription admin](../src/app/admin/accounts/subscription-admin.tsx) | Automation summary and attendance policy, not another member editor |
| Core IN and re-sync | `applySubscribersToMatch`, `applySubscriberToUpcomingMatches`, existing creation SQL | Shared atomic, capacity-safe seeding that keeps explicit OUT |
| Season reserve list | Existing subscription reserve-list helpers and UI | No migration or Friday gate; this queue is for whole-season commitments |
| Match waitlist | [availability](../src/lib/availability.ts) and existing actions/UI | Race-safe match queue storage behind existing helper APIs |
| Base rates, extension rates, invoices | [billing domain](../src/lib/season-billing.ts), [billing admin](../src/app/admin/accounts/billing-admin.tsx) | Recurrence-aware billable-day calculation and exception preview |
| Optional extension and group fund | `matches.extended`, `setMatchExtended`, [season fund](../src/lib/season-fund.ts) | Duration rendering and eligibility checks around existing confirmation |
| Player season tabs | [season page](../src/app/season/page.tsx) and mobile navigation | Small next-match/booking summary; admin-only automation tab |
| Notifications and daily recovery | Existing push preferences and reminders endpoint | Opening event and durable successor retry |

Keep the season reserve list and the per-match waitlist separate. Joining one
does not enroll someone in the other, and Friday opening gates only match signup.
Withdrawing from the season continues to leave existing match responses unchanged,
as the current admin action explains; offer an explicit per-match adjustment,
not an automatic attendance purge or invoice cancellation.

Keep the two existing season meanings distinct: standings currently select matches
by date range, while subscription benefits and billing use explicit
`matches.season_id`. Automation must use explicit membership and not redefine
leaderboard scope as part of this feature.

Authorization also differs by surface:

- Season creation, date edits, core/terms/visibility management and go-live
  confirmations currently require super-admin.
- Billing mutation actions accept admins and super-admins, but their current
  Admin control page is super-admin-only.
- New automation controls belong on an admin-accessible Season tab. Reuse/extract
  existing billing components and actions if exposing those controls there,
  rather than relaxing access to the whole Admin control page.
- Ordinary admins can edit recurrence, capacity, opening and match defaults.
  Display protected season dates/core cap/terms read-only with contextual guidance;
  changing them uses their existing super-admin-authorized actions.

## 3. User-visible flow

### Admin setup

Add an **Automation** tab to the existing Season area, visible in admin view.
Add a link from existing Admin control subscription settings to the same tab;
do not build a second setup area. Reuse the page's tab-specific data loading,
SubNav, SectionRail, mobile navigation, Button and FeedbackMessage components.
Use a short guided setup with a review step:

1. **Existing season:** show its dates, members, rates and readiness; retain
   existing values and route protected edits to the current controls.
2. **Schedule and pitch:** weekday, kickoff, base/extension duration, time zone,
   venue/location and existing base-plus-extension prices.
3. **Places:** total capacity, existing core cap/count, public opening weekday/time.
4. **Review and enable:** next match, opening instant, lock instant, contract
   calendar, estimated total cost, and any validation warnings.

Use human-readable time controls, clear labels and sensible defaults. Display
"14 core + 4 public = 18 total", recalculating when settings change. Warn if fewer
than 14 core subscribers exist; never manufacture memberships to fill the gap.
Block activation if the eligible core exceeds capacity or required settings are
invalid. Do not add another editable subscriber cap or rate source to automation.
Team count and scoring options should use the existing match settings,
be editable in the template, and not be guessed from capacity.

Enabling automation must detect an existing matching season occurrence and ask
the admin to link it or resolve the conflict, rather than silently duplicating it.
If no occurrence exists, create the first future scheduled one.

### Weekly player experience

Immediately after matchday closure:

- The next scheduled match appears with date, indoor venue, 21:00-22:30,
  core attendance and public opening time.
- Show "Optional 30-minute extension, admin confirmation required"; display
  23:00 as the end only after confirmation.
- Core subscribers see **"You're IN - season place"** and can mark OUT before
  the lock. Before Friday, returning IN is allowed while capacity remains.
- Non-core players see **"Signup opens Friday at 15:00"**, a countdown and
  disabled joining/waitlist controls. No premature guest or seat-request bypass.

At Friday 15:00:

- Players can claim available places first come, first served.
- Once capacity is reached, the same primary action becomes **Join waitlist**.
- Show actual remaining places, queue position and promotion feedback.
- An absent core member can return through the ordinary capacity/waitlist rules
  after opening; never displace another player or silently restore their seat.

At the 24-hour deadline:

- Disable player-driven attendance changes, waitlist changes and seat transfers.
- Keep lineup and queue readable. Explain the deadline and link users to the
  existing admin-contact experience.
- Preserve explicit admin overrides with audit entries.

Use one shared state model on Home, match lists, match overview, availability,
guest controls and seat-swap cards. Refresh the server-rendered state at countdown
boundaries and after mutations; do not require users to reload manually.

### Ongoing admin controls

Show **Enabled / Paused / Needs attention / Season finished**, the next occurrence,
and a concise recent activity list.

Provide: pause/resume, preview next match, retry failed creation, open now,
close manually, restore scheduled opening, edit this occurrence, skip/cancel,
and edit future template settings.

Reuse the existing extension confirmation: make it eligible at 18 participants,
never automatically set `extended` during creation or on a transient signup count.
At confirmation, re-check capacity/attendance on the server and record the admin's
decision. Show its 100 PLN fund impact and update match/calendar duration.
If attendance later drops, show an admin warning; do not automatically reverse
a confirmed booking or erase its cost.

Default template edits to not-yet-created occurrences. Updating an already
generated match requires an explicit, reviewed "apply to this match" action.
Changing its schedule must preview affected opening and lock deadlines.
Never rewrite historic matches, attendance responses or issued invoices.

Skipped/cancelled dates require an explicit **keep pitch cost / waive pitch cost**
decision. An occurrence override should not accidentally rewrite the contract.
Manual closure must remain closed until the admin restores scheduled behavior.

## 4. Scheduling and lifecycle rules

Implement a client-safe, database-free recurrence helper and a server-only
automation domain module.

- Calculate dates as local calendar dates in the configured IANA time zone,
  then persist kickoff/opening instants as timestamptz. Never add seven UTC
  24-hour periods to derive the next Sunday.
- Calculate public opening from the local Friday preceding the occurrence.
  Validate that opening precedes the 24-hour lock.
- Store base and extension duration explicitly. Derive the effective match end
  from the existing `extended` flag; calendar downloads must reflect confirmation.
- Reuse the kickoff conversion and lock helpers; retain exact elapsed-hour
  semantics across daylight-saving changes.
- Only a linked automation occurrence closing matchday triggers its successor.
  Ordinary matches, submission closure and unrelated seasons do not trigger it.
- Generate at most one next future occurrence, after the predecessor's scheduled
  date and within the contract. Report past missed dates; do not backfill matches.
- If creation happens after opening but before lock, public signup is immediately
  available. If it happens after lock, show an admin-attention state without
  permitting late player signup.
- Closing, reopening and closing the same match cannot create two successors.
- Pause stops future creation and scheduled public opening; admins can explicitly
  override individual occurrences. It does not erase existing attendance.
- Cancel/skip advances to the next valid occurrence through an explicit admin
  action; retain an occurrence record so retries cannot recreate the cancelled date.
- The final scheduled match closes without creating an April match.

Normal matches retain current behavior. The confirmed seat-swap deadline change
applies to season seat swaps wherever that existing feature is exposed, with
updated copy and tests rather than an undocumented exception.

## 5. Persistence and consistency

Add a reviewed SQL migration and update [the Drizzle schema](../drizzle/schema.ts).
Prefer typed relational storage for recurrence and durable occurrence identity,
not serialized application settings.

Proposed additions:

- One automation configuration per season: enabled/paused state, recurrence,
  time zone, venue/location, base/extension duration, total capacity, opening rules
  and match defaults. Reference existing season dates, subscriber cap, base rate,
  extension rate and funding threshold; do not copy them into editable settings.
- Occurrence records with unique `(automation_id, local_date)`, status,
  optional linked match, predecessor, configuration revision, opening/kickoff
  snapshots, and keep-cost/waive-cost exceptions.
- Match snapshots for durations and effective scheduled opening, with an explicit
  manual availability override. Reuse `matches.extended` rather than add another
  extension flag. Base-cost snapshots belong to the occurrence ledger.
- Durable work/notification records keyed by occurrence and event, with retry
  status and useful error details.
- Audit entries for configuration edits, overrides, cancellations and retries.

Create/link the occurrence, create the match and seed eligible subscribers
atomically using the existing Neon batch-transaction capability or guarded SQL.
Closing matchday must durably record successor work in the same transaction as
the state transition. Process immediately for the normal UX; retry through the
maintenance job if interrupted. Do not attach creation solely after best-effort
close notifications or guest cleanup, where failures could lose the trigger.

Reuse the current subscriber-application helpers, which already intend to fill
only unanswered responses. Extract the shared invariant into guarded SQL instead
of maintaining a second automation-only seeder: first creation seeds core IN;
later explicit re-sync/new subscriptions can fill eligible blank responses only.
Retries, synchronization, settings changes and reopening must not overwrite OUT,
exceed capacity, or add participation after lock without an explicit admin override.
Filter inactive/deleted players and retain numbered subscription-seat constraints.
The current select-then-upsert helpers need atomic absence checks when integrated
with concurrent match signup; do not merely call them after creation and assume safety.

The existing match waitlist uses read-modify-write CSV values in application settings.
Concurrent Friday signup needs database-enforced capacity and queue ordering:
migrate only match-queue data to uniquely keyed relational entries with stable join
order while retaining existing helper names/UI. Leave the season reserve queue
and targeted commitment offers intact.
Serialize capacity-changing operations on the match row in bounded transactions
or equivalent guarded SQL. Apply the same mechanism to player signup, guest
approval/addition, promotion, seat swaps and admin capacity edits.

Prevent oversubscription, lost queue joins, duplicate membership and double
promotion. At/after lock, no system promotion should unexpectedly change a
player's participation; admin intervention remains explicit.

## 6. Exact opening, notifications and recovery

Public opening must be determined by **server time versus stored opening time**
on reads and every mutation, combined with manual override and pause state.
Do not rely on cron having flipped `availability_open`, a client clock, or a
background process running at exactly 15:00.

Use one effective availability policy for self-service, guests, waitlists,
seat requests/transfers, promotion and notification eligibility. Core self-service
before opening is a specific authorized exception, not a globally open match.

Separate **match announced** from **signup open** messages: creation must not tell
non-core players to join while signup is gated. Preserve notification preferences.
Persist event identity, retry failures and show admin diagnostics without treating
push delivery as a requirement for successful match creation.

Keep the existing authenticated cron for recovery and maintenance. If precise
opening pushes are desired, deploy a supported authenticated frequent scheduler
with a documented delivery target, such as within five minutes. Verify hosting
plan limits before changing cron frequency. With the existing daily scheduler,
signup still opens on time, but opening push delivery is delayed and must be
labelled as such; never promise precise pushes that the infrastructure cannot send.

After an uncertain push-provider response, a retry may still produce a duplicate
delivery; use stable tags and avoid claiming exactly-once external delivery.

## 7. Billing integration

Keep the saved 500 PLN base rate and 100 PLN optional extension rate. Reuse
`getSeasonRates`, `updateSeasonRates` and the current billing forms/actions;
do not raise `day_rate_minor` to 600 PLN or deduct the extension twice.
The guaranteed 90-minute booking is billed even if attendance is zero.
Do not divide cost by 18 or change the existing 36 PLN session charge or
15 PLN MultiSport credit.

Extend `playingDaysInPeriod` behind its existing API, or extract shared calendar
enumeration beneath it, so enabled automation supplies the configured weekday
and keep/waive exceptions. Non-automated seasons retain current Sunday counting.
Reuse `generateInvoices` and its invoice snapshots/idempotency; do not build
a new invoice engine. Count future contract dates even without match records,
so billing is independent of how promptly the previous match was closed.

Preserve base-cost splitting over the configured 14 core places and existing
rounding/credit handling. Extensions continue to debit the group fund through
`matches.extended` and existing fund derivation, not core monthly invoices.
The existing four-extra-player funding threshold remains relevant, but this
automation additionally requires 18 total participants for extension eligibility.

Preserve the current subscriber-cap split and replacement-versus-fund allocation.
An absent core subscriber remains subject to the existing season commitment;
ordinary OUT does not waive the pitch cost. Continue existing replacement charge
assignment controls when an open-place signup covers an absent subscriber.

Keep-cost exceptions remain billable; waive-cost exceptions are excluded.
Generation must continue to leave existing invoices unchanged. Reuse the existing
explicit billed-days correction flow for unpaid invoices, with preview and audit,
and preserve its MultiSport reallocation. The current `setInvoicePlayingDays`
can change gross amounts on paid rows; add a server-side paid-invoice guard before
wiring automation exceptions into it. Paid invoices require a separate reviewed
adjustment, never automatic rewriting. A fund adjustment is not a subscriber
refund; do not treat the existing fund ledger as a substitute invoice credit.

All admins can configure automation. Preserve current per-action authorization
for rates/invoice operations versus season/core/terms/publication changes, and
reuse the existing go-live checklist rather than introducing another one.

## 8. Implementation sequence

1. **Existing setup and domain extension:** target the existing season ID; show
   missing readiness checks; reuse subscriptions, rates, billed-day helpers and
   fund allocation. Add only recurrence/opening/occurrence fields and match-queue
   consistency mechanisms; no replacement season or invoice/member system.
2. **Atomic match lifecycle:** first enable/link flow, close-triggered successor,
   subscriber seeding, retries, pause/resume and exception handling.
3. **Availability integration:** enforce opening and lock on every relevant action,
   race-safe capacity/promotion, core absence/return and seat-swap deadline.
4. **Admin and player UI:** guided setup, preview calendar, status/activity,
   occurrence overrides, consistent countdowns and accessible action states.
5. **Billing and messaging:** extend existing contract-day counting and explicit
   cancellation corrections, preserve optional extension/fund behavior, add
   duration-aware calendar export, opening notifications and scheduler diagnostics.
6. **Preview validation and rollout:** approve isolated database, review/apply
   migration only when explicitly requested, enable in Preview, then opt in the
   production season after acceptance. Default automation off for existing seasons.

Before implementation, read the relevant installed Next.js guides for Server
Actions, caching/revalidation and route handlers. Keep pages compositional,
mutations in colocated actions, server logic in `src/lib`, and client-safe
recurrence/policy types separate from database imports.

Update [requirements](./REQUIREMENTS.md), [architecture](./ARCHITECTURE.md) and
[README](../README.md) for the workflow, intentional lock change, scheduler
limitations, recovery procedure and deployment/migration steps.

## 9. Acceptance and test matrix

### Database-free tests

- Exactly 21 occurrences; first 8 November, last 28 March; guaranteed 10,500 PLN,
  optional maximum 2,100 PLN extra, combined maximum 12,600 PLN.
- 90-minute end at 22:30; only confirmed extensions end at 23:00. Zero attendance
  still owes 500 PLN; under 18 cannot confirm extension; 18 requires admin action.
- Monthly counts 4/4/5/4/4; exclusions and cost exceptions affect the right periods.
- Correct Friday opening for each occurrence; no date outside the season.
- Winter kickoff 21:00 Warsaw = 20:00 UTC; 28 March kickoff = 19:00 UTC.
- On 28 March, Friday opening is 26 March 15:00 CET = 14:00 UTC.
  Its lock is Saturday 27 March 20:00 CET = 19:00 UTC, exactly 24 elapsed
  hours before Sunday kickoff. Do not incorrectly force Saturday 21:00.
- Boundary checks at opening/lock minus 1 ms, exactly the instant, and plus 1 ms.
- Pause/manual overrides, late-close states, valid settings and malformed input.
- Seat-swap policy agrees with ordinary lock behavior and updated messages.

### Approved non-production integration tests

- Enable creates/links one occurrence with existing eligible core IN.
- Duplicate concurrent enables/closes/retries create exactly one successor.
- Failure after closure commit recovers without reseeding or losing explicit OUT.
- 14 core and 4 public IN fill capacity; the next player joins the waitlist.
- One core OUT before Friday yields five public places at opening.
- Parallel claims for the final seat create one IN and queue the others stably.
- Guest approvals, promotions and swaps cannot bypass opening, lock or capacity.
- Waitlist removal/rejoin keeps intended ordering; promotion happens once.
- Deleted/inactive core and subscription updates cannot silently refill attendance.
- Existing season reserve offers/terms acceptance work independently of Friday;
  match OUT does not withdraw a season commitment.
- Existing helpers, subscriber seat constraints, 36 PLN extra/replacement charging,
  15 PLN credits, due day 3 and fund extension debit retain their behavior.
- Saving automation does not alter season ID, dates, core membership, terms
  version, visibility or existing billing settings.
- Missing Preview checklist confirmations are surfaced without automatic release.
- Submission closure, normal matches and historical retries create no successor.
- Cancel/skip is durable; keep/waive cost works before and after invoice issuance.
- Final closure creates nothing beyond March; issued invoices remain unchanged.
- Configuration authorization, audit records, invalid input and explicit errors.

### UI and regression validation

- Mobile and desktop admin setup, preview, save errors, pause/retry and overrides.
- Core/non-core/guest flows before opening, while open, full, waitlisted and locked.
- Countdown boundary refresh, stale tabs, server/client clock disagreement.
- Ordinary admin can open/configure Automation without access to the
  super-admin-only accounts page; protected core/terms edits remain protected.
- Keyboard operation, focus/error announcements, readable contrast, touch targets,
  and no duplicate responsive forms or controls.
- Home, match list, overview, share/calendar and season screens stay consistent;
  shared views must not expose private financial/member details.
- Run `npm run test:unit`, `npm run lint` and `npm run build`.
- Run database-backed tests only against an explicitly approved non-production
  database, following [README safeguards](../README.md). Never apply migrations
  or create production fixtures as part of planning.

Definition of done: verified recurring creation, exact server-side signup opening,
race-safe capacity/waitlists, the confirmed lock behavior, working admin controls,
correct contract billing, visible recovery errors and updated documentation.
