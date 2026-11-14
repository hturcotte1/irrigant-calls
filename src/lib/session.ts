// A signed session cookie for the one shared dashboard password. Used by the
// proxy (every request) and the login action. Node runtime only.

import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "ic_session";
export const SESSION_DAYS = 30;

function secret(): string {
  const explicit = process.env.SESSION_SECRET;
  const password = process.env.DASHBOARD_PASSWORD;
  if (explicit) return explicit;
  // Without SESSION_SECRET, changing the password signs everyone out, which is what you'd want.
  return password ? createHash("sha256").update(`irrigant-calls:${password}`).digest("hex") : "";
}

export function makeSessionToken(now = Date.now()): string {
  const exp = now + SESSION_DAYS * 86_400_000;
  const sig = createHmac("sha256", secret()).update(String(exp)).digest("hex");
  return `${exp}.${sig}`;
}

export function isValidSessionToken(token: string | undefined, now = Date.now()): boolean {
  const key = secret();
  if (!token || !key) return false;
  const [expText, sig] = token.split(".");
  const exp = Number(expText);
  if (!Number.isFinite(exp) || exp < now || !sig) return false;
  const expected = createHmac("sha256", key).update(expText).digest();
  const given = Buffer.from(sig, "hex");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export function passwordMatches(attempt: string): boolean {
  const real = process.env.DASHBOARD_PASSWORD;
  if (!real) return false;
  const a = createHash("sha256").update(attempt).digest();
  const b = createHash("sha256").update(real).digest();
  return timingSafeEqual(a, b);
}
