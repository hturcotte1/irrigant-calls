// Shapes shared by the database, the pages and the dialer. Field names match
// the columns in supabase/migrations.

export type ContactStatus =
  | "not_called"
  | "no_answer"
  | "voicemail"
  | "spoke"
  | "follow_up"
  | "meeting"
  | "not_interested"
  | "wrong_number"
  | "dnc";

export type Contact = {
  id: string;
  lead_id: string;
  call_no: number | null;
  tier: string | null;
  score: number | null;
  farm: string;
  contact_name: string | null;
  first_name: string | null;
  role: string | null;
  phone: string;
  phone2: string | null;
  time_zone: string | null;
  tz: string | null;
  their_time_vs_boise: string | null;
  city: string | null;
  county: string | null;
  state: string | null;
  segment: string | null;
  crops: string | null;
  size: string | null;
  irrigation: string | null;
  tech: string | null;
  opening_line: string | null;
  why_fit: string | null;
  email: string | null;
  website: string | null;
  number_check: string | null;
  number_source: string | null;
  notes_for_caller: string | null;
  raw: Record<string, string> | null;
  consent_source: string | null;
  consent_recorded_at: string | null;
  ai_allowed: boolean;
  ai_block_reason: string | null;
  dnc: boolean;
  dnc_at: string | null;
  dnc_reason: string | null;
  status: ContactStatus;
  spoke_with: string | null;
  outcome: string | null;
  follow_up_date: string | null;
  follow_up_note: string | null;
  caller_notes: string | null;
  attempts: number;
  last_called_at: string | null;
  last_call_kind: "ai" | "manual" | "inbound" | null;
  next_attempt_after: string | null;
  created_at: string;
  updated_at: string;
};

export type CallKind = "ai" | "manual" | "inbound";

export type Call = {
  id: string;
  contact_id: string | null;
  kind: CallKind;
  direction: "outbound" | "inbound";
  retell_call_id: string | null;
  from_number: string | null;
  to_number: string | null;
  started_at: string | null;
  ended_at: string | null;
  duration_s: number | null;
  status: string | null;
  disconnection_reason: string | null;
  in_voicemail: boolean | null;
  outcome: string | null;
  interest_level: string | null;
  preferred_times: string | null;
  summary: string | null;
  transcript: string | null;
  recording_url: string | null;
  analysis: Record<string, unknown> | null;
  notes: string | null;
  handled: boolean;
  created_at: string;
};

export type Settings = {
  id: 1;
  ai_enabled: boolean;
  daily_cap: number;
  calls_per_run: number;
  call_start_hour: number;
  call_end_hour: number;
  call_days: number[];
  max_attempts: number;
  retry_gap_hours: number;
  test_phone: string | null;
  updated_at: string;
};

/** One saved version of everything the AI says. Callback fields are blank in versions saved before they existed. */
export type ScriptVersion = {
  id: string;
  prompt: string;
  voicemail: string | null;
  callback_greeting: string | null;
  callback_prompt: string | null;
  note: string | null;
  created_at: string;
};

export type NewScriptVersion = Omit<ScriptVersion, "id" | "created_at">;

export type ContactFilters = {
  q?: string;
  tier?: string;
  segment?: string;
  state?: string;
  status?: string;
  who?: "all" | "ai" | "manual";
  page?: number;
};

export type ContactPatch = Partial<
  Pick<
    Contact,
    | "status"
    | "spoke_with"
    | "outcome"
    | "follow_up_date"
    | "follow_up_note"
    | "caller_notes"
    | "dnc"
    | "dnc_at"
    | "dnc_reason"
    | "attempts"
    | "last_called_at"
    | "last_call_kind"
    | "next_attempt_after"
    | "ai_allowed"
    | "ai_block_reason"
  >
>;

export type NewCall = Partial<Omit<Call, "id" | "created_at">> & Pick<Call, "kind" | "direction">;

/** What the script editor gets back when a save doesn't go through: why, and everything typed, so nothing is lost. */
export type ScriptFormState = { error: string | null; notice: string | null; values: Record<string, string> | null; at: number };
