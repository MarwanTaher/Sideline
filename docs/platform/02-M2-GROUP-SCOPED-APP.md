# M2 — Group-Scoped Application

| | |
|---|---|
| Status | Proposal |
| Depends on | [M1 Tenancy foundation](./01-M1-TENANCY-FOUNDATION.md) (including the RLS spike) |
| Unlocks | [M3 Accounts](./03-M3-ACCOUNTS-AND-MEMBERSHIP.md), [M4 Configuration](./04-M4-GROUP-CONFIGURATION-AND-MODULES.md) |
| User-visible change | URLs become `/g/<slug>/…`; old links redirect. Everything else is unchanged. |
| Overview | [00-OVERVIEW.md](./00-OVERVIEW.md) |

## 1. Goal

Every request knows which group it serves. Every query runs inside that group under RLS.
Caches, files, notifications, cron, rate limits, and exports are all per group. At the end,
Preview has two groups: Krakow Pyramids and the fictional Berlin Bears (`berlin-bears`), which
proves isolation. Production is unchanged until the single release ([RELEASE.md](./RELEASE.md)).

This is the largest milestone. It is mostly mechanical work across 57 files, done one domain
area at a time.

## 2. Identity in M2: still one group per player

M3 adds accounts. Until then, the existing model holds: **a login is a `players` row, and that
row has a `group_id`.** The session's `playerId` therefore implies exactly one group. This lets
M2 ship all the scoping work without touching authentication. Route guards check
`player.group_id === group.id`.

## 3. Routing

### 3.1 Rename middleware → proxy first

Next.js 16 deprecates `middleware.ts` and its `middleware` export in favour of `proxy.ts` /
`proxy` (Node runtime; see `node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md`).
Rename it as its own PR, with no behaviour change, before adding logic.

### 3.2 Route layout

```
src/app/
  page.tsx                 → redirects to the member's group (or the group picker in M3)
  login/ register/ reset/ magic/   (platform-level, unchanged paths)
  api/auth/  api/cron/            (platform-level)
  g/[group]/
    layout.tsx             → resolveGroupRequest(): slug → group, auth, membership, modules
    page.tsx               (today's home)
    matches/ leaderboard/ players/ awards/ season/ payments/ profile/
    admin/ votes/ scoring/ stats/ notifications/ diagnostics/ share/
  api/g/[group]/…          (calendar, lineup-image, player form, export, tap-spam)
```

Moving the folders is mechanical, using `git mv` so history follows the files. Do it in one PR
with no logic changes so the review stays tractable.

### 3.3 Links and revalidation

- Add `src/lib/group-paths.ts` (client-safe): `gp(slug, "/matches/42")` → `/g/slug/matches/42`.
  Replace the ~159 hardcoded absolute links. Client components get `slug` from a small
  `GroupProvider` context and must not import server modules.
- Replace the 167 `revalidatePath("/matches/…")` calls with `revalidateGroup(ctx, "/matches/42")`.
  Where a whole area changes, revalidate the dynamic route pattern
  (`revalidatePath("/g/[group]/matches/[id]", "page")`). Read the Next 16 `revalidatePath`
  reference before choosing between the two approaches.
- Push payload URLs, share links, `.ics` URLs, and `site-url.ts` all go through `gp()`.

### 3.4 Legacy redirects (keep permanently)

`proxy.ts` redirects any old top-level group path (`/matches/…`, `/season`, `/leaderboard`, …)
to `/g/krakow-pyramids/…`. From M3 onwards it uses the member's last-active group. This keeps
links already posted in WhatsApp, old push notifications, and installed PWAs working. The PWA
`start_url` stays `/`, which redirects.

## 4. Request context

```ts
// src/lib/group-context.ts (server-only)
export type GroupCtx = {
  group: { id: number; slug: string; name: string; timezone: string; currency: string };
  playerId: number;               // member row in this group
  role: "owner" | "admin" | "player";
  db: ReturnType<typeof groupSql>;
};

export const resolveGroupRequest = cache(async (slug: string): Promise<GroupCtx> => { … });
```

Rules:

1. Pages and layouts call `resolveGroupRequest(params.group)`. An unknown slug or a
   non-member gets `notFound()`, not 403, so the response doesn't reveal that the group exists.
2. **Server actions re-resolve the group themselves.** They receive the slug, call
   `resolveGroupRequest`, and only then load entities through `ctx.db`. A `matchId` from the
   client is only valid if RLS returns the row. Never accept a `groupId` from the client.
3. `role` is computed for each request, not read from the JWT. This also fixes today's
   stale-role-in-JWT issue.
4. `admin-access.ts` helpers take `ctx`.

## 5. Scoped data access and RLS rollout

### 5.1 Code conversion

- `db.ts` exports `groupSql(groupId)` and `groupTransaction(groupId, queries)` from the spike.
  Code outside a small allow-list must not import the bare `sqlClient` (enforce with an ESLint
  `no-restricted-imports` rule). The allow-list is platform code, cron fan-out, and migrations.
- Domain functions take `ctx: GroupCtx` (or `db` + `groupId`) as their first parameter.
  Explicit `AND group_id = $n` filters stay in the SQL for index use.
- Convert one bounded area at a time, in the order of the module map in ARCHITECTURE §5.2.
  Each area is one or more PRs:

