/**
 * P2.2: what a session charge's MultiSport scan credit means for the payer.
 * Pure and client-safe, so it can be unit-tested.
 */

type When = string | Date | null | undefined;

function toMs(v: When): number | null {
  if (v == null) return null;
  const t = v instanceof Date ? v.getTime() : Date.parse(String(v));
  return Number.isFinite(t) ? t : null;
}

export function chargeScanFields(input: {
  amountMinor: number;
  scanCreditMinor: number;
  paidAt: When;
  /** When the scan was put on this fee. */
  scanSettledAt: When;
  scanRefundedAt: When;
}): { scanCreditMinor: number; payableMinor: number; refundDueMinor: number } {
  const amount = Math.max(0, Math.trunc(input.amountMinor));
  const scanCreditMinor = Math.min(Math.max(Math.trunc(input.scanCreditMinor), 0), amount);
  const paid = toMs(input.paidAt);
  const scanned = toMs(input.scanSettledAt);
  // Paid in full before the scan came off the fee: the difference goes back.
  const refundDue =
    scanCreditMinor > 0 && paid != null && scanned != null && paid < scanned && input.scanRefundedAt == null;
  return {
    scanCreditMinor,
    payableMinor: amount - scanCreditMinor,
    refundDueMinor: refundDue ? scanCreditMinor : 0,
  };
}
