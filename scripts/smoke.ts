import { config } from "dotenv";
config({ path: ".env.local" });

import { db, schema } from "../src/lib/db";
import { sql } from "drizzle-orm";

async function main() {
  const players = await db.select({ count: sql<number>`count(*)` }).from(schema.players);
  const matches = await db.select({ count: sql<number>`count(*)` }).from(schema.matches);
  const stats = await db.select({ count: sql<number>`count(*)` }).from(schema.stats);
  console.log("Connected to Neon. Row counts:");
  console.log("  players:", players[0].count);
  console.log("  matches:", matches[0].count);
  console.log("  stats:  ", stats[0].count);
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(e);
  process.exit(1);
});
