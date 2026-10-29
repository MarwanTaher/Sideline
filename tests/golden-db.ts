import { fileURLToPath } from "node:url";

export function assertApprovedGoldenDatabase(env: Readonly<Record<string, string | undefined>> = process.env): void {
  const message = "Golden database checks require ALLOW_GOLDEN_DB_TESTS=1, DATABASE_URL, and a matching approved non-production GOLDEN_DATABASE_HOST.";
  if (env.ALLOW_GOLDEN_DB_TESTS !== "1" || !env.GOLDEN_DATABASE_HOST || !env.DATABASE_URL) {
    throw new Error(message);
  }

  let url: URL;
  try {
    url = new URL(env.DATABASE_URL);
  } catch {
    throw new Error(message);
  }
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    url.hostname !== env.GOLDEN_DATABASE_HOST.toLowerCase()
  ) {
    throw new Error(message);
  }
}

export function localGoldenPath(file: "golden_scores.json" | "golden_awards.json"): string {
  assertApprovedGoldenDatabase();
  return fileURLToPath(new URL(`./.local/${file}`, import.meta.url));
}