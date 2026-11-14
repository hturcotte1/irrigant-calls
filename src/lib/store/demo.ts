import "server-only";
import type { Call, CallKind, Contact, ContactFilters, ContactPatch, NewCall, Settings } from "@/lib/types";
import { DIALABLE } from "@/lib/status";
import { PAGE_SIZE, type CallWithContact, type Facets, type Store } from "./types";

// Made-up farms for local development (DEMO_MODE=1). Nothing here is a real
// person; all numbers are 555 numbers.

const FARMS = [
  ["Willow Bend Farms", "Dale", "Rexburg", "ID", "potato", "potatoes, wheat", "about 2,400 acres", "Mountain"],
  ["Cedar Flats Dairy", "Lena", "Jerome", "ID", "dairy", "dairy cows, corn silage", "1,100 cows", "Mountain"],
  ["Hollister Hay Co.", "Mark", "Hermiston", "OR", "alfalfa/hay", "alfalfa hay", "about 900 acres", "Pacific"],
  ["North Fork Seed", "Amy", "Brookings", "SD", "seed", "certified seed wheat, oats", "3 field crops", "Central"],
  ["Prairie Line Farms", "Josh", "Kearney", "NE", "corn/silage", "corn, soybeans", "about 1,600 acres", "Central"],
  ["Sunrise Organic", "Rosa", "Petaluma", "CA", "dairy", "certified organic dairy", "220 cows", "Pacific"],
  ["Blue Gap Ranch", "Tom", "Powell", "WY", "alfalfa/hay", "alfalfa, barley", "about 700 acres", "Mountain"],
  ["Miller Brothers", "Ken", "Othello", "WA", "potato", "potatoes, onions", "about 3,000 acres", "Pacific"],
  ["Stony Creek Farm", "Beth", "Ferndale", "NY", "dairy", "dairy cows", "140 cows", "Eastern"],
  ["Red Butte Hops", "Sam", "Wilder", "ID", "hops", "hops", "about 300 acres", "Mountain"],
  ["Tall Grass Seed", "Nina", "Fargo", "ND", "seed", "certified seed soybeans", "2 field crops", "Central"],
  ["Hartley Family Farms", "Greg", "Garden City", "KS", "corn/silage", "corn, sorghum", "about 2,000 acres", "Central"],
];

const STATUSES: Contact["status"][] = ["not_called", "not_called", "not_called", "no_answer", "voicemail", "follow_up", "meeting", "spoke", "not_interested", "not_called", "follow_up", "dnc"];
const TZ: Record<string, string> = { Mountain: "America/Denver", Pacific: "America/Los_Angeles", Central: "America/Chicago", Eastern: "America/New_York" };

