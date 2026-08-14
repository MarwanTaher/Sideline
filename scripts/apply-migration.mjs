import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}
const file = process.argv[2];
if (!file) {
  console.error("Usage: apply-migration <path-to-sql>");
  process.exit(1);
}

const sql = neon(url);
const text = readFileSync(file, "utf8");
const statements = text
  .split("--> statement-breakpoint")
  .map((s) => s.trim())
  .filter(Boolean);

for (const stmt of statements) {
  await sql.query(stmt);
}
console.log(`Applied ${statements.length} statement(s) from ${file}`);
