import "server-only";
import { callVariables } from "@/lib/call-vars";
import { env } from "@/lib/env";
import { placeCall } from "@/lib/retell-api";
import { getStore } from "@/lib/store";
import { HOME_TZ, startOfDay } from "@/lib/time";

export type DialerRun = {
  ran: boolean;
  reason?: string;
  placedToday: number;
  cap: number;
  placed: string[];
  failed: string[];
  uncertain: string[];
};

/**
 * One tick of the AI caller (the scheduler hits /api/cron/dial every few minutes).
 *
 * The database picks who's due (consent on file, not do-not-call, not reached,
 * inside their own calling hours, under the attempt limit) and claims them in
 * the same statement, so overlapping ticks can't call anyone twice. A call
 * Retell refused is released to be tried again; a call whose outcome is
 * unclear keeps its claim, because calling someone twice is worse than missing them.
 */
export async function runDialer(): Promise<DialerRun> {
  const store = getStore();
  const settings = await store.getSettings();
  const placedToday = await store.aiCallsSince(startOfDay(HOME_TZ).toISOString());
  const base = { placedToday, cap: settings.daily_cap, placed: [], failed: [], uncertain: [] };

  if (env.demo) return { ...base, ran: false, reason: "Demo mode never places calls" };
  if (!settings.ai_enabled) return { ...base, ran: false, reason: "The AI caller is switched off" };
  if (!env.retellApiKey || !env.retellAgentId) return { ...base, ran: false, reason: "Retell isn't configured (RETELL_API_KEY, RETELL_AGENT_ID)" };
  const room = settings.daily_cap - placedToday;
  if (room <= 0) return { ...base, ran: false, reason: "Today's call limit is reached" };

  const contacts = await store.claimContactsForAi(Math.min(settings.calls_per_run, room));
  if (!contacts.length) return { ...base, ran: true, reason: "Nobody is due right now" };

  const run: DialerRun = { ...base, ran: true };
  for (const contact of contacts) {
    const result = await placeCall({
      to: contact.phone,
      variables: callVariables(contact),
      metadata: { contact_id: contact.id, lead_id: contact.lead_id },
    });
    const common = { contact_id: contact.id, kind: "ai" as const, direction: "outbound" as const, from_number: env.fromNumber, to_number: contact.phone };
    if (result.kind === "placed") {
      await store.insertCall({ ...common, retell_call_id: result.callId, status: "registered", started_at: new Date().toISOString() });
      run.placed.push(contact.lead_id);
    } else if (result.kind === "refused") {
      await store.releaseClaim(contact.id);
      await store.insertCall({ ...common, status: "error", notes: `Retell refused the call: ${result.error}` });
      run.failed.push(`${contact.lead_id}: ${result.error}`);
      break; // a refusal usually means a setup problem; don't burn through the list
    } else {
      await store.insertCall({ ...common, status: "uncertain", notes: `Unclear whether the call went out: ${result.error}` });
      run.uncertain.push(`${contact.lead_id}: ${result.error}`);
    }
  }
  return { ...run, placedToday: placedToday + run.placed.length };
}
