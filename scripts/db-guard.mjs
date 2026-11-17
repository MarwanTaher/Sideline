/**
 * Refuses to continue unless DATABASE_URL points at an explicitly approved
 * (non-production) database host. Run it in front of any database-touching
 * command so a wrong connection string fails fast:
 *
 *   node --env-file=.env.local scripts/db-guard.mjs \
 *     && node --env-file=.env.local scripts/apply-migration.mjs drizzle/00xx_name.sql
 *
 * APPROVED_DB_HOSTS is a comma-separated list of allowed hostnames, kept in
 * .env.local next to DATABASE_URL. Listing a host does not make it safe by
 * itself: verify in the Neon console that it is the Preview/development
 * branch before adding it. Never list the production host.
 */

function fail(message) {
  console.error(`db-guard: REFUSED — ${message}`);
  process.exit(1);
}

const url = process.env.DATABASE_URL;
if (!url) fail("DATABASE_URL is not set");

let host;
try {
  host = new URL(url).hostname.toLowerCase();
} catch {
  fail("DATABASE_URL is not a parseable URL");
}

const approved = (process.env.APPROVED_DB_HOSTS ?? "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

if (approved.length === 0) {
  fail(
    "APPROVED_DB_HOSTS is not set; add the verified non-production host(s) to .env.local",
  );
}

if (!approved.includes(host)) {
  fail(`DATABASE_URL host "${host}" is not in APPROVED_DB_HOSTS`);
}

console.log(`db-guard: OK — ${host} is approved`);
