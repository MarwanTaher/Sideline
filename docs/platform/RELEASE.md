# Platform release runbook

| | |
|---|---|
| Decision (2026-11-21) | Production gets **no** platform change until all milestones (M1–M5) are complete and tested on Preview. Then everything ships in **one release**. M6 is optional and not part of this release unless decided otherwise. |
| Until then | Production runs today's `main` code on today's schema (through `0039`). All platform migrations are applied to the approved development/Preview database only. |
| Overview | [00-OVERVIEW.md](./00-OVERVIEW.md) |

## 1. Why the expand/contract split still matters

Even in a single release, production keeps running the **old** code for some minutes while the
migrations run and the new build deploys. Every migration is therefore tagged:

- **expand**: safe while the old code is running. Applied **before** the new code is deployed.
- **contract**: needs the new code (it removes something the old code uses). Applied **after**
  the new code is live and verified.

The transitional scaffolding from M1 (`DEFAULT 1` on `group_id`, the old global unique
constraints, the `*_transitional` indexes, the single-column foreign keys, the legacy
`score_cache_state.id`) exists for exactly this window. It is also what keeps Preview
deployments of older `ai_dev` commits working on the migrated Preview database. Contract
migrations remove it.

## 2. Migration ledger

Keep this table current: add a row in the same commit as every new migration.

| Migration | Milestone | Phase | Applied to dev/Preview | Notes |
|---|---|---|---|---|
| `0040_groups.sql` | M1 | expand | 2026-11-20 | New table; nothing reads it in old code |
| `0041_group_id_roots.sql` | M1 | expand | 2026-11-20 | `DEFAULT 1` + transitional `app_settings (key)` index keep old upserts working |
| `0042_drop_admin_sessions.sql` | M1 | expand | 2026-11-20 | Table unused by any code version since Auth.js |
| `0043_group_id_match_children.sql` | M1 | expand | 2026-11-20 | Old single-column FKs kept |
| `0044_group_id_season_money.sql` | M1 | expand | 2026-11-20 | Ledger views/functions replaced; same output columns plus `group_id` at the end |
| `0045_group_id_social_identity.sql` | M1 | expand | 2026-11-20 | |
| `0046_group_scoped_uniques.sql` | M1 | expand | 2026-11-20 | Old global uniques kept; `score_cache_state.id` kept (old code reads `WHERE id = 1`) |
| `0047_group_aware_triggers.sql` | M1 | expand | 2026-11-20 | Triggers fill `group_id` for old writers too |

Contract migrations (removing the scaffolding) are written in M2 and listed here as they land.

## 3. Rehearsal (before release day)

Run the whole sequence on a **copy of production data** first. This is also how the golden
tests get a valid baseline, since the baseline must come from the same data before the
migrations ran.

1. In the Neon console, create a short-lived branch from production, e.g. `release-rehearsal`.
   (Neon Free allows a limited number of branches, so delete it afterwards.) Add its host to
   `APPROVED_DB_HOSTS` only for the rehearsal, then remove it again.
2. On that branch, **before** any migration: dump the golden baselines
   (`ALLOW_GOLDEN_DB_TESTS=1 GOLDEN_DATABASE_HOST=<host> npm run test:scoring:update` and
   `test:awards:update`).
3. Apply every **expand** migration in order with `scripts/apply-migration.mjs`.
4. Run the golden tests (`npm run test:scoring`, `npm run test:awards`): they must be unchanged.
5. Point a Preview deployment of the release commit at the rehearsal branch, run the isolation
   suite and a manual smoke test of the weekly loop (availability, draft, matchday, vote,
   payments).
6. Apply every **contract** migration, then repeat steps 4–5.
7. Record timings (migration duration, any lock waits) here, then delete the branch.

## 4. Release day

1. Announce a short freeze of attendance and payment writes, as for `0037`.
2. Create a Neon branch of production named `pre-platform-release` as the rollback point.
3. Apply all **expand** migrations in order.
4. Merge the release into `main`; Vercel deploys production.
5. Smoke test production as group #1 (Krakow Pyramids). Check `app_errors`.
6. Apply all **contract** migrations.
7. Smoke test again, lift the freeze, and keep `pre-platform-release` for a week before
   deleting it.

**Rollback.** Before step 6, revert the `main` merge; the expand migrations are compatible with
the old code. After step 6, restore from `pre-platform-release` and revert. Writes made after
the branch point would be lost, which is why the freeze matters.

## 5. Working on a long-lived branch

- **Production hotfixes** still go to `main`. Merge `main` into `ai_dev` (and the platform
  branch) soon after, so the final merge doesn't become one giant conflict.
- **Migration numbers:** before adding a migration on either line, check the highest number on
  both `main` and the platform branch. A hotfix migration on `main` takes the next number above
  every platform migration, and platform migrations never reuse a number `main` has taken.
  `scripts/apply-migration.mjs` keeps no journal, so a duplicate number would only be caught by
  review.
- **Preview database** carries the platform schema from now on. Older `ai_dev` commits keep
  working on it until contract migrations are applied there. Apply contract migrations to
  Preview only once `ai_dev` runs code that no longer needs the scaffolding.
