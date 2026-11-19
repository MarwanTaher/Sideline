-- Cleanup found while classifying tables for tenancy
-- (docs/platform/01-M1-TENANCY-FOUNDATION.md §4): admin_sessions belonged to
-- the Streamlit admin login. Auth.js replaced it and no code in src reads or
-- writes the table, so it is dropped rather than given a group_id.
--
-- Idempotent: safe to re-run.

DROP TABLE IF EXISTS admin_sessions;
