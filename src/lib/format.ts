// Client-safe formatting helpers (no DB imports) so client components can
// use them without pulling server-only code into the browser bundle.

/** Return a normalized time label, defaulting to 09:00 pm (mirrors _fmt_match_time). */
export function fmtMatchTime(t: string | null | undefined): string {
  const txt = String(t ?? "").trim();
  return txt || "09:00 pm";
}

/** YYYY-MM-DD → DD-MM-YYYY (mirrors app.py _fmt_date). */
export function fmtDate(d: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d));
  return m ? `${m[3]}-${m[2]}-${m[1]}` : String(d);
}

/**
 * Reduce a full name to "First L." for public sharing so we never leak full
 * identities on the read-only summary card.
 */
export function shortenName(name: string): string {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
}
