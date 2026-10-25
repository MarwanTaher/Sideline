/** Currencies an admin can pick for match payments. Client-safe. */
export const PAYMENT_CURRENCIES = [
  { code: "PLN", label: "Polish złoty (PLN)" },
  { code: "EUR", label: "Euro (EUR)" },
  { code: "USD", label: "US dollar (USD)" },
  { code: "GBP", label: "British pound (GBP)" },
  { code: "CHF", label: "Swiss franc (CHF)" },
  { code: "CZK", label: "Czech koruna (CZK)" },
  { code: "SEK", label: "Swedish krona (SEK)" },
  { code: "NOK", label: "Norwegian krone (NOK)" },
  { code: "DKK", label: "Danish krone (DKK)" },
  { code: "EGP", label: "Egyptian pound (EGP)" },
  { code: "AED", label: "UAE dirham (AED)" },
  { code: "SAR", label: "Saudi riyal (SAR)" },
] as const;

export type PaymentCurrency = (typeof PAYMENT_CURRENCIES)[number]["code"];

export const DEFAULT_CURRENCY: PaymentCurrency = "PLN";

export function isPaymentCurrency(value: unknown): value is PaymentCurrency {
  return PAYMENT_CURRENCIES.some((c) => c.code === value);
}

export function normCurrency(value: unknown): PaymentCurrency {
  return isPaymentCurrency(value) ? value : DEFAULT_CURRENCY;
}

/** 45 → "45 PLN"; 45.5 → "45.50 PLN". Match amounts are usually whole numbers. */
export function formatAmount(amount: number, currency: string): string {
  const value = Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
  return `${value} ${currency}`;
}
