import { test } from "node:test";
import assert from "node:assert/strict";

import { signRetellBody, verifyRetellSignature } from "../src/lib/retell-signature.ts";
import { callFields, contactUpdateForAiCall, contactUpdateForInbound, type RetellEvent } from "../src/lib/retell-map.ts";
import { contactsToCsv, csvCell, SHEET_COLUMNS } from "../src/lib/export-csv.ts";
import { isWithinCallingHours, startOfDay } from "../src/lib/time.ts";
import { callVariables, spokenFarm, spokenLocation } from "../src/lib/call-vars.ts";
import type { Contact } from "../src/lib/types.ts";

const contact = (over: Partial<Contact> = {}): Contact => ({
  id: "c1", lead_id: "IRR-0001", call_no: 1, tier: "A", score: 80, farm: "Lakeview Farms", contact_name: "Marlin Miller",
  first_name: "Marlin", role: "Grower contact (directory)", phone: "+12085550100", phone2: null, time_zone: "Mountain",
  tz: "America/Denver", their_time_vs_boise: "same as Boise", city: "Kuna", county: "Ada", state: "ID", segment: "potato",
  crops: "potatoes, sugar beets", size: "about 1,200 acres", irrigation: null, tech: null, opening_line: "Saw your potato operation near Kuna",
  why_fit: null, email: null, website: null, number_check: "Verified: official directory", number_source: "directory",
  notes_for_caller: null, raw: null, consent_source: "Website form signup", consent_recorded_at: null, ai_allowed: true,
  ai_block_reason: null, dnc: false, dnc_at: null, dnc_reason: null, status: "not_called", spoke_with: null, outcome: null,
  follow_up_date: null, follow_up_note: null, caller_notes: null, attempts: 0, last_called_at: null, last_call_kind: null,
  next_attempt_after: null, created_at: "2026-11-14T00:00:00Z", updated_at: "2026-11-14T00:00:00Z", ...over,
});

const analyzed = (custom: Record<string, unknown>, extra: Partial<RetellEvent["call"]> = {}): RetellEvent => ({
  event: "call_analyzed",
  call: { call_id: "call_1", direction: "outbound", start_timestamp: 1, end_timestamp: 61_001, call_analysis: { custom_analysis_data: custom }, ...extra },
});

test("a correctly signed webhook passes; tampering, old timestamps and wrong keys fail", () => {
  const body = JSON.stringify({ event: "call_ended", call: { call_id: "x" } });
  const now = 1_800_000_000_000;
  const header = signRetellBody(body, "key_123", now);
  assert.equal(verifyRetellSignature(body, "key_123", header, now + 1000), true);
  assert.equal(verifyRetellSignature(body + " ", "key_123", header, now), false);
  assert.equal(verifyRetellSignature(body, "other_key", header, now), false);
  assert.equal(verifyRetellSignature(body, "key_123", header, now + 6 * 60 * 1000), false);
  assert.equal(verifyRetellSignature(body, "key_123", null, now), false);
  assert.equal(verifyRetellSignature(body, "key_123", "garbage", now), false);
});

test("an interested farmer lands on the follow-up list with their preferred times", () => {
  const patch = contactUpdateForAiCall(analyzed({ outcome: "wants_call_with_henry", preferred_times: "Tuesday mornings" }), contact());
  assert.deepEqual(patch, { status: "follow_up", outcome: "Wants a call with Henry", follow_up_note: "Tuesday mornings" });
});

test("do-not-call always sticks, even over a settled status", () => {
  const patch = contactUpdateForAiCall(analyzed({ outcome: "do_not_call" }), contact({ status: "meeting" }));
  assert.equal(patch?.status, "dnc");
  assert.equal(patch?.dnc, true);
});

test("a late webhook never undoes what Henry already logged", () => {
  assert.equal(contactUpdateForAiCall(analyzed({ outcome: "not_interested" }), contact({ status: "follow_up" })), null);
  const ended: RetellEvent = { event: "call_ended", call: { call_id: "c", disconnection_reason: "dial_no_answer" } };
  assert.equal(contactUpdateForAiCall(ended, contact({ status: "meeting" })), null);
});

