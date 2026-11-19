import type { SubscriptionSeason } from "@/lib/season-subscriptions";
import {
  getBillingSummary,
  getPaymentDetails,
  getRoundingLedger,
  getSeasonRates,
  getSeatCapGap,
  listInvoicePeriods,
  listInvoices,
  listOutstandingInvoices,
  listWithdrawnWithOpenInvoices,
} from "@/lib/season-billing";
import { listLeftoverCredits, listPendingScans } from "@/lib/multisport";
import { getFundBalance, listAdjustments, listFundEntries } from "@/lib/season-fund";
import BillingAdmin from "@/app/admin/accounts/billing-admin";
import FundAdmin from "@/app/admin/accounts/fund-admin";

/**
 * Admin ▸ Payments ▸ Billing: season rates and transfer details, invoices
 * (with drafts to publish), MultiSport review, leftover credit, and the group
 * fund with its ledger history. Formerly Admin ▸ Billing.
 */
export async function BillingSection({
  season,
  periodParam,
}: {
  season: SubscriptionSeason;
  periodParam?: string;
}) {
  const periods = await listInvoicePeriods(season.id);
  // Default to the newest billed month, so the panel opens on what's being collected.
  const period =
    periodParam && /^\d{4}-\d{2}$/.test(periodParam)
      ? periodParam
      : (periods[0] ?? new Date().toISOString().slice(0, 7));

  const [
    invoices,
    summary,
    pendingScans,
    rounding,
    fund,
    adjustments,
    rates,
    paymentDetails,
    outstandingInvoices,
    withdrawnWarnings,
    leftoverCredits,
    seatGap,
    fundEntries,
  ] = await Promise.all([
    listInvoices(season.id, period),
    getBillingSummary(season.id, period),
    listPendingScans(),
    getRoundingLedger(season.id),
    getFundBalance(season.id),
    listAdjustments(season.id),
    getSeasonRates(season.id),
    getPaymentDetails(season.id),
    listOutstandingInvoices(season.id),
    listWithdrawnWithOpenInvoices(season.id),
    listLeftoverCredits(season.id),
    getSeatCapGap(season.id, period),
    listFundEntries(season.id),
  ]);
  if (!rates) return null;

  return (
    <BillingAdmin
      seasonId={season.id}
      seasonName={season.name}
      period={period}
      periods={periods}
      invoices={invoices}
      summary={summary}
      rates={rates}
      paymentDetails={paymentDetails}
      pendingScans={pendingScans}
      outstandingInvoices={outstandingInvoices}
      withdrawnWarnings={withdrawnWarnings}
      leftoverCredits={leftoverCredits}
      seatGap={seatGap}
      fundBalanceMinor={fund.balanceMinor}
      seasonEndDate={season.endDate}
      fund={
        <FundAdmin
          seasonId={season.id}
          balance={fund}
          adjustments={adjustments}
          roundingLines={rounding.lines}
          entries={fundEntries}
        />
      }
    />
  );
}
