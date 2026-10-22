export type PaymentQrResult =
  | { ok: true; payload: string }
  | { ok: false; reason: string };

/** Polish ZBP transfer format; never truncate a payment reference or recipient. */
export function paymentQrPayload(
  account: string | null,
  recipient: string | null,
  reference: string,
  amountMinor: number,
): PaymentQrResult {
  const nrb = (account ?? "").replace(/\s/g, "").toUpperCase().replace(/^PL/, "");
  if (!/^\d{26}$/.test(nrb)) {
    return { ok: false, reason: "QR needs a Polish bank account. Use the transfer details below." };
  }
  // IBAN mod-97, with PL encoded as 2521 and the check digits moved to the end.
  let remainder = 0;
  for (const digit of `${nrb.slice(2)}2521${nrb.slice(0, 2)}`) {
    remainder = (remainder * 10 + Number(digit)) % 97;
  }
  if (remainder !== 1) {
    return { ok: false, reason: "The account checksum is invalid. Ask an admin to check it before paying." };
  }
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0 || amountMinor > 999_999_999) {
    return { ok: false, reason: "QR is unavailable for this amount. Use a manual transfer." };
  }
  const name = (recipient ?? "").trim();
  const title = reference.trim();
  const bytes = new TextEncoder();
  const unsafe = /[|\p{Cc}\p{Cf}]/u;
  if (!name || !title || unsafe.test(name) || unsafe.test(title) ||
      bytes.encode(name).length > 20 || bytes.encode(title).length > 32) {
    return {
      ok: false,
      reason: "The recipient or reference does not fit the bank QR format. Copy the full details instead.",
    };
  }
  return {
    ok: true,
    payload: ["", "PL", nrb, String(amountMinor).padStart(6, "0"), name, title, "", "", ""].join("|"),
  };
}