test("unanswered and voicemail calls stay dialable", () => {
  const vm: RetellEvent = { event: "call_ended", call: { call_id: "c", disconnection_reason: "voicemail_reached" } };
  assert.deepEqual(contactUpdateForAiCall(vm, contact()), { status: "voicemail" });
  const noAnswer: RetellEvent = { event: "call_ended", call: { call_id: "c", disconnection_reason: "dial_no_answer" } };
  assert.deepEqual(contactUpdateForAiCall(noAnswer, contact()), { status: "no_answer" });
  assert.deepEqual(contactUpdateForAiCall(analyzed({ outcome: "no_conversation" }), contact()), { status: "no_answer" });
});

test("call fields pick up duration, summary and the custom results", () => {
  const f = callFields(analyzed({ outcome: "follow_up_later", interest_level: "medium", preferred_times: "next week" }, { call_analysis: { call_summary: "Busy, call next week", custom_analysis_data: { outcome: "follow_up_later", interest_level: "medium", preferred_times: "next week" } } }));
  assert.equal(f.duration_s, 61);
  assert.equal(f.summary, "Busy, call next week");
  assert.equal(f.outcome, "follow_up_later");
  assert.equal(f.preferred_times, "next week");
});

test("a farmer who calls back goes on the follow-up list unless they asked us to stop", () => {
  const e: RetellEvent = { event: "call_analyzed", call: { call_id: "in1", direction: "inbound", start_timestamp: Date.UTC(2026, 10, 16, 18), call_analysis: { custom_analysis_data: { outcome: "callback_requested" } } } };
  assert.equal(contactUpdateForInbound(e, contact())?.status, "follow_up");
  const stop: RetellEvent = { ...e, call: { ...e.call, call_analysis: { custom_analysis_data: { outcome: "do_not_call" } } } };
  assert.equal(contactUpdateForInbound(stop, contact())?.status, "dnc");
  assert.equal(contactUpdateForInbound(e, null), null);
});

test("the export keeps the sheet's 33 columns in order and fills the results", () => {
  const csv = contactsToCsv([contact({ status: "follow_up", outcome: "Wants a call with Henry", last_called_at: "2026-11-16T18:00:00Z", raw: { "Call #": "1", "Farm / operation": "Lakeview Farms" } })]);
  const [header, row] = csv.replace(/^﻿/, "").trim().split("\r\n");
  assert.deepEqual(header.split(",").slice(0, 33), SHEET_COLUMNS.map((c) => csvCell(c)));
  assert.match(row, /Follow up/);
  assert.match(row, /2026-11-16/);
  assert.equal(csvCell('He said "maybe", call back'), '"He said ""maybe"", call back"');
  assert.equal(csvCell("=SUM(A1)"), "'=SUM(A1)");
  assert.equal(csvCell("+12085550100"), "+12085550100");
});

test("calling hours are checked in the contact's own time zone", () => {
  const s = { call_days: [1, 2, 3, 4, 5], call_start_hour: 10, call_end_hour: 19 };
  const mondayNoonDenver = new Date("2026-11-16T19:00:00Z"); // 12:00 in Denver, 2pm in New York
  assert.equal(isWithinCallingHours("America/Denver", s, mondayNoonDenver), true);
  assert.equal(isWithinCallingHours("America/New_York", s, new Date("2026-11-16T14:30:00Z")), false); // 9:30am NY
  assert.equal(isWithinCallingHours("America/Denver", s, new Date("2026-11-15T19:00:00Z")), false); // Sunday
  assert.equal(isWithinCallingHours(null, s, mondayNoonDenver), false);
});

test("the Boise day starts at local midnight", () => {
  const start = startOfDay("America/Boise", new Date("2026-11-16T19:00:00Z"));
  assert.equal(start.toISOString(), "2026-11-16T07:00:00.000Z");
});

test("what the agent is told: farm name only when it isn't the person's own name, places said in full", () => {
  assert.equal(spokenFarm({ farm: "John Carroll", contact_name: "John Carroll" }), "");
  assert.equal(spokenFarm({ farm: "Heglar Creek Farms (Heglar Creek Dairy LLC)", contact_name: "Pat" }), "Heglar Creek Farms");
  assert.equal(spokenLocation({ city: "Kuna", county: "Ada", state: "ID" }), "Kuna, Idaho");
  assert.equal(spokenLocation({ city: null, county: "Humboldt", state: "CA" }), "Humboldt County, California");
  const v = callVariables(contact());
  assert.equal(v.first_name, "Marlin");
  assert.equal(v.farm_name, "Lakeview Farms");
  assert.match(v.known_context, /potatoes, sugar beets/);
  assert.doesNotMatch(v.known_context, /Verified: official directory/);
});
