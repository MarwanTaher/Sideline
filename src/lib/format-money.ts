// Client-safe money helpers. Amounts are minor units (grosz) so that splitting
// a shared bill never drifts through floating point.

/** 12345 → "123.45 PLN" */
export function formatMinor(minor: number): string {
  const sign = minor < 0 ? "-" : "";
  const abs = Math.abs(Math.trunc(minor));
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")} PLN`;
}

/** Split a cost across the group, rounded to the nearest grosz. */
export function invoiceAmountMinor(
  playingDays: number,
  dayRateMinor: number,
  splitBetween: number,
): number {
  if (splitBetween <= 0) return 0;
  return Math.round((playingDays * dayRateMinor) / splitBetween);
}
