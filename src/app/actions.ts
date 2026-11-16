"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prettyPhone } from "@/components/ui";
import { callVariables } from "@/lib/call-vars";
import { runDialer } from "@/lib/dialer";
import { env } from "@/lib/env";
import { getAgentScript, getTestAgentScript, placeCall, saveAgentScript, saveTestAgentScript, type AgentScript, type LiveScript, type TestScript } from "@/lib/retell-api";
import { buildSections, editableSections, editableText, finalScript, honestyProblem, serializeScript, type ScriptSection, type SectionInput } from "@/lib/script";
import { SESSION_COOKIE, SESSION_DAYS, isValidSessionToken, makeSessionToken, passwordMatches } from "@/lib/session";
import { MANUAL_OUTCOMES, STATUS_LABEL, isStatus } from "@/lib/status";
import { getStore } from "@/lib/store";
import type { Store } from "@/lib/store/types";
import { shortDate } from "@/lib/time";
import type { Contact, ContactPatch, NewScriptVersion, ScriptFormState, Settings } from "@/lib/types";

const text = (form: FormData, key: string, max = 2000) => String(form.get(key) ?? "").trim().slice(0, max);
const safeNext = (next: string) => (next.startsWith("/") && !next.startsWith("//") ? next : "/");

/** Server actions are reachable by POST, so each one checks the session itself too. */
async function requireSession() {
  const jar = await cookies();
  if (!isValidSessionToken(jar.get(SESSION_COOKIE)?.value)) redirect("/login");
}

export async function signIn(form: FormData) {
  const next = safeNext(text(form, "next", 300));
  if (!passwordMatches(text(form, "password", 200))) {
    await new Promise((r) => setTimeout(r, 600)); // slow down guessing
    redirect(`/login?error=1${next !== "/" ? `&next=${encodeURIComponent(next)}` : ""}`);
  }
  const jar = await cookies();
  jar.set(SESSION_COOKIE, makeSessionToken(), {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: SESSION_DAYS * 86_400,
  });
  redirect(next);
}

export async function signOut() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  redirect("/login");
}

export async function logCall(form: FormData) {
  await requireSession();
  const store = getStore();
  const id = text(form, "contactId", 100);
  const status = text(form, "status", 40);
  const contact = await store.getContact(id);
  if (!contact) redirect("/");
  if (!isStatus(status) || !MANUAL_OUTCOMES.some((o) => o.status === status)) redirect(`/contacts/${id}?error=outcome`);

  const now = new Date();
  const day = now.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Boise" });
  const notes = text(form, "notes");
  const spokeWith = text(form, "spokeWith", 120);
  const nextStep = text(form, "nextStep", 300);
  const followUpDate = /^\d{4}-\d{2}-\d{2}$/.test(text(form, "followUpDate", 10)) ? text(form, "followUpDate", 10) : null;

  const patch: ContactPatch = {
    status,
    last_called_at: now.toISOString(),
    last_call_kind: "manual",
    outcome: nextStep || STATUS_LABEL[status],
    follow_up_date: followUpDate ?? (status === "follow_up" || status === "meeting" ? contact.follow_up_date : null),
  };
  if (spokeWith) patch.spoke_with = spokeWith;
  if (notes) patch.caller_notes = [contact.caller_notes, `${day}: ${notes}`].filter(Boolean).join("\n");
  if (status === "dnc") Object.assign(patch, { dnc: true, dnc_at: now.toISOString(), dnc_reason: notes || "Marked do not call by Henry" });

  await store.insertCall({
    contact_id: id, kind: "manual", direction: "outbound", status: "logged", outcome: status, to_number: contact.phone,
    started_at: now.toISOString(), notes: [nextStep, notes].filter(Boolean).join(" · ") || null,
  });
  await store.updateContact(id, patch);
  revalidatePath("/", "layout");
  redirect(`/contacts/${id}?saved=1`);
}

export async function markCallHandled(form: FormData) {
  await requireSession();
  await getStore().markCallHandled(text(form, "callId", 100));
  revalidatePath("/", "layout");
}

export async function setAiEnabled(form: FormData) {
  await requireSession();
  await getStore().updateSettings({ ai_enabled: text(form, "on", 5) === "1" });
  revalidatePath("/", "layout");
}

