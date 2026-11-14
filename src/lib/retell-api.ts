import "server-only";
import { env } from "@/lib/env";

export type PlaceCallResult =
  | { kind: "placed"; callId: string }
  | { kind: "refused"; error: string } // Retell said no: the call definitely didn't go out
  | { kind: "uncertain"; error: string }; // timeout or server error: it may have gone out

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