function seed(): { contacts: Contact[]; calls: Call[]; settings: Settings } {
  const now = Date.now();
  const contacts: Contact[] = [];
  for (let i = 0; i < 48; i++) {
    const [farm, first, city, state, segment, crops, size, zone] = FARMS[i % FARMS.length];
    const round = Math.floor(i / FARMS.length);
    const status = STATUSES[i % STATUSES.length];
    const called = status !== "not_called";
    const tier = i < 14 ? "A" : i < 34 ? "B" : "C";
    contacts.push({
      id: `demo-${i + 1}`, lead_id: `IRR-${String(9000 + i)}`, call_no: i + 1, tier, score: 95 - i, farm: round ? `${farm} ${round + 1}` : farm,
      contact_name: i % 9 === 4 ? null : `${first} ${["Hale", "Ruiz", "Olsen", "Park"][i % 4]}`, first_name: i % 9 === 4 ? null : first,
      role: i % 3 ? "Grower contact (directory)" : "Certification contact (USDA organic list)",
      phone: `+1208555${String(1000 + i).padStart(4, "0")}`, phone2: i % 7 === 0 ? `+1208555${String(2000 + i)}` : null,
      time_zone: zone, tz: TZ[zone], their_time_vs_boise: "same as Boise", city, county: null, state, segment, crops, size,
      irrigation: i % 4 === 0 ? "center pivots, some drip" : null, tech: i % 5 === 0 ? "soil moisture probes" : null,
      opening_line: `Saw your ${segment === "dairy" ? "dairy" : `${crops.split(",")[0]} operation`} near ${city}`,
      why_fit: "Irrigated acres, active grower", email: null, website: null,
      number_check: i % 11 === 6 ? "One third-party listing: confirm on call" : "Verified: official directory",
      number_source: "Example directory", notes_for_caller: i % 2 ? "Listed in a state grower directory" : null, raw: null,
      consent_source: "Website form signup", consent_recorded_at: new Date(now).toISOString(),
      ai_allowed: i % 11 !== 6, ai_block_reason: i % 11 === 6 ? "Number came from one third-party listing: confirm it yourself first" : null,
      dnc: status === "dnc", dnc_at: status === "dnc" ? new Date(now - 86_400_000).toISOString() : null,
      dnc_reason: status === "dnc" ? "Asked not to be called again (AI call)" : null, status,
      spoke_with: status === "spoke" || status === "meeting" ? first : null,
      outcome: status === "follow_up" ? "Wants a call with Henry" : status === "meeting" ? "Call with Henry Tuesday 10am" : null,
      follow_up_date: status === "follow_up" ? new Date(now + (i % 3 - 1) * 86_400_000).toISOString().slice(0, 10) : status === "meeting" ? new Date(now + 3 * 86_400_000).toISOString().slice(0, 10) : null,
      follow_up_note: status === "follow_up" ? "Mornings before 9" : null, caller_notes: null,
      attempts: called ? 1 + (i % 2) : 0, last_called_at: called ? new Date(now - (i % 5) * 3_600_000).toISOString() : null,
      last_call_kind: called ? (i % 2 ? "ai" : "manual") : null, next_attempt_after: null,
      created_at: new Date(now - 7 * 86_400_000).toISOString(), updated_at: new Date(now - i * 60_000).toISOString(),
    });
  }
  const calls: Call[] = contacts.filter((c) => c.status !== "not_called").map((c, i) => ({
    id: `call-${i + 1}`, contact_id: c.id, kind: c.last_call_kind ?? "ai", direction: "outbound", retell_call_id: `retell-${i + 1}`,
    from_number: "+12089283200", to_number: c.phone, started_at: c.last_called_at, ended_at: c.last_called_at, duration_s: 40 + i * 13,
    status: "ended", disconnection_reason: "user_hangup", in_voicemail: c.status === "voicemail",
    outcome: c.status === "follow_up" ? "wants_call_with_henry" : c.status === "not_interested" ? "not_interested" : "no_conversation",
    interest_level: c.status === "follow_up" ? "high" : "none", preferred_times: c.follow_up_note,
    summary: c.status === "follow_up" ? `${c.first_name ?? "The farmer"} grows ${c.crops}, decides watering by feel and a weather app, and wants a call with Henry.` : "Short call.",
    transcript: "Agent: Hi, is this the right farm?\nUser: Yep.\nAgent: Great! ...", recording_url: null,
    analysis: { crops: c.crops, acres: c.size, irrigation: c.irrigation }, notes: null, handled: false, created_at: c.last_called_at ?? new Date(now).toISOString(),
  }));
  calls.push({
    id: "call-in-1", contact_id: contacts[2].id, kind: "inbound", direction: "inbound", retell_call_id: "retell-in-1",
    from_number: contacts[2].phone, to_number: "+12089283200", started_at: new Date(now - 40 * 60_000).toISOString(),
    ended_at: null, duration_s: 9, status: "ended", disconnection_reason: "agent_hangup", in_voicemail: false, outcome: "callback_requested",
    interest_level: null, preferred_times: null, summary: "Caller returned a missed call.", transcript: null, recording_url: null,
    analysis: null, notes: null, handled: false, created_at: new Date(now - 40 * 60_000).toISOString(),
  });
  const settings: Settings = { id: 1, ai_enabled: false, daily_cap: 50, calls_per_run: 1, call_start_hour: 10, call_end_hour: 19, call_days: [1, 2, 3, 4, 5], max_attempts: 3, retry_gap_hours: 48, updated_at: new Date(now).toISOString() };
  return { contacts, calls, settings };
}

const state = (globalThis as unknown as { __demoStore?: ReturnType<typeof seed> }).__demoStore ??= seed();
const pick = (c: Contact | undefined): CallWithContact["contact"] => (c ? { id: c.id, farm: c.farm, contact_name: c.contact_name, phone: c.phone, city: c.city, state: c.state } : null);
const sortContacts = (a: Contact, b: Contact) => (a.tier ?? "Z").localeCompare(b.tier ?? "Z") || (b.score ?? 0) - (a.score ?? 0) || (a.call_no ?? 0) - (b.call_no ?? 0);
const dialable = (c: Contact) => c.ai_allowed && c.consent_source && !c.dnc && DIALABLE.includes(c.status) && c.attempts < state.settings.max_attempts;