export async function saveAiSettings(form: FormData) {
  await requireSession();
  const num = (key: string, min: number, max: number, fallback: number) => {
    const n = Math.round(Number(form.get(key)));
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
  };
  const current = await getStore().getSettings();
  const start = num("call_start_hour", 0, 23, current.call_start_hour);
  const end = num("call_end_hour", start + 1, 24, current.call_end_hour);
  const days = form.getAll("call_days").map(Number).filter((d) => d >= 1 && d <= 7);
  const patch: Partial<Settings> = {
    daily_cap: num("daily_cap", 0, 500, current.daily_cap),
    calls_per_run: num("calls_per_run", 1, 5, current.calls_per_run),
    call_start_hour: start,
    call_end_hour: end,
    call_days: days.length ? [...new Set(days)].sort() : current.call_days,
    max_attempts: num("max_attempts", 1, 10, current.max_attempts),
    retry_gap_hours: num("retry_gap_hours", 1, 336, current.retry_gap_hours),
  };
  await getStore().updateSettings(patch);
  revalidatePath("/ai");
  redirect("/ai?saved=1");
}

export async function runDialerNow() {
  await requireSession();
  const run = await runDialer();
  const msg = run.placed.length
    ? `Placed ${run.placed.length} call${run.placed.length > 1 ? "s" : ""}`
    : run.failed.length
      ? `Retell refused: ${run.failed[0]}`
      : run.uncertain.length
        ? `Unclear whether a call went out: ${run.uncertain[0]}`
        : run.reason ?? "Nothing to do";
  revalidatePath("/", "layout");
  redirect(`/ai?ran=${encodeURIComponent(msg)}`);
}

// --- Script page -------------------------------------------------------------

const SAMPLE_VARIABLES = { first_name: "Henry", farm_name: "Test Farm", location: "Boise, Idaho", known_context: "This is a test call from the dashboard." };

const isTestContact = (c: Contact) => c.lead_id.toUpperCase().startsWith("TEST");
const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));
const multiline = (v: string | undefined) => (v ?? "").replace(/\r\n/g, "\n").trim();
/** The typed text, or exactly what's live when only spacing differs (so nothing changes by accident). */
const typedOr = (typed: string, current: string) => (typed === current.trim() ? current : typed);
const words = (list: string[]) => (list.length < 2 ? list.join("") : `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`);
const goScript = (params: Record<string, string>) => redirect(`/script?${new URLSearchParams(params)}`);

function formValues(form: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of form.entries()) if (typeof value === "string" && !key.startsWith("$ACTION")) out[key] = value.slice(0, 40_000);
  return out;
}

