// Turning a Retell webhook into what the dashboard stores: the call record, and
// what it means for the contact. Pure functions, so the tests can hold them.

import type { Call, Contact, ContactPatch, ContactStatus } from "./types.ts";
import { DIALABLE } from "./status.ts";

export type RetellCall = {
  call_id: string;
  agent_id?: string;
  direction?: "inbound" | "outbound";
  from_number?: string;
  to_number?: string;
  call_status?: string;
  start_timestamp?: number;
  end_timestamp?: number;
  duration_ms?: number;
  disconnection_reason?: string;
  transcript?: string;
  recording_url?: string;
  metadata?: Record<string, unknown> | null;
  retell_llm_dynamic_variables?: Record<string, string> | null;
  call_analysis?: {
    call_summary?: string;
    in_voicemail?: boolean;
    user_sentiment?: string;
    call_successful?: boolean;
    custom_analysis_data?: Record<string, unknown> | null;
  } | null;
};

export type RetellEvent = { event: string; call: RetellCall };

/** The note on calls placed from the Script page's test buttons. They ring Henry's phone, never a farmer. */
export const TEST_CALL_NOTE = "Test call from the Script page";

const iso = (ms?: number) => (typeof ms === "number" && ms > 0 ? new Date(ms).toISOString() : null);
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

const NO_CONTACT_REASONS = new Set(["dial_no_answer", "dial_busy", "dial_failed", "voicemail_reached", "registered_call_timeout"]);

/** The call record's columns from any Retell event. Later events fill in more. */
export function callFields(e: RetellEvent): Partial<Call> {
  const c = e.call;
  const custom = c.call_analysis?.custom_analysis_data ?? null;
  const fields: Partial<Call> = {
    retell_call_id: c.call_id,
    direction: c.direction === "inbound" ? "inbound" : "outbound",
    from_number: c.from_number ?? null,
    to_number: c.to_number ?? null,
    status: c.call_status ?? (e.event === "call_started" ? "ongoing" : null),
  };
  if (c.start_timestamp) fields.started_at = iso(c.start_timestamp);
  if (c.end_timestamp) {
    fields.ended_at = iso(c.end_timestamp);
    if (c.start_timestamp) fields.duration_s = Math.max(0, Math.round((c.end_timestamp - c.start_timestamp) / 1000));
  }
  if (c.disconnection_reason) fields.disconnection_reason = c.disconnection_reason;
  if (c.transcript) fields.transcript = c.transcript;
  if (c.recording_url) fields.recording_url = c.recording_url;
  if (c.call_analysis) {
    fields.summary = str(c.call_analysis.call_summary);
    fields.in_voicemail = c.call_analysis.in_voicemail ?? null;
    fields.analysis = { ...(custom ?? {}), user_sentiment: c.call_analysis.user_sentiment ?? null };
    fields.outcome = str(custom?.outcome);
    fields.interest_level = str(custom?.interest_level);
    fields.preferred_times = str(custom?.preferred_times) ?? str(custom?.best_time);
  }
  return fields;
}

/** What a finished AI call (outbound) means for the contact. Null: leave the contact alone. */
export function contactUpdateForAiCall(e: RetellEvent, contact: Pick<Contact, "status" | "dnc">): ContactPatch | null {
  if (e.event !== "call_analyzed" && e.event !== "call_ended") return null;
  const c = e.call;
  const custom = c.call_analysis?.custom_analysis_data ?? {};
  const outcome = str(custom.outcome);
  const times = str(custom.preferred_times);

  // Never undo what Henry (or an earlier call) already settled.
  if (contact.dnc || !DIALABLE.includes(contact.status)) {
    return outcome === "do_not_call" ? dnc("Asked not to be called again (AI call)") : null;
  }

  // call_ended arrives before the analysis; only settle the obvious "never reached anyone" cases there.
  if (e.event === "call_ended") {
    const reason = c.disconnection_reason ?? "";
    if (reason === "voicemail_reached") return { status: "voicemail" };
    if (NO_CONTACT_REASONS.has(reason)) return { status: "no_answer" };
    return null;
  }

  switch (outcome) {
    case "wants_call_with_henry":
      return followUp("Wants a call with Henry", times);
    case "follow_up_later":
    case "callback_requested":
      return followUp("Asked to be called back", times);
    case "not_interested":
      return { status: "not_interested", outcome: "Not interested (AI call)" };
    case "do_not_call":
      return dnc("Asked not to be called again (AI call)");
    case "someone_else_answered":
      // Family or staff picked up and heard the short overview with our number. Anyone at the farm
      // counts, so the AI doesn't call again. If they said when to reach the person, Henry follows up.
      return times ? followUp("Someone else answered and said when to call", times) : { status: "spoke", outcome: "Someone else at the farm heard about Helios (AI call)" };
    case "wrong_person":
      return { status: "wrong_number", outcome: "Wrong person (AI call)" };
    default: {
      const voicemail = c.call_analysis?.in_voicemail || c.disconnection_reason === "voicemail_reached";
      return { status: voicemail ? "voicemail" : "no_answer" };
    }
  }
}

/** A farmer who called our number back always lands on the follow-up list, unless they asked us to stop. */
export function contactUpdateForInbound(e: RetellEvent, contact: Pick<Contact, "status" | "dnc"> | null): ContactPatch | null {
  if (!contact || e.event !== "call_analyzed") return null;
  const outcome = str(e.call.call_analysis?.custom_analysis_data?.outcome);
  if (outcome === "do_not_call") return dnc("Called in and asked not to be called again");
  if (contact.dnc) return null;
  const keep: ContactStatus[] = ["meeting"];
  if (keep.includes(contact.status)) return null;
  const when = new Date(e.call.start_timestamp ?? Date.now()).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Boise" });
  return { status: "follow_up", outcome: `Called us back on ${when}`, follow_up_note: `Called our number back on ${when}` };
}

function followUp(outcome: string, times: string | null): ContactPatch {
  return { status: "follow_up", outcome, follow_up_note: times };
}

function dnc(reason: string): ContactPatch {
  return { status: "dnc", dnc: true, dnc_reason: reason, dnc_at: new Date().toISOString(), outcome: reason };
}
