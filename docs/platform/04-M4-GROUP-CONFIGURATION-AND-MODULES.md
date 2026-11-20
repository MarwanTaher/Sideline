# M4 — Group Configuration, Modules, and Presets

| | |
|---|---|
| Status | Proposal |
| Depends on | [M2 Group-scoped app](./02-M2-GROUP-SCOPED-APP.md). Can run in parallel with M3. |
| Unlocks | [M5](./05-M5-PLATFORM-OPERATIONS-AND-ONBOARDING.md); groups that differ from the founding group |
| User-visible change | Organisers get a Group settings area; members only see the features their group enabled |
| Overview | [00-OVERVIEW.md](./00-OVERVIEW.md) |

## 1. Goal

This milestone turns the current group's built-in rules into **settings** and its feature areas
into **modules**. Group #1's current behaviour is captured as the **`sideline-classic` preset**.
After M4, a group's "app" is its preset plus its overrides and branding. The two groups run the
same code with no forks.

## 2. Inventory: what is group-specific today

| Item | Where it lives now | Target |
|---|---|---|
| Time zone `Europe/Warsaw` | `kickoff-sql.ts` (`CLUB_TIME_ZONE`), `match-schedule.ts`, `match-admin.ts`, `match-automation.ts`, `season-billing.ts` (`DUE_AT`), `dues-summary.ts`, UI in `matches/page.tsx`, `season/automation-panel.tsx`; SQL in `0016`, `0023`, `0028`, `0037`, `0039` | `groups.timezone`. TS reads it from `ctx.group.timezone`. SQL functions read it from `groups` by joining on the row's `group_id`. |
| Default currency PLN, minor units "grosz" | `currency.ts` `DEFAULT_CURRENCY`, `format-money.ts`, `*_minor` columns | `groups.currency`. Per-match currency (`0032`) stays. Minor-unit maths stays (2 decimals; reject currencies with 0/3 decimals until needed). |
| Payment instructions: Polish account + QR | `payment-qr.ts`, `seasons.payment_account` | **Payment-method module**: "Polish bank transfer (QR)" is the first method; "Manual instructions (free text)" is the default for others. |
| MultiSport credits | `multisport*.ts`, `multisport_scans`, `seasons.multisport_credit_minor` | **Benefit-card credits** module, off by default. "MultiSport" becomes the configured card name. |
| Season seat cap 14, day/guest/extension rates, due day | Already per-season columns ✓ | Defaults for new seasons come from group settings / preset |
| Weekly schedule (Sunday), opening times, capacity | `season_match_automation` ✓ | Already data; defaults from preset |
| 24 h lock, waitlist auto-promote/visibility, vote gate, trusted auto-approve | `app_settings` keys in `feature-settings.ts` ✓ | Registry entries (scope: group) |
| Scoring weights, model | `scoring_*` app settings ✓ | Registry entries under the Ratings module; changes bump revision (already wired) |
| Moments copy, sounds, fun messages, tap-spam | `moment-copy-settings.ts`, `moment-sound-settings.ts`, `tap-spam-settings.ts` | Fun & moments module |
| Number of teams 2–5 (`0011` CHECK) | Schema CHECK | Keep as a platform limit; group default via setting |
| Football positions GK/DEF/MID/FWD | `players` CHECK, `positions.ts` | **M6** (sport profiles) |
| Branding: "Sideline", emerald brand colour | `layout.tsx` metadata, ~90 files use `emerald` utilities | Platform brand stays "Sideline". Group name + crest + accent colour via CSS variable `--group-accent`. Replace `emerald-*` used *as brand* with token classes, incrementally. |
| Copy that names Warsaw, PLN, WhatsApp | Various UI strings | Use group values; "share to WhatsApp" becomes generic "Share" with WhatsApp as one target |

## 3. Settings architecture

### 3.1 Storage: keep `app_settings`, make it typed

M1 already made `app_settings` per group `(group_id, key, value)`, and the score-revision
trigger already watches it. Keep that table rather than adding a JSONB blob. It needs fewer
migrations, the revision wiring stays as it is, and every key is independently auditable.

### 3.2 Registry (single source of truth)

```ts
// src/lib/group-config/registry.ts (client-safe: no db imports)
export const SETTINGS = {
  "availability.lockHours": {
    module: "core.availability", scope: "group",
    schema: z.number().int().min(0).max(168), default: 24,
    label: "Lock changes before kickoff (hours)", editableBy: "admin",
  },
  "billing.dueDay": {
    module: "season.billing", scope: "season-default",
    schema: z.number().int().min(1).max(28), default: 3, editableBy: "owner",
  },
  "ratings.weights": {
    module: "ratings", scope: "group", affectsScores: true, …
  },
  …
} as const satisfies Record<string, SettingDef>;
```

- `getGroupConfig(ctx)` (server-only) loads all keys for the group in one query, validates
  them with each Zod schema, and falls back to the preset and then the default.
  Invalid stored values are logged to `app_errors` and fall back to the default, which avoids
  crashing the group.
- Existing `feature-settings.ts` getters become thin wrappers that delegate to it, so call sites
  change gradually.
- Writes go through one `setGroupSetting(ctx, key, value)` action. It validates the value,
  checks `editableBy`, writes an audit row (`group_settings_audit`), and revalidates.

### 3.3 Precedence and snapshots

```
platform default  →  preset  →  group override  →  season value  →  record snapshot
```

The rule already used by invoices and settlements becomes a platform rule: **historical records
store the values they were computed with**. A settings change never rewrites past invoices,
dues, or closed matchdays. The settings UI says this next to every money setting.

## 4. Modules

### 4.1 Catalogue

