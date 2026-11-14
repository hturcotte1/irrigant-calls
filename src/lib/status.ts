// Contact statuses: how they read on screen, and which ones the dialer may
// still call. No imports, so `node --test` can load this file directly.

import type { ContactStatus } from "./types.ts";

export const STATUS_LABEL: Record<ContactStatus, string> = {
  not_called: "Not called",
  no_answer: "No answer",
  voicemail: "Voicemail",
  spoke: "Spoke",
  follow_up: "Follow up",
  meeting: "Meeting set",
  not_interested: "Not interested",
  wrong_number: "Wrong number",
  dnc: "Do not call",
};

export const STATUS_TONE: Record<ContactStatus, "neutral" | "info" | "good" | "warn" | "bad"> = {
  not_called: "neutral",
  no_answer: "neutral",
  voicemail: "info",
  spoke: "info",
  follow_up: "warn",
  meeting: "good",
  not_interested: "bad",
  wrong_number: "bad",
  dnc: "bad",
};

export const STATUSES = Object.keys(STATUS_LABEL) as ContactStatus[];

/** Statuses the AI dialer may still try. Everything else means somebody reached them or they're out. */
export const DIALABLE: ContactStatus[] = ["not_called", "no_answer", "voicemail"];

/** The outcome buttons on a contact, in the order Henry uses them. */
export const MANUAL_OUTCOMES: Array<{ status: ContactStatus; label: string; hint: string }> = [
  { status: "spoke", label: "Spoke", hint: "Had a conversation" },
  { status: "follow_up", label: "Follow up", hint: "Call them again" },
  { status: "meeting", label: "Meeting set", hint: "Time is booked" },
  { status: "voicemail", label: "Voicemail", hint: "Left or reached voicemail" },
  { status: "no_answer", label: "No answer", hint: "Rang out or busy" },
  { status: "not_interested", label: "Not interested", hint: "Said no" },
  { status: "wrong_number", label: "Wrong number", hint: "Not this person or farm" },
  { status: "dnc", label: "Do not call", hint: "Never call again" },
];

export function isStatus(value: unknown): value is ContactStatus {
  return typeof value === "string" && value in STATUS_LABEL;
}
