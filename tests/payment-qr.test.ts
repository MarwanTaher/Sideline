import assert from "node:assert/strict";
import test from "node:test";
import QRCode from "qrcode";
import { paymentQrPayload } from "../src/lib/payment-qr";

const ACCOUNT = "86105000021234567890123456";

test("bank QR encodes the exact amount, validated NRB and full reference locally", async () => {
  const result = paymentQrPayload(`PL ${ACCOUNT}`, "Football Club", "Sideline 2026-11 Test", 12345);
  if (!result.ok) assert.fail(result.reason);
  assert.equal(result.payload, `|PL|${ACCOUNT}|012345|Football Club|Sideline 2026-11 Test|||`);
  const image = await QRCode.toDataURL(result.payload, { width: 250, margin: 4, errorCorrectionLevel: "L" });
  assert.match(image, /^data:image\/png;base64,/);
  const bytes = Buffer.from(image.split(",")[1], "base64");
  assert.equal(bytes.readUInt32BE(16), 250);
  assert.equal(bytes.readUInt32BE(20), 250);
});

test("unsupported or corrupt details offer manual payment, never a misleading QR", () => {
  for (const [account, name, title, amount] of [
    ["123", "Club", "Invoice", 100],
    [`00${ACCOUNT.slice(2)}`, "Club", "Invoice", 100],
    [ACCOUNT, "", "Invoice", 100],
    [ACCOUNT, "x".repeat(21), "Invoice", 100],
    [ACCOUNT, "Club", "x".repeat(33), 100],
    [ACCOUNT, "Club", "Invoice|other", 100],
    [ACCOUNT, "Club", "Invoice\nother", 100],
    [ACCOUNT, "Club", "Invoice", 0],
    [ACCOUNT, "Club", "Invoice", -1],
    [ACCOUNT, "Club", "Invoice", 1.5],
    [ACCOUNT, "Club", "Invoice", 1_000_000_000],
  ] as const) {
    const result = paymentQrPayload(account, name, title, amount);
    assert.equal(result.ok, false);
    if (!result.ok) assert.ok(result.reason.length > 0);
  }
});