| Module | Contains (today's code) | Default in new groups | Depends on |
|---|---|---|---|
| **core** (always on) | Members, matches, availability + waitlist, guests, draft, matchday, results, notifications | On | — |
| `ratings` | Peer voting, outlier detection, stats submissions, scoring, leaderboard | On | core |
| `recognition` | Awards, achievements, MOTM, kudos, reactions | On | ratings (partly) |
| `match-payments` | Per-match payments | Off | core |
| `season` | Seasons, subscriptions, seats, seat offers, reserve list | Off | core |
| `season-billing` | Monthly invoices, dues ledger, group fund | Off | season |
| `benefit-credits` | MultiSport-style card scans and credits | Off | season-billing |
| `automation` | Recurring match generation, timed opening | Off | season |
| `fun` | Moments, sounds, fun messages, tap-spam | Off | ratings |
| `stories` | Stories | Off | core |
| `predictions` | Predictions | Off | core |
| `weather-location` | Venue picker, geocoding, forecast | On | core |

### 4.2 Module manifest

```ts
// src/lib/modules/season-billing.ts (client-safe manifest)
export const seasonBilling: ModuleManifest = {
  key: "season-billing",
  dependsOn: ["season"],
  nav: [{ href: "/payments", label: "Payments", roles: ["player","admin","owner"] }],
  adminTabs: ["payments"],
  settings: ["billing.dueDay", "billing.roundingStep", …],
  notificationTypes: ["invoice_due", "invoice_overdue"],
  cron: ["season-reminders"],
};
```

Enforcement happens at four points, all driven by the manifest:

1. **Navigation.** The tab bar and admin tabs render from the enabled modules.
2. **Pages.** `requireModule(ctx, "season-billing")` in the layout or page, or `notFound()`.
3. **Actions.** The same check runs in every server action of that module.
4. **Cron and push.** Jobs and notification types are skipped for groups without the module.

Enabled modules are stored as `app_settings` key `modules.enabled` and validated against the
dependency graph. Turning a module off hides it; it **never deletes data**. Turning it back on
restores everything.

## 5. Presets

| Preset | Modules | Notable settings |
|---|---|---|
| `sideline-classic` | Everything group #1 uses today | Exact current values, captured into a committed preset file from a read-only export of production `app_settings` and season rows that you run (production stays untouched until the release). Reviewed by the owner. |
| `casual-pickup` | core, ratings, weather-location | No money modules; 24 h lock off; waitlist visible |
| `paid-season` | core, ratings, recognition, season, season-billing, automation, match-payments | Manual payment instructions; due day 5 |

A preset is applied **once**, when the group is created. After that the group owns its
settings. Later preset changes do not propagate, which keeps changes predictable for
organisers. A "compare with preset" view can come later.

## 6. Organiser UI

`/g/<slug>/admin/settings`, owner and admin, with tabs by module:

- **General:** name, crest upload, accent colour, time zone (validated IANA name), currency,
  default kickoff time, number of teams
- **Modules:** toggles with dependency hints and "this hides, not deletes" copy
- **Per-module sections**, generated from the registry (label, input type from the Zod
  schema, help text). Hand-built forms only where needed, e.g. scoring weights.
- **History:** the `group_settings_audit` list

Follow `design/DESIGN_SYSTEM.md` tokens, and the ROADMAP note about rendering billing forms
once across layouts.

## 7. Replacing the Warsaw literals (the delicate part)

1. TS: replace `CLUB_TIME_ZONE` constants with `ctx.group.timezone`, keeping one helper module.
   Unit-test DST boundaries in at least two zones (Europe/Warsaw and America/New_York).
2. SQL: change functions to `… AT TIME ZONE g.timezone` with a join to `groups`. Ship this as a
   reviewed migration.
3. **Equivalence test:** for group #1, run kickoff derivation, signup opening, due-at, and
   billing-day counts before and after the change on a fixed dataset spanning DST changes.
   The results must be identical.
4. Changing a group's timezone is allowed only when it has no open season, or with an explicit
   warning. Existing `kickoff_at` instants do not move; display does.

## 8. Tests

| Test | Kind |
|---|---|
| Registry: every key has a schema, default, module; module manifests reference only existing keys | Unit |
| Module dependency graph: cannot enable `season-billing` without `season`; disabling cascades in UI only | Unit |
| A disabled module's pages → 404, its actions → error, its cron skipped | Isolation-style suite |
| `sideline-classic` reproduces group #1: golden scoring/awards unchanged; billing/kickoff equivalence (§7) | Golden + PGlite |
| A second preset group in a different timezone: kickoff, lock, opening, due dates correct | PGlite |
| Settings audit written on every change | PGlite |

## 9. Slices (PR-sized)

1. Registry + `getGroupConfig` + wrappers for existing `feature-settings` getters
2. Module manifests + `requireModule` + nav rendering from modules (group #1: all its modules on)
3. Capture the `sideline-classic` preset; preset application at group creation
4. Settings UI: General + Modules + generated sections + audit
5. Currency default + payment-method module (Polish QR / manual)
6. Benefit-credits module generalisation (rename in UI, config the card name)
7. Timezone: TS helpers
8. Timezone: SQL functions migration + equivalence tests
9. Branding tokens: group accent + crest; incremental `emerald` → token replacement
10. `casual-pickup` and `paid-season` presets; pilot group moved to its preset

## 10. Exit criteria

- [ ] `grep -r "Europe/Warsaw" src drizzle/<new migrations>` finds only test fixtures and preset data
- [ ] Group #1 runs on `sideline-classic`, with golden and equivalence tests green
- [ ] Pilot group runs on a different preset with at least one module disabled
- [ ] Organisers change settings without developer help; changes are audited
- [ ] REQUIREMENTS.md updated: business rules (§6) expressed as defaults, not constants
