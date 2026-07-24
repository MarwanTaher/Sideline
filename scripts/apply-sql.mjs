// One-off migration runner. Usage:
//   node --env-file=.env.local scripts/apply-sql.mjs drizzle/0008_new_features.sql
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

const file = process.argv[2];
if (!file) {
  console.error("Usage: node --env-file=.env.local scripts/apply-sql.mjs <file.sql>");
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);
const raw = readFileSync(file, "utf8");

// Strip line comments, then split on statement terminators.
const cleaned = raw
  .split("\n")
  .filter((line) => !line.trim().startsWith("--"))
  .join("\n");
const statements = cleaned
  .split(";")
  .map((s) => s.trim())
  .filter((s) => s.length > 0);

for (const stmt of statements) {
  const label = stmt.replace(/\s+/g, " ").slice(0, 70);
  try {
    await sql.query(stmt);
    console.log("OK  ", label);
  } catch (err) {
    console.error("FAIL", label, "\n     ", err.message);
    process.exit(1);
  }
}
console.log(`Applied ${statements.length} statement(s) from ${file}`);
