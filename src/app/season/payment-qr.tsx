"use client";

import { useState } from "react";
import type { PaymentQrResult } from "@/lib/payment-qr";

export default function PaymentQr({ result }: { result: PaymentQrResult }) {
  const [image, setImage] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  if (!result.ok) {
    return <p className="mt-2 text-xs text-neutral-500">{result.reason}</p>;
  }

  async function generate() {
    if (!result.ok) return;
    setPending(true);
    setError("");
    try {
      const QRCode = await import("qrcode");
      setImage(await QRCode.toDataURL(result.payload, {
        width: 250, margin: 4, errorCorrectionLevel: "L",
        color: { dark: "#000000", light: "#ffffff" },
      }));
    } catch (err) {
      console.error("Payment QR generation failed", err);
      setError("Could not generate the QR. Copy the transfer details instead.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mt-3">
      {image ? (
        <div className="space-y-2">
          {/* A local data URL, not a remote image or payment service. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image} alt="Bank transfer QR with this invoice's amount and reference" width={250} height={250} className="max-w-full rounded-lg" />
          <p className="text-xs text-neutral-500">
            Scan or save the QR for your banking app. Check the recipient and amount before approving.
          </p>
          <a href={image} download="sideline-payment.png" className="text-sm underline">Save QR</a>
        </div>
      ) : (
        <button type="button" onClick={generate} disabled={pending} className="rounded-lg border border-black/10 px-3 py-2 text-sm font-medium disabled:opacity-50 dark:border-white/15">
          {pending ? "Generating QR..." : "Show payment QR"}
        </button>
      )}
      {error ? <p role="alert" className="mt-2 text-xs text-amber-700 dark:text-amber-300">{error}</p> : null}
    </div>
  );
}
