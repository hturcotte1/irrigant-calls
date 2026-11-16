import type { Call, CallKind, Contact, ContactFilters, ContactPatch, NewCall, NewScriptVersion, ScriptVersion, Settings } from "@/lib/types";

export const PAGE_SIZE = 50;

export type CallWithContact = Call & { contact: Pick<Contact, "id" | "farm" | "contact_name" | "phone" | "city" | "state"> | null };

export type Facets = { tiers: string[]; segments: string[]; states: string[] };

/** Everything the pages, the dialer and the webhook need from storage. */
export interface Store {
  listContacts(filters: ContactFilters): Promise<{ rows: Contact[]; total: number }>;
  facets(): Promise<Facets>;
  statusCounts(): Promise<Record<string, number>>;
  getContact(id: string): Promise<Contact | null>;
  findContactByPhone(phone: string): Promise<Contact | null>;
  updateContact(id: string, patch: ContactPatch): Promise<void>;
  allContacts(): Promise<Contact[]>;

  callsForContact(contactId: string): Promise<Call[]>;
  insertCall(call: NewCall): Promise<Call>;
  getCallByRetellId(retellId: string): Promise<Call | null>;
  updateCall(id: string, patch: Partial<Call>): Promise<void>;
  recentCalls(kind: CallKind | null, limit: number): Promise<CallWithContact[]>;
  inboundUnhandled(): Promise<CallWithContact[]>;
  markCallHandled(id: string): Promise<void>;

  followUps(): Promise<Contact[]>;

  getSettings(): Promise<Settings>;
  updateSettings(patch: Partial<Settings>): Promise<Settings>;
  claimContactsForAi(maxCount: number): Promise<Contact[]>;
  releaseClaim(contactId: string): Promise<void>;
  aiCallsSince(isoTime: string): Promise<number>;
  aiQueuePreview(limit: number): Promise<Contact[]>;
  aiQueueSize(): Promise<number>;

  listScriptVersions(limit: number): Promise<ScriptVersion[]>;
  getScriptVersion(id: string): Promise<ScriptVersion | null>;
  insertScriptVersion(v: NewScriptVersion): Promise<void>;
}
