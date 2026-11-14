"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { runDialer } from "@/lib/dialer";
import { SESSION_COOKIE, SESSION_DAYS, isValidSessionToken, makeSessionToken, passwordMatches } from "@/lib/session";
import { MANUAL_OUTCOMES, STATUS_LABEL, isStatus } from "@/lib/status";
import { getStore } from "@/lib/store";
import type { ContactPatch, Settings } from "@/lib/types";

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
