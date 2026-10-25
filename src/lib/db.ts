import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "../../drizzle/schema";
import * as relations from "../../drizzle/relations";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set");
}

const sql = neon(process.env.DATABASE_URL);

export const db = drizzle(sql, { schema: { ...schema, ...relations } });
export { schema };

/**
 * Raw Neon SQL client for parameterized queries (`$1`, `$2`, …) via
 * `sqlClient.query(text, params)`. Used by the scoring engine, which is a
 * direct port of the Python `get_player_scores()` and mirrors its raw SQL.
 */
export const sqlClient = sql;
