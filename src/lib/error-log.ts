import "server-only";
import { db, schema } from "@/lib/db";
import { sanitizeErrorMessage } from "@/lib/error-sanitization";

const SAFE_SOURCE = /^[a-z][a-z0-9_.-]{0,79}$/i;

/**
 * Persist a minimal server error record. Never pass request data, credentials,
 * stack traces, or arbitrary context to this helper.
 */
export async function logAppError(error: unknown, source: string): Promise<void> {
  const safeSource = SAFE_SOURCE.test(source) ? source : "server";
  const errorName =
    error instanceof Error && error.name
      ? sanitizeErrorMessage(error.name).slice(0, 100)
      : "Error";
  const message =
    error instanceof Error
      ? sanitizeErrorMessage(error.message)
      : "An unknown server error occurred.";

  try {
    await db.insert(schema.appErrors).values({
      source: safeSource,
      errorName,
      message: message || "No error message provided.",
    });
  } catch {
    console.error("Unable to persist app error log; verify migration 0030 is deployed.");
  }
}
