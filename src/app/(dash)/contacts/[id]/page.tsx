import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { logCall } from "@/app/actions";
import { Badge, Card, Field, Notice, PhoneIcon, StatusBadge, TierBadge, buttonStyles, inputStyles, prettyPhone } from "@/components/ui";
import { MANUAL_OUTCOMES } from "@/lib/status";
import { getStore } from "@/lib/store";
import { isWithinCallingHours, localClock, shortDate } from "@/lib/time";
import type { Call } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/contacts/[id]">): Promise<Metadata> {
  const contact = await getStore().getContact((await params).id);
  return { title: contact?.farm ?? "Contact" };
}

const KIND_LABEL: Record<Call["kind"], string> = { ai: "AI call", manual: "You", inbound: "Called us" };
const OUTCOME_TEXT: Record<string, string> = {
  wants_call_with_henry: "Wants a call with Henry", follow_up_later: "Follow up later", callback_requested: "Wants a call back",
  not_interested: "Not interested", do_not_call: "Do not call", wrong_person: "Wrong person", no_conversation: "No conversation",
  spoke: "Spoke", follow_up: "Follow up", meeting: "Meeting set", voicemail: "Voicemail", no_answer: "No answer", wrong_number: "Wrong number", dnc: "Do not call",
};

export default async function ContactPage({ params, searchParams }: PageProps<"/contacts/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const store = getStore();
  const [contact, calls, settings] = await Promise.all([store.getContact(id), store.callsForContact(id), store.getSettings()]);
  if (!contact) notFound();
  const now = new Date();
  const goodTime = isWithinCallingHours(contact.tz, settings, now);

  const details: Array<[string, string | null]> = [
    ["Location", [contact.city, contact.county ? `${contact.county.replace(/\s+county$/i, "")} County` : null, contact.state].filter(Boolean).join(", ")],
    ["Type", contact.segment], ["Grows or raises", contact.crops], ["Size", contact.size], ["Irrigation", contact.irrigation],
    ["Tech", contact.tech], ["Why they fit", contact.why_fit], ["Email", contact.email], ["Website", contact.website],
    ["Notes for caller", contact.notes_for_caller], ["Number check", contact.number_check], ["Number source", contact.number_source],
    ["Consent", contact.consent_source], ["Lead ID", contact.lead_id],
  ];
  const keyFacts = [contact.crops ?? contact.segment, contact.size, contact.irrigation].filter((v): v is string => Boolean(v));
  const about = (
    <Card title="About the farm">
      <dl className="space-y-2 text-sm">
        {details.filter(([, v]) => v).map(([label, value]) => <Row key={label} label={label} value={value!} />)}
      </dl>
    </Card>
  );

  return (
    <div className="space-y-5">
      <Link href="/" className={`${buttonStyles.quiet} -ml-2`}>← Call list</Link>

      {sp.saved === "1" ? <Notice tone="good">Call saved.</Notice> : null}
      {sp.error === "outcome" ? <Notice tone="bad">Pick how the call went before saving.</Notice> : null}

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <TierBadge tier={contact.tier} />
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight text-stone-900">{contact.farm}</h1>
            <p className="text-stone-700">
              {contact.contact_name ?? "No contact name on the list"}
              {contact.role ? <span className="text-stone-500"> · {contact.role}</span> : null}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <StatusBadge status={contact.status} />
              {contact.score ? <Badge>Score {contact.score}</Badge> : null}
              {!contact.ai_allowed ? <Badge tone="warn">Call yourself</Badge> : <Badge>AI can call</Badge>}
              {contact.attempts ? <Badge>{contact.attempts} AI attempt{contact.attempts > 1 ? "s" : ""}</Badge> : null}
            </div>
          </div>
        </div>
      </div>

      {contact.dnc ? <Notice tone="bad">Do not call{contact.dnc_reason ? `: ${contact.dnc_reason}` : ""}.</Notice> : null}
      {!contact.ai_allowed && contact.ai_block_reason ? <Notice tone="warn">{contact.ai_block_reason}.</Notice> : null}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="space-y-5">
          <Card>
            <a href={`tel:${contact.phone}`} className={`${buttonStyles.primary} w-full py-3.5 text-base`}>
              <PhoneIcon className="size-5" /> Call {prettyPhone(contact.phone)}
            </a>
            {contact.phone2 ? (
              <a href={`tel:${contact.phone2}`} className={`${buttonStyles.secondary} mt-2 w-full`}>
                <PhoneIcon /> Second number {prettyPhone(contact.phone2)}
              </a>
            ) : null}
            <p className={`mt-3 text-sm ${goodTime ? "text-field-700" : "text-stone-500"}`}>
              It&apos;s {localClock(contact.tz, now)} for them ({contact.time_zone}){goodTime ? ", inside calling hours." : ", outside calling hours."}
            </p>
          </Card>

          {contact.opening_line || keyFacts.length ? (
            <Card title="Your opener">
              {contact.opening_line ? <p className="border-l-4 border-field-600 pl-3 text-stone-800">{contact.opening_line}</p> : null}
              {keyFacts.length ? <p className={`${contact.opening_line ? "mt-3" : ""} text-sm text-stone-600`}>{keyFacts.join(" · ")}</p> : null}
            </Card>
          ) : null}

          {contact.status === "follow_up" || contact.status === "meeting" || contact.follow_up_note || contact.outcome ? (
            <Card title="Where it stands">
              <dl className="space-y-2 text-sm">
                {contact.outcome ? <Row label="Next step" value={contact.outcome} /> : null}
                {contact.follow_up_date ? <Row label="Follow up" value={shortDate(`${contact.follow_up_date}T12:00:00Z`)} /> : null}
                {contact.follow_up_note ? <Row label="They said" value={contact.follow_up_note} /> : null}
                {contact.spoke_with ? <Row label="Spoke with" value={contact.spoke_with} /> : null}
              </dl>
            </Card>
          ) : null}

          <div className="hidden lg:block">{about}</div>
        </div>

        <div className="space-y-5">
          <Card title="Log a call">
            <form action={logCall} className="space-y-4">
              <input type="hidden" name="contactId" value={contact.id} />
              <fieldset>
                <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-600">How did it go?</legend>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {MANUAL_OUTCOMES.map((o) => (
                    <label key={o.status} className="relative">
                      <input type="radio" name="status" value={o.status} required className="peer sr-only" />
                      <span title={o.hint}
                        className={`flex h-full cursor-pointer items-center justify-center rounded-lg border px-2 py-2.5 text-center text-sm font-medium transition peer-focus-visible:ring-2 peer-focus-visible:ring-field-600 ${o.status === "dnc" ? "border-rose-200 text-rose-700 peer-checked:border-rose-600 peer-checked:bg-rose-600 peer-checked:text-white" : "border-stone-300 text-stone-800 peer-checked:border-field-700 peer-checked:bg-field-700 peer-checked:text-white"}`}>
                        {o.label}
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Spoke with"><input name="spokeWith" defaultValue={contact.spoke_with ?? contact.first_name ?? ""} className={inputStyles} /></Field>
                <Field label="Follow-up date"><input name="followUpDate" type="date" defaultValue={contact.follow_up_date ?? ""} className={inputStyles} /></Field>
              </div>
              <Field label="Next step" hint="Shows on the follow-up list and in the export.">
                <input name="nextStep" placeholder="e.g. Send pricing, call back Tuesday 9am" className={inputStyles} />
              </Field>
              <Field label="Notes">
                <textarea name="notes" rows={3} placeholder="What they grow, how they water, what they asked…" className={inputStyles} />
              </Field>
              <button type="submit" className={`${buttonStyles.primary} w-full`}>Save call</button>
            </form>
          </Card>

          {contact.caller_notes ? (
            <Card title="Notes">
              <p className="whitespace-pre-wrap text-sm text-stone-800">{contact.caller_notes}</p>
            </Card>
          ) : null}

          <Card title={`Call history${calls.length ? ` (${calls.length})` : ""}`}>
            {calls.length === 0 ? (
              <p className="text-sm text-stone-600">No calls yet.</p>
            ) : (
              <ol className="space-y-4">
                {calls.map((call) => <CallItem key={call.id} call={call} />)}
              </ol>
            )}
          </Card>

          {/* On a phone the full details come last, so the log form sits right under the call button. */}
          <div className="lg:hidden">{about}</div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  const isUrl = /^https?:\/\//.test(value);
  return (
    <div className="grid grid-cols-[8.5rem_minmax(0,1fr)] gap-3">
      <dt className="text-stone-500">{label}</dt>
      <dd className="break-words text-stone-900">{isUrl ? <a className="text-field-700 underline" href={value} target="_blank" rel="noreferrer noopener">{value}</a> : value}</dd>
    </div>
  );
}

function CallItem({ call }: { call: Call }) {
  const analysis = (call.analysis ?? {}) as Record<string, unknown>;
  const learned = ["decision_maker", "crops", "acres", "irrigation", "location", "tools_and_data", "advisor", "list_corrections", "questions_for_henry"]
    .map((k) => [k, analysis[k]] as const)
    .filter(([, v]) => typeof v === "string" && v.trim());
  return (
    <li className="rounded-lg border border-stone-200 p-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge tone={call.kind === "ai" ? "info" : call.kind === "inbound" ? "warn" : "neutral"}>{KIND_LABEL[call.kind]}</Badge>
        <span className="text-stone-600">{shortDate(call.started_at ?? call.created_at, true)}</span>
        {call.duration_s ? <span className="text-stone-500">· {Math.floor(call.duration_s / 60)}:{String(call.duration_s % 60).padStart(2, "0")}</span> : null}
        {call.outcome ? <span className="font-medium text-stone-900">· {OUTCOME_TEXT[call.outcome] ?? call.outcome}</span> : null}
        {call.status === "error" || call.status === "uncertain" ? <Badge tone="bad">{call.status === "error" ? "Didn't go out" : "Unclear"}</Badge> : null}
      </div>
      {call.summary ? <p className="mt-2 text-sm text-stone-800">{call.summary}</p> : null}
      {call.preferred_times ? <p className="mt-1 text-sm text-amber-900">Best time: {call.preferred_times}</p> : null}
      {call.notes ? <p className="mt-1 whitespace-pre-wrap text-sm text-stone-700">{call.notes}</p> : null}
      {learned.length ? (
        <dl className="mt-2 grid gap-1 text-xs text-stone-700 sm:grid-cols-2">
          {learned.map(([k, v]) => <div key={k}><dt className="inline text-stone-500">{k.replace(/_/g, " ")}: </dt><dd className="inline">{String(v)}</dd></div>)}
        </dl>
      ) : null}
      <div className="mt-2 flex flex-wrap gap-3">
        {call.recording_url ? <a href={call.recording_url} target="_blank" rel="noreferrer noopener" className="text-sm font-medium text-field-700 underline">Recording</a> : null}
        {call.transcript ? (
          <details className="w-full">
            <summary className="text-sm font-medium text-field-700">Transcript</summary>
            <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded bg-stone-50 p-2 font-sans text-xs text-stone-800">{call.transcript}</pre>
          </details>
        ) : null}
      </div>
    </li>
  );
}
