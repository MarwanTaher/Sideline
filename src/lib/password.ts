import { pbkdf2Sync, timingSafeEqual } from "node:crypto";

/**
 * Byte-for-byte port of `_hash_player_password` from the Streamlit app.py.
 * PBKDF2-HMAC-SHA256, 200,000 iterations, 32-byte digest.
 * Salt is stored as hex and decoded to bytes before hashing.
 */
export function hashPlayerPassword(password: string, saltHex: string): string {
  const dk = pbkdf2Sync(
    Buffer.from(password, "utf-8"),
    Buffer.from(saltHex, "hex"),
    200_000,
    32,
    "sha256",
  );
  return dk.toString("hex");
}

/** Constant-time verification matching Python's hmac.compare_digest. */
export function verifyPassword(
  password: string,
  saltHex: string,
  expectedHex: string,
): boolean {
  const computed = hashPlayerPassword(password, saltHex);
  const a = Buffer.from(computed, "hex");
  const b = Buffer.from(expectedHex, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}
