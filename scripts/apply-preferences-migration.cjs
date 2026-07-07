const { neon } = require("@neondatabase/serverless");
const fs = require("fs");

(async () => {
  const sql = neon(process.env.DATABASE_URL);
  const stmts = fs
    .readFileSync("drizzle/0002_push_preferences.sql", "utf8")
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const s of stmts) {
    await sql.query(s);
  }
  const r = await sql.query(
    "SELECT column_name FROM information_schema.columns WHERE table_name='push_preferences' ORDER BY ordinal_position",
  );
  console.log(
    "push_preferences ready:",
    r.map((x) => x.column_name).join(", "),
  );
})().catch((e) => {
  console.error("ERR", e.message);
  process.exit(1);
});