export class DemoStore implements Store {
  async listContacts(f: ContactFilters) {
    const q = (f.q ?? "").toLowerCase().trim();
    const rows = state.contacts.filter((c) =>
      (!q || [c.farm, c.contact_name, c.city, c.lead_id, c.phone].some((v) => v?.toLowerCase().includes(q))) &&
      (!f.tier || c.tier === f.tier) && (!f.segment || c.segment === f.segment) && (!f.state || c.state === f.state) &&
      (!f.status || c.status === f.status) && (f.who !== "manual" || !c.ai_allowed) && (f.who !== "ai" || c.ai_allowed),
    ).sort(sortContacts);
    const page = Math.max(0, f.page ?? 0);
    return { rows: rows.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE), total: rows.length };
  }
  async facets(): Promise<Facets> {
    const uniq = (k: keyof Contact) => [...new Set(state.contacts.map((c) => c[k] as string).filter(Boolean))].sort();
    return { tiers: uniq("tier"), segments: uniq("segment"), states: uniq("state") };
  }
  async statusCounts() {
    return state.contacts.reduce<Record<string, number>>((acc, c) => ({ ...acc, [c.status]: (acc[c.status] ?? 0) + 1 }), {});
  }
  async getContact(id: string) { return state.contacts.find((c) => c.id === id) ?? null; }
  async findContactByPhone(phone: string) { return state.contacts.find((c) => c.phone === phone || c.phone2 === phone) ?? null; }
  async updateContact(id: string, patch: ContactPatch) {
    const c = state.contacts.find((x) => x.id === id);
    if (c) Object.assign(c, patch, { updated_at: new Date().toISOString() });
  }
  async allContacts() { return [...state.contacts].sort((a, b) => (a.call_no ?? 0) - (b.call_no ?? 0)); }
  async callsForContact(contactId: string) {
    return state.calls.filter((c) => c.contact_id === contactId).sort((a, b) => b.created_at.localeCompare(a.created_at));
  }
  async insertCall(call: NewCall) {
    const full = { id: `call-${state.calls.length + 1}-${Date.now()}`, contact_id: null, retell_call_id: null, from_number: null, to_number: null, started_at: null, ended_at: null, duration_s: null, status: null, disconnection_reason: null, in_voicemail: null, outcome: null, interest_level: null, preferred_times: null, summary: null, transcript: null, recording_url: null, analysis: null, notes: null, handled: false, created_at: new Date().toISOString(), ...call } as Call;
    state.calls.push(full);
    return full;
  }
  async getCallByRetellId(retellId: string) { return state.calls.find((c) => c.retell_call_id === retellId) ?? null; }
  async updateCall(id: string, patch: Partial<Call>) {
    const c = state.calls.find((x) => x.id === id);
    if (c) Object.assign(c, patch);
  }
  async recentCalls(kind: CallKind | null, limit: number) {
    return state.calls.filter((c) => !kind || c.kind === kind).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, limit)
      .map((c) => ({ ...c, contact: pick(state.contacts.find((x) => x.id === c.contact_id)) }));
  }
  async inboundUnhandled() {
    return (await this.recentCalls("inbound", 200)).filter((c) => !c.handled);
  }
  async markCallHandled(id: string) { await this.updateCall(id, { handled: true }); }
  async followUps() {
    return state.contacts.filter((c) => c.status === "follow_up" || c.status === "meeting")
      .sort((a, b) => (a.follow_up_date ?? "9999").localeCompare(b.follow_up_date ?? "9999"));
  }
  async getSettings() { return state.settings; }
  async updateSettings(patch: Partial<Settings>) { Object.assign(state.settings, patch, { updated_at: new Date().toISOString() }); return state.settings; }
  async claimContactsForAi() { return []; } // the demo never places calls
  async releaseClaim() {}
  async aiCallsSince(isoTime: string) { return state.calls.filter((c) => c.kind === "ai" && c.created_at >= isoTime).length; }
  async aiQueuePreview(limit: number) { return state.contacts.filter(dialable).sort(sortContacts).slice(0, limit); }
  async aiQueueSize() { return state.contacts.filter(dialable).length; }
}
