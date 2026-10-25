import "server-only";
import { headers } from "next/headers";

/**
 * Absolute base URL of the current request (e.g. https://sideline.app), derived
 * from the forwarded host headers. Used to build shareable links and OG image
 * URLs. Returns "" when the host cannot be determined.
 */
export async function getBaseUrl(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? "https";
  return host ? `${proto}://${host}` : "";
}
