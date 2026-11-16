import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Call, CallKind, Contact, ContactFilters, ContactPatch, NewCall, NewScriptVersion, ScriptVersion, Settings } from "@/lib/types";
import { PAGE_SIZE, type CallWithContact, type Facets, type Store } from "./types";

// List views skip the big `raw` column.
const LIST_COLUMNS =
  "id,lead_id,call_no,tier,score,farm,contact_name,first_name,role,phone,phone2,time_zone,tz,city,county,state,segment,crops,size," +
  "opening_line,number_check,ai_allowed,ai_block_reason,dnc,status,spoke_with,outcome,follow_up_date,follow_up_note,attempts," +
  "last_called_at,last_call_kind,next_attempt_after,consent_source,created_at,updated_at";
const CONTACT_EMBED = "contact:contacts(id,farm,contact_name,phone,city,state)";

function fail(what: string, error: { message: string } | null): never {
  throw new Error(`${what}: ${error?.message ?? "unknown error"}`);
}

/** Search text goes into a PostgREST `or` filter, so keep only characters that can't change its meaning. */
function searchTerm(q: string): string {
  return q.replace(/[^\p{L}\p{N}\s.'+@-]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 60);
}

export class SupabaseStore implements Store {
  private db: SupabaseClient;

  constructor(url: string, key: string) {
    this.db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  }

  async listContacts(f: ContactFilters) {
    const page = Math.max(0, f.page ?? 0);
    let query = this.db.from("contacts").select(LIST_COLUMNS, { count: "exact" });
    const q = searchTerm(f.q ?? "");
    if (q) {
      const like = `%${q}%`;
      const digits = q.replace(/\D/g, "");
      const ors = [`farm.ilike.${like}`, `contact_name.ilike.${like}`, `city.ilike.${like}`, `county.ilike.${like}`, `lead_id.ilike.${like}`];
      if (digits.length >= 4) ors.push(`phone.ilike.%${digits}%`);
      query = query.or(ors.join(","));
    }
    if (f.tier) query = query.eq("tier", f.tier);
    if (f.segment) query = query.eq("segment", f.segment);
    if (f.state) query = query.eq("state", f.state);
    if (f.status) query = query.eq("status", f.status);
    if (f.who === "manual") query = query.eq("ai_allowed", false);
    if (f.who === "ai") query = query.eq("ai_allowed", true);
    const { data, error, count } = await query
      .order("tier", { ascending: true, nullsFirst: false })
      .order("score", { ascending: false, nullsFirst: false })
      .order("call_no", { ascending: true, nullsFirst: false })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
    if (error) fail("Loading contacts", error);
    return { rows: (data ?? []) as unknown as Contact[], total: count ?? 0 };
  }

  async facets(): Promise<Facets> {
    const { data, error } = await this.db.rpc("contact_facets");
    if (error) fail("Loading filters", error);
    return data as Facets;
  }

  async statusCounts() {
    const { data, error } = await this.db.rpc("status_counts");
    if (error) fail("Counting contacts", error);
    return (data ?? {}) as Record<string, number>;
  }

  async getContact(id: string) {
    const { data, error } = await this.db.from("contacts").select("*").eq("id", id).maybeSingle();
    if (error) fail("Loading contact", error);
    return data as Contact | null;
  }

  async findContactByPhone(phone: string) {
    if (!phone) return null;
    const { data, error } = await this.db.from("contacts").select("*").or(`phone.eq.${phone},phone2.eq.${phone}`).limit(1);
    if (error) fail("Matching caller", error);
    return (data?.[0] as Contact) ?? null;
  }

  async updateContact(id: string, patch: ContactPatch) {
    const { error } = await this.db.from("contacts").update(patch).eq("id", id);
    if (error) fail("Saving contact", error);
  }

  async allContacts() {
    const out: Contact[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await this.db.from("contacts").select("*").order("call_no", { ascending: true }).range(from, from + 999);
      if (error) fail("Exporting contacts", error);
      out.push(...((data ?? []) as Contact[]));
      if (!data || data.length < 1000) return out;
    }
  }

  async callsForContact(contactId: string) {
    const { data, error } = await this.db.from("calls").select("*").eq("contact_id", contactId).order("created_at", { ascending: false });
    if (error) fail("Loading calls", error);
    return (data ?? []) as Call[];
  }

  async insertCall(call: NewCall) {
    const { data, error } = await this.db.from("calls").insert(call).select("*").single();
    if (error) fail("Saving call", error);
    return data as Call;
  }

  async getCallByRetellId(retellId: string) {
    const { data, error } = await this.db.from("calls").select("*").eq("retell_call_id", retellId).maybeSingle();
    if (error) fail("Loading call", error);
    return data as Call | null;
  }

  async updateCall(id: string, patch: Partial<Call>) {
    const { error } = await this.db.from("calls").update(patch).eq("id", id);
    if (error) fail("Saving call", error);
  }

  async recentCalls(kind: CallKind | null, limit: number) {
    let query = this.db.from("calls").select(`*,${CONTACT_EMBED}`);
    if (kind) query = query.eq("kind", kind);
    const { data, error } = await query.order("created_at", { ascending: false }).limit(limit);
    if (error) fail("Loading calls", error);
    return (data ?? []) as unknown as CallWithContact[];
  }

  async inboundUnhandled() {
    const { data, error } = await this.db
      .from("calls")
      .select(`*,${CONTACT_EMBED}`)
      .eq("kind", "inbound")
      .eq("handled", false)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) fail("Loading callbacks", error);
    return (data ?? []) as unknown as CallWithContact[];
  }

  async markCallHandled(id: string) {
    const { error } = await this.db.from("calls").update({ handled: true }).eq("id", id);
    if (error) fail("Saving call", error);
  }

  async followUps() {
    const { data, error } = await this.db
      .from("contacts")
      .select(LIST_COLUMNS)
      .in("status", ["follow_up", "meeting"])
      .order("follow_up_date", { ascending: true, nullsFirst: false })
      .order("updated_at", { ascending: false })
      .limit(500);
    if (error) fail("Loading follow-ups", error);
    return (data ?? []) as unknown as Contact[];
  }

  async getSettings() {
    const { data, error } = await this.db.from("settings").select("*").eq("id", 1).single();
    if (error) fail("Loading settings", error);
    return data as Settings;
  }

  async updateSettings(patch: Partial<Settings>) {
    const { data, error } = await this.db.from("settings").update(patch).eq("id", 1).select("*").single();
    if (error) fail("Saving settings", error);
    return data as Settings;
  }

  async claimContactsForAi(maxCount: number) {
    const { data, error } = await this.db.rpc("claim_contacts_for_ai", { max_count: maxCount });
    if (error) fail("Picking who to call", error);
    return (data ?? []) as Contact[];
  }

  async releaseClaim(contactId: string) {
    // The call never went out: give back the attempt and let it be tried again soon.
    const { data, error } = await this.db.from("contacts").select("attempts").eq("id", contactId).single();
    if (error) fail("Releasing contact", error);
    const attempts = Math.max(0, ((data as { attempts: number }).attempts ?? 1) - 1);
    const retry = new Date(Date.now() + 30 * 60_000).toISOString();
    const upd = await this.db.from("contacts").update({ attempts, next_attempt_after: retry }).eq("id", contactId);
    if (upd.error) fail("Releasing contact", upd.error);
  }

  async aiCallsSince(isoTime: string) {
    const { count, error } = await this.db.from("calls").select("id", { count: "exact", head: true }).eq("kind", "ai").gte("created_at", isoTime);
    if (error) fail("Counting today's calls", error);
    return count ?? 0;
  }

  async aiQueuePreview(limit: number) {
    const { data, error } = await this.db.rpc("ai_queue_preview", { max_count: limit });
    if (error) fail("Loading the queue", error);
    return (data ?? []) as Contact[];
  }

  async aiQueueSize() {
    const { data, error } = await this.db.rpc("ai_queue_size");
    if (error) fail("Counting the queue", error);
    return Number(data ?? 0);
  }

  async listScriptVersions(limit: number) {
    const { data, error } = await this.db.from("script_versions").select("*").order("created_at", { ascending: false }).limit(limit);
    if (error) fail("Loading script history", error);
    return (data ?? []) as ScriptVersion[];
  }

  async getScriptVersion(id: string) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return null;
    const { data, error } = await this.db.from("script_versions").select("*").eq("id", id).maybeSingle();
    if (error) fail("Loading script version", error);
    return data as ScriptVersion | null;
  }

  async insertScriptVersion(v: NewScriptVersion) {
    const { error } = await this.db.from("script_versions").insert(v);
    if (error) fail("Saving script history", error);
  }
}
