# M1 RLS spike — results

| | |
|---|---|
| Date | 2026-11-20 |
| Where | PGlite 17.5 (`tests/rls-policy-sql.test.ts`) and the approved development Neon branch (PostgreSQL 18.7), via the pooler host, with a throwaway role and table that were dropped afterwards |
| Purpose | Answer the five questions in [01-M1-TENANCY-FOUNDATION.md §8](./01-M1-TENANCY-FOUNDATION.md#8-rls-spike-prove-it-now-enable-it-in-m2) before M2 depends on row-level security |

## Policy shape (proven)

```sql
ALTER TABLE <t> ENABLE ROW LEVEL SECURITY;
ALTER TABLE <t> FORCE ROW LEVEL SECURITY;
CREATE POLICY group_isolation ON <t>
  USING      (group_id = NULLIF(current_setting('sideline.group_id', true), '')::int)
  WITH CHECK (group_id = NULLIF(current_setting('sideline.group_id', true), '')::int);
```

`NULLIF(…, '')` matters: after a transaction ends, `current_setting(…, true)` returns `''`, not
NULL, and a bare `''::int` cast would turn every later query into an error instead of an
empty result.

## Answers

| # | Question | Answer |
|---|---|---|
| 1 | Does `sql.transaction([...])` run in one HTTP round trip, and what does it cost? | Yes. On Neon via the pooler: a plain query p50 **48 ms**; `transaction([set_config, query])` as the owner p50 **45 ms** (noise). With the role switch added (option B below) p50 **56 ms**. The setting is visible to the later statements in the batch and gone afterwards (`''`). |
| 2 | Missing setting → zero rows? `WITH CHECK` rejects other groups' rows? | Yes, both, under a non-owner role: no setting → `[]` on read and "row-level security" error on insert; group 1 inserting a group-2 row is refused; updating a row into another group is refused. A refused statement aborts the transaction, so a batch that fails stops there. |
| 3 | How do existing `sql.transaction` call sites compose? | `groupTransaction(ctx, queries)` prepends the role switch and `set_config` statements and returns the remaining results. Existing batches (invoicing, scan allocation, matchday close) only change their entry point. |
| 4 | Do PL/pgSQL functions and triggers work under RLS? | Yes. A function called by the app role sees and updates only the current group's rows. No `SECURITY DEFINER` needed for the functions tested. The `0037` capacity functions and the `0039` ledger sync run as the caller and therefore stay within the group; cron's cross-group work loops over groups (M2 §5.3). |
| 5 | Can PGlite test this? | Yes. `CREATE ROLE` + `SET ROLE` + RLS all work in PGlite, so the isolation suite can run in the unit gate without a database. The owner in PGlite is a superuser and bypasses RLS, same as Neon's `neondb_owner` (`rolbypassrls = true`). |

## Which role runs the queries (decision for M2)

The Neon owner role bypasses RLS, so the app must execute as a role without `BYPASSRLS`. Two
ways were tested:

| Option | How | Result | Notes |
|---|---|---|---|
| **A. Separate login role** | `CREATE ROLE sideline_app LOGIN PASSWORD …` by SQL; `DATABASE_URL` uses it | **Failed through the pooler:** `invalid role OID` on `SELECT current_user`, `permission denied for table` on reads, although `has_table_privilege` reported the grant. Roles created with plain SQL are not fully usable through Neon's proxy; Neon expects roles to be created in its console or API. | Still the stronger model (the connection itself cannot bypass RLS). Possible later if the role is created through the Neon console/API and a second connection string is managed. |
| **B. Role switch inside the batch** | Keep the owner connection; each `groupSql` batch starts with `SET LOCAL ROLE sideline_app` then `set_config(...)`; requires `GRANT sideline_app TO neondb_owner` once | **Works:** no setting → `[]`, cross-group insert refused, role reverts after the batch, p50 56 ms | No new credentials, no console step, same connection string for Preview and production. Weakness: a query that bypasses `groupSql` runs as the owner and sees everything, so the ESLint restriction on bare `sqlClient` (M2 §5.1) is part of the security boundary, and `platformSql` is the explicit, allow-listed escape hatch. |

**Recommendation for M2: option B**, because it works today with zero operations work and
fits the free-tier constraint. The `sideline_app` role is created by a migration
(`CREATE ROLE … NOLOGIN` + grants + `GRANT sideline_app TO <owner>`), so Preview and
production stay in step. Revisit option A if the console-created role proves easy, since it
removes the "forgot to use `groupSql`" failure mode entirely.

## Cleanup

The spike role and table were dropped at the end of each run (`leftoverRoles: 0`). Dropping a
role on Neon needs its grants revoked first (`REVOKE … ON ALL TABLES IN SCHEMA public`,
`REVOKE … ON SCHEMA public`); `DROP OWNED BY` is refused to the owner. Worth remembering for the
M2 migration that creates the real role.