| Order | Area | Notes |
|---|---|---|
| 1 | Config (`feature-settings`, `*-settings.ts`) | Small. Proves the pattern. |
| 2 | Scheduling (`matches`, `match-admin`, `match-schedule`, `weather`, `geo`, `calendar-ics`) | |
| 3 | Availability (`availability`, `guests`, waitlist SQL functions) | Has capacity functions from `0037` |
| 4 | Teams & play (`draft`, `matchday`, `results`, scorekeepers, tab locks) | |
| 5 | Rating (`voting`, `stats`, `scoring`, `leaderboard`, score caches) | Scoring engine: pass `ctx` through; golden tests guard |
| 6 | Recognition (`awards`, `achievements`, `motm`, `kudos`, `reactions`, `moments`, `stories`, `predictions`) | |
| 7 | Money (`payments`, `seasons`, `season-*`, `multisport`, `dues`, `seat-offers`) | Uses `groupTransaction` for invoicing and allocation |
| 8 | Messaging (`push`, `match-digest`, `notification-types`) | Recipients are scoped by group |
| 9 | Identity & admin (`players-admin`, `admins`, `access-tokens`, `password-reset`) | Becomes partly platform-level in M3 |

### 5.2 Enabling RLS

Per area, once its code is converted:

1. Enable RLS + the `group_isolation` policy on that area's tables on Preview (production gets
   it in the release).
2. Remove the `DEFAULT 1` on `group_id` for those tables.
3. Drop the old single-column FKs that the composite FKs have replaced.

At the end, every query on Preview runs as the `sideline_app` role (non-owner, no `BYPASSRLS`;
how is decided in [M1-RLS-SPIKE.md](./M1-RLS-SPIKE.md)), and all group tables have
`FORCE ROW LEVEL SECURITY`. Steps 2–3 are **contract** migrations in the release ledger.

### 5.3 Platform-level code

Cron, platform admin, and auth lookups that must see across groups use a separate `platformSql`.
It is allowed only in an allow-listed set of files, and every use is reviewed. Cron does not
need it for group work: it loops over groups and uses `groupSql(group.id)` for each.

## 6. Other per-group resources

| Resource | Today | After M2 |
|---|---|---|
| `unstable_cache` (leaderboard, awards, player profile) | Global keys, tag `scores` | Key parts include `groupId`; tags `scores:g:<id>`; `revalidateScores(groupId)` |
| Score revision / snapshots | Single row | Per group (from M1); readers pass `groupId` |
| Vercel Blob | `players/<pid>.jpg`, `stories/<pid>/…`, `<folder>/sound.*` | `groups/<gid>/players/<pid>.jpg`, etc. Existing URLs are stored as-is and keep working; new uploads use the new prefix. |
| Push fan-out | All active players | Members of the group only; payload URL via `gp()` |
| Rate limits | `login:<pid>`, etc. | Login buckets stay per account. Group-action buckets are prefixed `g<gid>:`. |
| `app_errors` | Global | Writes `group_id`; Diagnostics filters by group |
| CSV exports | Whole DB | Current group only; the existing Diagnostics permission still applies |
| Cron `/api/cron/reminders` | One group | Loops over active groups; one `try/catch` and error log per group; time budget + resume cursor |

## 7. The Berlin Bears group (Preview only)

Create group #2 `berlin-bears` (Berlin Bears, Europe/Berlin, EUR) in the Preview Neon branch with fictional data. This is also an
opportunity to start the ROADMAP item on deterministic demo data. Use it for:

- the **cross-group isolation suite**: for every page route and server action, a group-2
  session targeting group-1 ids gets `notFound` or an error, and never data;
- manual exploratory testing of group switching by URL;
- the per-group cron run.

Production gets no second group until after the release.

## 8. Tests

| Test | Kind |
|---|---|
| RLS: with no setting → 0 rows; group-1 setting cannot read or write group-2 rows, for every group table | PGlite if roles work (M1 spike), otherwise opt-in Preview integration |
| Every group table has RLS enabled and forced, plus a policy (catalog query) | PGlite / Preview |
| No group table has a column default on `group_id` | Catalog query |
| ESLint: no bare `sqlClient` import outside the allow-list | `npm run lint` |
| Legacy URL → redirect table (unit test of the proxy matcher) | Unit |
| `gp()` and `revalidateGroup()` helpers | Unit |
| Golden scoring/awards for group #1 | Existing |

## 9. Slices (PR-sized)

1. `middleware.ts` → `proxy.ts` rename (no behaviour change)
2. `group-paths.ts` + `GroupProvider`; links still point at the old paths
3. Route move to `g/[group]/` + legacy redirects + `resolveGroupRequest`
4. `groupSql` / `groupTransaction` + ESLint restriction (allow-list everything at first, then shrink it)
5–13. One PR per area in §5.1, each enabling RLS for its tables on Preview
14. Caches, Blob paths, rate limits, errors, exports
15. Cron fan-out
16. Berlin Bears group + isolation suite
17. Preview switch to the `sideline_app` role; RLS forced everywhere; contract migrations (defaults, old constraints, transitional indexes) written and tagged in RELEASE.md

## 10. Exit criteria

- [ ] All group pages are under `/g/[group]`; legacy links redirect
- [ ] `sqlClient` allow-list contains only platform files
- [ ] RLS enabled and forced on every group table on Preview; queries run as `sideline_app`
- [ ] Isolation suite green against Berlin Bears on Preview
- [ ] Golden tests unchanged; no regression in measured page latency beyond what the M1 spike predicted
- [ ] ARCHITECTURE.md §5, §7.1, and §8 updated
