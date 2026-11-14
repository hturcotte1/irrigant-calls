// Retell signs every webhook: header `X-Retell-Signature: v=<ms timestamp>,d=<hex>`,
// where hex = HMAC-SHA256(key = the Retell API key with the webhook badge,
// message = raw request body + timestamp). Reject anything older than 5 minutes.

import { createHmac, timingSafeEqual } from "node:crypto";

export const SIGNATURE_TOLERANCE_MS = 5 * 60 * 1000;

export function signRetellBody(rawBody: string, key: string, timestampMs: number): string {
  const digest = createHmac("sha256", key).update(rawBody + String(timestampMs)).digest("hex");
  return `v=${timestampMs},d=${digest}`;
}

export function verifyRetellSignature(rawBody: string, key: string, header: string | null, now = Date.now()): boolean {
  if (!header || !key) return false;
  const match = /^v=(\d+),d=([0-9a-f]+)$/i.exec(header.trim());
  if (!match) return false;
  const timestamp = Number(match[1]);
  if (!Number.isFinite(timestamp) || Math.abs(now - timestamp) > SIGNATURE_TOLERANCE_MS) return false;
  const expected = createHmac("sha256", key).update(rawBody + match[1]).digest();
  const given = Buffer.from(match[2], "hex");
  return given.length === expected.length && timingSafeEqual(given, expected);
}
