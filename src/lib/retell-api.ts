import "server-only";
import { env } from "@/lib/env";

export type PlaceCallResult =
  | { kind: "placed"; callId: string }
  | { kind: "refused"; error: string } // Retell said no: the call definitely didn't go out
  | { kind: "uncertain"; error: string }; // timeout or server error: it may have gone out

async function retell<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`https://api.retellai.com/${path}`, {
    method,
    headers: { Authorization: `Bearer ${env.retellApiKey}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  const data = (await res.json().catch(() => ({}))) as T & { error_message?: string };
  if (!res.ok) throw new Error(`Retell: ${data.error_message ?? `answered ${res.status}`}`);
  return data;
}

/** Everything the AI says. Callback fields are null when the number has no agent answering callbacks. */
export type AgentScript = { prompt: string; voicemail: string; callbackGreeting: string | null; callbackPrompt: string | null };
export type LiveScript = AgentScript & {
  ids: { llmId: string; voicemailType: string; callbackLlmId: string | null };
  callbackError: string | null;
};

type RetellAgent = { response_engine?: { llm_id?: string }; voicemail_option?: { action?: { type?: string; text?: string } } | null };
type RetellLlm = { general_prompt?: string | null; begin_message?: string | null };
type RetellNumber = { inbound_agents?: { agent_id?: string }[] | null; inbound_agent_id?: string | null };

// Demo mode edits a copy in memory instead of the real agents.
const demoScript = ((globalThis as unknown as { __demoScript?: AgentScript }).__demoScript ??= {
  prompt:
    "You are Henry's virtual assistant at Irrigant, calling a farmer on Irrigant's call list.\n\nWHAT WE KNOW ABOUT THEM (blank means we don't know)\n- Name: {{first_name}}\n- Farm: {{farm_name}}\n- Location: {{location}}\n- Notes from our list: {{known_context}}\n\nYOUR FIRST LINE\nAs soon as they answer, say: \"Hi, is this {{first_name}} from {{farm_name}}?\"\n\nWHO YOU ARE\nIf they ask \"Is this Henry?\", or whether you're a real person, a robot or a computer, say you're Henry's automated assistant, and that Henry is a real person who'll follow up himself. Never claim to be Henry or any human.\n\nTHE HEART OF THE CALL: THEIR OPERATION\n- what they grow, and roughly how many acres\n- how they irrigate\n\nRULES (never break these)\n- Never quote a price.",
  voicemail: "Hi {{first_name}}, this is Henry's virtual assistant from Irrigant. We'll try you again another time.",
  callbackGreeting: "Hi, thanks for calling Irrigant! Henry will call you back soon. Have a great day!",
  callbackPrompt: "You answer incoming calls to Irrigant's outreach line, but you are not Henry: you're his automated assistant. You've already told the caller Henry will call them back.\n- If they say anything, reply with one short line and end the call.",
});

async function outboundScript() {
  const agent = await retell<RetellAgent>("GET", `get-agent/${env.retellAgentId}`);
  const llmId = agent.response_engine?.llm_id;
  if (!llmId) throw new Error("The outreach agent has no script to edit");
  const llm = await retell<RetellLlm>("GET", `get-retell-llm/${llmId}`);
  const action = agent.voicemail_option?.action;
  return { llmId, prompt: llm.general_prompt ?? "", voicemail: action?.text ?? "", voicemailType: action?.type || "static_text" };
}

/** The agent that answers when someone calls our number back, found from the number itself. */
async function callbackScript() {
  const number = await retell<RetellNumber>("GET", `get-phone-number/${encodeURIComponent(env.fromNumber)}`);
  const agentId = number.inbound_agents?.[0]?.agent_id ?? number.inbound_agent_id;
  if (!agentId) return null;
  const agent = await retell<RetellAgent>("GET", `get-agent/${agentId}`);
  const llmId = agent.response_engine?.llm_id;
  if (!llmId) return null;
  const llm = await retell<RetellLlm>("GET", `get-retell-llm/${llmId}`);
  return { llmId, greeting: llm.begin_message ?? "", prompt: llm.general_prompt ?? "" };
}

/** Everything the AI says right now, straight from Retell. */
export async function getAgentScript(): Promise<LiveScript> {
  if (env.demo) return { ...demoScript, ids: { llmId: "demo", voicemailType: "static_text", callbackLlmId: "demo" }, callbackError: null };
  if (!env.retellApiKey || !env.retellAgentId) throw new Error("Retell isn't set up yet (API key and outreach agent)");
  const [outbound, callback] = await Promise.all([
    outboundScript(),
    callbackScript().then(
      (c) => ({ c, error: null }),
      (e: unknown) => ({ c: null, error: e instanceof Error ? e.message : String(e) }),
    ),
  ]);
  return {
    prompt: outbound.prompt,
    voicemail: outbound.voicemail,
    callbackGreeting: callback.c ? callback.c.greeting : null,
    callbackPrompt: callback.c ? callback.c.prompt : null,
    ids: { llmId: outbound.llmId, voicemailType: outbound.voicemailType, callbackLlmId: callback.c?.llmId ?? null },
    callbackError: callback.error,
  };
}

/** Save what differs from `live`. The next call uses it. Returns what changed, in words. */
export async function saveAgentScript(live: LiveScript, next: AgentScript): Promise<string[]> {
  const changed: string[] = [];
  const callback =
    live.ids.callbackLlmId !== null && next.callbackGreeting !== null && next.callbackPrompt !== null &&
    (next.callbackGreeting !== live.callbackGreeting || next.callbackPrompt !== live.callbackPrompt);
  if (next.prompt !== live.prompt) {
    if (!env.demo) await retell("PATCH", `update-retell-llm/${live.ids.llmId}`, { general_prompt: next.prompt });
    changed.push("script");
  }
  if (next.voicemail !== live.voicemail) {
    if (!env.demo) await retell("PATCH", `update-agent/${env.retellAgentId}`, { voicemail_option: { action: { type: live.ids.voicemailType, text: next.voicemail } } });
    changed.push("voicemail");
  }
  if (callback) {
    if (!env.demo) await retell("PATCH", `update-retell-llm/${live.ids.callbackLlmId}`, { begin_message: next.callbackGreeting, general_prompt: next.callbackPrompt });
    changed.push("callback greeting");
  }
  if (env.demo) Object.assign(demoScript, next);
  return changed;
}

/** Ask Retell to place one outbound call from our number with the outreach agent. */
export async function placeCall(input: {
  to: string;
  variables: Record<string, string>;
  metadata: Record<string, string>;
}): Promise<PlaceCallResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch("https://api.retellai.com/v2/create-phone-call", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.retellApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from_number: env.fromNumber,
        to_number: input.to,
        override_agent_id: env.retellAgentId,
        retell_llm_dynamic_variables: input.variables,
        metadata: input.metadata,
      }),
      signal: controller.signal,
    });
    const body = (await res.json().catch(() => ({}))) as { call_id?: string; error_message?: string; message?: string };
    if (res.ok && body.call_id) return { kind: "placed", callId: body.call_id };
    const error = body.error_message || body.message || `Retell answered ${res.status}`;
    return res.status >= 400 && res.status < 500 ? { kind: "refused", error } : { kind: "uncertain", error };
  } catch (e) {
    return { kind: "uncertain", error: e instanceof Error ? e.message : String(e) };
  } finally {
    clearTimeout(timer);
  }
}