function toE164(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (raw.trim().startsWith("+")) return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

const versionRow = (s: AgentScript, note: string): NewScriptVersion => ({
  prompt: s.prompt, voicemail: s.voicemail, callback_greeting: s.callbackGreeting, callback_prompt: s.callbackPrompt, note,
});

/** If the script was changed in Retell itself, keep that version in the history before replacing it. */
async function keepOutsideChanges(store: Store, live: LiveScript) {
  const [latest] = await store.listScriptVersions(1);
  const same =
    latest &&
    latest.prompt === live.prompt &&
    (latest.voicemail ?? "") === live.voicemail &&
    (live.callbackGreeting === null || latest.callback_greeting === null || latest.callback_greeting === live.callbackGreeting) &&
    (live.callbackPrompt === null || latest.callback_prompt === null || latest.callback_prompt === live.callbackPrompt);
  if (!same) await store.insertScriptVersion(versionRow(live, "Changed outside the dashboard (kept before your edit)"));
}

/** Save the editor. On any problem it hands back what was typed, so nothing is lost. */
export async function saveScript(_prev: ScriptFormState, form: FormData): Promise<ScriptFormState> {
  await requireSession();
  const values = formValues(form);
  const fail = (error: string): ScriptFormState => ({ error, notice: null, values, at: Date.now() });
  const textView = values.view === "text";

  let sections: ScriptSection[];
  if (textView) {
    sections = editableSections(values.full ?? "");
  } else {
    const count = Math.min(200, Math.max(0, Math.floor(Number(values.count) || 0)));
    const inputs: SectionInput[] = [];
    for (let i = 0; i < count; i++) {
      if (values[`remove-${i}`] === "1") continue;
      inputs.push({ title: values[`title-${i}`] ?? "", body: values[`body-${i}`] ?? "", original: values[`orig-${i}`] || null, intro: values[`intro-${i}`] === "1" });
    }
    inputs.push({ title: values["new-title"] ?? "", body: values["new-body"] ?? "", original: null, intro: false });
    sections = buildSections(inputs);
  }
  const edited = serializeScript(sections);
  if (!edited.trim()) return fail("The script is empty, so nothing was saved.");
  const problem = honestyProblem(edited);
  if (problem) return fail(`Not saved: ${problem}. On real calls the agent has to be honest that it's an automated assistant, so reword that part.`);

  let live: LiveScript;
  try {
    live = await getAgentScript();
  } catch (e) {
    return fail(`Couldn't reach Retell, so nothing was saved. ${errorText(e)}`);
  }

  const next: AgentScript = {
    prompt: edited === editableText(live.prompt) ? live.prompt : finalScript(sections),
    voicemail: multiline(values.voicemail) ? typedOr(multiline(values.voicemail), live.voicemail) : live.voicemail,
    callbackGreeting: live.callbackGreeting,
    callbackPrompt: live.callbackPrompt,
  };
  if (live.callbackGreeting !== null && live.callbackPrompt !== null && "callback-prompt" in values) {
    const callbackEdited = editableText(values["callback-prompt"] ?? "");
    const callbackProblem = honestyProblem(callbackEdited);
    if (callbackProblem) return fail(`Not saved: in what the AI says to callers, ${callbackProblem}. Reword that part.`);
    const greeting = multiline(values["callback-greeting"]);
    if (greeting) next.callbackGreeting = typedOr(greeting, live.callbackGreeting);
    if (callbackEdited.trim() && callbackEdited !== editableText(live.callbackPrompt)) next.callbackPrompt = finalScript(editableSections(callbackEdited));
  }

  const store = getStore();
  let changed: string[];
  try {
    await keepOutsideChanges(store, live);
    changed = await saveAgentScript(live, next);
  } catch (e) {
    return fail(`Saving didn't finish. Reload the page to see what's live before trying again. ${errorText(e)}`);
  }
  if (!changed.length) return { error: null, notice: "Nothing changed, so there was nothing to save.", values, at: Date.now() };
  let history = "ok";
  try {
    await store.insertScriptVersion(versionRow(next, `Changed the ${words(changed)}`));
  } catch {
    history = "failed";
  }
  revalidatePath("/script");
  return goScript({ saved: changed.join(","), history, ...(textView ? { view: "text" } : {}) });
}

export async function restoreScriptVersion(form: FormData) {
  await requireSession();
  const store = getStore();
  const version = await store.getScriptVersion(text(form, "versionId", 100));
  if (!version) return goScript({ error: "That version isn't in the history anymore." });
  const edited = editableText(version.prompt);
  const callbackEdited = version.callback_prompt ? editableText(version.callback_prompt) : "";
  const problem = honestyProblem(edited) ?? (callbackEdited ? honestyProblem(callbackEdited) : null);
  if (problem) return goScript({ error: `That version can't go live: ${problem}.` });

  let error: string | null = null;
  let changed: string[] = [];
  try {
    const live = await getAgentScript();
    const next: AgentScript = {
      prompt: edited === editableText(live.prompt) ? live.prompt : finalScript(editableSections(version.prompt)),
      voicemail: version.voicemail?.trim() ? typedOr(version.voicemail.trim(), live.voicemail) : live.voicemail,
      callbackGreeting: live.callbackGreeting !== null && version.callback_greeting?.trim() ? typedOr(version.callback_greeting.trim(), live.callbackGreeting) : live.callbackGreeting,
      callbackPrompt:
        live.callbackPrompt !== null && callbackEdited.trim() && callbackEdited !== editableText(live.callbackPrompt)
          ? finalScript(editableSections(callbackEdited))
          : live.callbackPrompt,
    };
    await keepOutsideChanges(store, live);
    changed = await saveAgentScript(live, next);
    if (changed.length) await store.insertScriptVersion(versionRow(next, `Restored the version from ${shortDate(version.created_at, true)}`));
  } catch (e) {
    error = errorText(e);
  }
  revalidatePath("/script");
  if (error) return goScript({ error: `Restoring didn't finish. Reload to see what's live. ${error}` });
  return goScript({ restored: changed.length ? "1" : "0" });
}

/**
 * Ring Henry's own phone with the saved script: the live agent, or the test agent when
 * `which` is "test". This is the one place besides the dialer that places a call, and it
 * only ever rings the test number in settings, never anyone on the call list.
 */
export async function testCall(form: FormData) {
  await requireSession();
  const useTest = text(form, "which", 10) === "test";
  const back = (params: Record<string, string>) => goScript(useTest ? { view: "test", ...params } : params);
  const store = getStore();
  const { test_phone: to } = await store.getSettings();
  if (!to) return back({ test: "Add your phone number first.", tone: "bad" });
  const owner = await store.findContactByPhone(to);
  if (owner && !isTestContact(owner)) {
    return back({ test: `Not called: ${prettyPhone(to)} is the number for ${owner.farm} on your call list. Test calls only go to your own phone.`, tone: "bad" });
  }
  if (useTest && !env.demo && !env.retellTestAgentId) return back({ test: "The test agent isn't set up (RETELL_TEST_AGENT_ID).", tone: "bad" });

  // Whose details the agent gets: a farmer from the list if asked, else the test contact.
  let pretend: Contact | null = owner;
  const as = text(form, "as", 80);
  if (as) {
    const match = (await store.listContacts({ q: as })).rows[0];
    pretend = match ? await store.getContact(match.id) : null;
    if (!pretend) return back({ test: `Nobody on the list matches “${as}”.`, tone: "bad" });
  }
  if (env.demo) return back({ test: "Demo mode: no call was placed.", tone: "info" });

  // No contact_id in the metadata: a test call is never logged against a farmer.
  const result = await placeCall({
    to,
    variables: pretend ? callVariables(pretend) : SAMPLE_VARIABLES,
    metadata: { test: "1" },
    ...(useTest ? { agentId: env.retellTestAgentId } : {}),
  });
  if (result.kind !== "placed") return back({ test: `The test call didn't go out: ${result.error}`, tone: "bad" });
  const who = pretend && !isTestContact(pretend) ? ` as if you were ${pretend.contact_name || pretend.farm}` : "";
  return back({ test: `Calling ${prettyPhone(to)} now with the ${useTest ? "test" : "live"} script${who}. Pick up to hear it.`, tone: "good" });
}

/**
 * The test agent's script is saved exactly as typed, with no honesty block or check:
 * it's only ever used by testCall, which only rings the test phone. The dialer and the
 * phone number never use the test agent.
 */
export async function saveTestScript(_prev: ScriptFormState, form: FormData): Promise<ScriptFormState> {
  await requireSession();
  const values = formValues(form);
  const fail = (error: string): ScriptFormState => ({ error, notice: null, values, at: Date.now() });
  const prompt = multiline(values.prompt);
  if (!prompt) return fail("The test script is empty, so nothing was saved.");
  let test: TestScript | null;
  try {
    test = await getTestAgentScript();
  } catch (e) {
    return fail(`Couldn't reach Retell, so nothing was saved. ${errorText(e)}`);
  }
  if (!test) return fail("The test agent isn't set up (RETELL_TEST_AGENT_ID).");
  if (prompt === test.prompt.trim()) return { error: null, notice: "Nothing changed, so there was nothing to save.", values, at: Date.now() };
  try {
    await saveTestAgentScript(test, prompt);
  } catch (e) {
    return fail(`Saving didn't finish. ${errorText(e)}`);
  }
  revalidatePath("/script");
  return goScript({ view: "test", testsaved: "1" });
}

/** Replace the test script with the live one (without its honesty block), to edit from there. */
export async function copyLiveToTest() {
  await requireSession();
  let error: string | null = null;
  try {
    const [live, test] = await Promise.all([getAgentScript(), getTestAgentScript()]);
    if (!test) error = "The test agent isn't set up (RETELL_TEST_AGENT_ID).";
    else await saveTestAgentScript(test, editableText(live.prompt));
  } catch (e) {
    error = errorText(e);
  }
  revalidatePath("/script");
  return goScript(error ? { view: "test", error: `Copying didn't finish: ${error}` } : { view: "test", copied: "1" });
}

export async function saveTestPhone(form: FormData) {
  await requireSession();
  const back = (params: Record<string, string>) => goScript(text(form, "view", 10) === "test" ? { view: "test", ...params } : params);
  const phone = toE164(text(form, "phone", 40));
  if (!phone) return back({ test: "That doesn't look like a phone number.", tone: "bad" });
  const store = getStore();
  const owner = await store.findContactByPhone(phone);
  if (owner && !isTestContact(owner)) return back({ test: `That's the number for ${owner.farm} on your call list. Use your own phone for tests.`, tone: "bad" });
  await store.updateSettings({ test_phone: phone });
  revalidatePath("/script");
  return back({ test: `Test calls will ring ${prettyPhone(phone)}.`, tone: "good" });
}
