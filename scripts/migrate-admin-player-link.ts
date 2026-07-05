import { sqlClient } from "../src/lib/db";

/**
 * Migration: allow an admin/super account to also be a player.
 *
 * - Adds a nullable `admins.player_id` FK -> players(id) (ON DELETE SET NULL).
 * - Links each admin to a player whose name matches the admin username
 *   (case-insensitive), only when not already linked. Non-matching admins
 *   (e.g. a treasurer who never plays) simply stay unlinked.
 *
 * Safe to run multiple times (idempotent).
 */
async function main() {
  await sqlClient.query(
    `ALTER TABLE admins ADD COLUMN IF NOT EXISTS player_id integer`,
  );

  await sqlClient.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'admins_player_id_fkey'
      ) THEN
        ALTER TABLE admins
          ADD CONSTRAINT admins_player_id_fkey
          FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE SET NULL;
      END IF;
    END $$;
  `);

  const linked = (await sqlClient.query(`
    UPDATE admins a
       SET player_id = p.id
      FROM players p
     WHERE a.player_id IS NULL
       AND lower(a.username) = lower(p.name)
    RETURNING a.id, a.username, p.id AS player_id, p.name AS player_name
  `)) as unknown as Array<Record<string, unknown>>;

  const all = (await sqlClient.query(
    `SELECT a.id, a.username, a.player_id, p.name AS player_name
       FROM admins a LEFT JOIN players p ON p.id = a.player_id
      ORDER BY a.id`,
  )) as unknown as Array<Record<string, unknown>>;

  console.log("Newly linked:", JSON.stringify(linked, null, 2));
  console.log("All admins now:", JSON.stringify(all, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
