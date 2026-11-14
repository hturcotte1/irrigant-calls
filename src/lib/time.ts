// Clock helpers. The daily cap counts calls per Boise day (Henry's day); calling
// hours are checked in each contact's own time zone.

import type { Settings } from "./types.ts";

export const HOME_TZ = "America/Boise";

function parts(tz: string, at: Date) {
  const f = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", weekday: "short",
  });
  const p = Object.fromEntries(f.formatToParts(at).map((x) => [x.type, x.value]));
  const weekday = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(p.weekday) + 1; // ISO, Monday = 1
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour, min: +p.minute, s: +p.second, weekday };
}

/** The UTC instant when today began in `tz`. */
export function startOfDay(tz: string, now = new Date()): Date {
  const p = parts(tz, now);
  const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.s);
  const offset = asUtc - Math.floor(now.getTime() / 1000) * 1000; // tz offset in ms
  return new Date(Date.UTC(p.y, p.m - 1, p.d) - offset);
}

export function isWithinCallingHours(tz: string | null, s: Pick<Settings, "call_days" | "call_start_hour" | "call_end_hour">, now = new Date()): boolean {
  if (!tz) return false;
  const p = parts(tz, now);
  return s.call_days.includes(p.weekday) && p.h >= s.call_start_hour && p.h < s.call_end_hour;
}

export function localClock(tz: string | null, now = new Date()): string {
  if (!tz) return "";
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(now);
}

export function shortDate(isoString: string | null, withTime = false): string {
  if (!isoString) return "";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: HOME_TZ, month: "short", day: "numeric",
    ...(withTime ? { hour: "numeric", minute: "2-digit" } : {}),
  }).format(new Date(isoString));
}

export function hourLabel(h: number): string {
  const suffix = h >= 12 ? "pm" : "am";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}${suffix}`;
}
