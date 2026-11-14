import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { verifyRetellSignature } from "@/lib/retell-signature";
import { callFields, contactUpdateForAiCall, contactUpdateForInbound, type RetellEvent } from "@/lib/retell-map";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

const HANDLED = new Set(["call_started", "call_ended", "call_analyzed"]);

// Retell posts call_started, call_ended and call_analyzed here. Events can repeat
// or arrive out of order, so every write is idempotent and nothing settled is undone.
export async function POST(request: Request) {
  const raw = await request.text();
  if (!env.demo && !verifyRetellSignature(raw, env.retellWebhookKey, request.headers.get("x-retell-signature"))) {
    return NextResponse.json({ error: "Bad signature" }, { status: 401 });
  }

  let event: RetellEvent;
  try {
    event = JSON.parse(raw) as RetellEvent;
  } catch {
    return NextResponse.json({ error: "Not JSON" }, { status: 400 });
  }
  if (!HANDLED.has(event.event) || !event.call?.call_id) return new NextResponse(null, { status: 204 });

  const store = getStore();
  const inbound = event.call.direction === "inbound";
  const fields = callFields(event);

  let call = await store.getCallByRetellId(event.call.call_id);
  let contactId = call?.contact_id ?? null;
  if (!contactId) {
    const fromMetadata = event.call.metadata?.contact_id;
    if (typeof fromMetadata === "string") contactId = fromMetadata;
    else if (inbound && event.call.from_number) contactId = (await store.findContactByPhone(event.call.from_number))?.id ?? null;
  }

  if (!call) {
    try {
      call = await store.insertCall({ ...fields, contact_id: contactId, kind: inbound ? "inbound" : "ai", direction: inbound ? "inbound" : "outbound" });
    } catch (error) {
      // Two events for a new call can arrive together; the loser updates what the winner created.
      call = await store.getCallByRetellId(event.call.call_id);
      if (!call) throw error;
      await store.updateCall(call.id, { ...fields, contact_id: contactId });
    }
  } else {
    await store.updateCall(call.id, { ...fields, contact_id: contactId });
  }

  if (contactId) {
    const contact = await store.getContact(contactId);
    if (contact) {
      const patch = inbound ? contactUpdateForInbound(event, contact) : contactUpdateForAiCall(event, contact);
      if (patch) await store.updateContact(contact.id, patch);
    }
  }
  return new NextResponse(null, { status: 204 });
}
