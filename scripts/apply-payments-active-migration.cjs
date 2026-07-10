const { neon } = require("@neondatabase/serverless");
const fs = require("fs");

(async () => {
  const sql = neon(process.env.DATABASE_URL);
  const stmts = fs
    .readFileSync("drizzle/0005_payments_active.sql", "utf8")
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const s of stmts) {
    await sql.query(s);
  }
  const r = await sql.query(
    "SELECT column_name FROM information_schema.columns WHERE table_name='matches' AND column_name = 'payments_active'",
  );
  console.log(
    "matches payments column ready:",
    r.map((x) => x.column_name).join(", "),
  );
})().catch((e) => {
  console.error("ERR", e.message);
  process.exit(1);
});
