import type { Metadata } from "next";
import Link from "next/link";
import { runDialerNow, saveAiSettings, setAiEnabled } from "@/app/actions";
import { Badge, Card, Empty, Field, Notice, PageHeader, TierBadge, buttonStyles, inputStyles } from "@/components/ui";
import { readiness } from "@/lib/env";
import { getStore } from "@/lib/store";
import { HOME_TZ, hourLabel, isWithinCallingHours, localClock, shortDate, startOfDay } from "@/lib/time";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "AI caller" };

const DAYS = [[1, "Mon"], [2, "Tue"], [3, "Wed"], [4, "Thu"], [5, "Fri"], [6, "Sat"], [7, "Sun"]] as const;
const OUTCOME_TEXT: Record<string, string> = {
  wants_call_with_henry: "Wants a call", follow_up_later: "Follow up later", not_interested: "Not interested",
  do_not_call: "Do not call", wrong_person: "Wrong person", someone_else_answered: "Someone else answered", no_conversation: "No conversation", callback_requested: "Wants a call back",
};

export default async function AiPage({ searchParams }: PageProps<"/ai">) {
  const sp = await searchParams;
  const store = getStore();
  const [settings, today, queue, upNext, recent] = await Promise.all([
    store.getSettings(), store.aiCallsSince(startOfDay(HOME_TZ).toISOString()), store.aiQueueSize(), store.aiQueuePreview(8), store.recentCalls("ai", 25),
  ]);
  const checks = readiness();
  const ready = checks.every((c) => c.ok);
  const now = new Date();
  const dayNames = DAYS.filter(([d]) => settings.call_days.includes(d)).map(([, n]) => n).join(", ");

  return (
    <>
      <PageHeader title="AI caller" sub="Calls farmers during their own calling hours, Tier A first. It never calls anyone marked do not call, anyone already reached, or the numbers you call yourself." />

      <div className="space-y-5">
        {sp.saved === "1" ? <Notice tone="good">Settings saved.</Notice> : null}
        {typeof sp.ran === "string" ? <Notice>{sp.ran}</Notice> : null}

        <div className="grid gap-5 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-sm text-stone-600">The AI caller is</p>
                <p className={`text-3xl font-semibold ${settings.ai_enabled ? "text-field-700" : "text-stone-500"}`}>{settings.ai_enabled ? "On" : "Off"}</p>
              </div>
              <form action={setAiEnabled}>
                <input type="hidden" name="on" value={settings.ai_enabled ? "0" : "1"} />
                <button type="submit" disabled={!settings.ai_enabled && !ready} className={settings.ai_enabled ? buttonStyles.danger : buttonStyles.primary}>
                  {settings.ai_enabled ? "Turn off" : "Turn on"}
                </button>
              </form>
            </div>
            <dl className="mt-5 grid grid-cols-3 gap-3 text-center">
              <Stat label="Calls today" value={`${today} / ${settings.daily_cap}`} />
              <Stat label="Left to call" value={queue.toLocaleString()} />
              <Stat label="Per run" value={`${settings.calls_per_run} every 5 min`} />
            </dl>
            <p className="mt-4 text-sm text-stone-600">
              Calls go out {dayNames}, {hourLabel(settings.call_start_hour)} to {hourLabel(settings.call_end_hour)} in each farmer&apos;s own time zone.
              Up to {settings.max_attempts} tries per farmer, {settings.retry_gap_hours} hours apart.
            </p>
            <form action={runDialerNow} className="mt-4">
              <button type="submit" className={buttonStyles.secondary}>Run once now</button>
            </form>
          </Card>

          <Card title="Setup">
            <ul className="space-y-2 text-sm">
              {checks.map((c) => (
                <li key={c.label} className="flex items-start gap-2">
                  <span className={`mt-0.5 grid size-4 shrink-0 place-items-center rounded-full text-[10px] font-bold text-white ${c.ok ? "bg-field-600" : "bg-rose-500"}`} aria-hidden="true">{c.ok ? "✓" : "!"}</span>
                  <span className={c.ok ? "text-stone-700" : "font-medium text-rose-800"}>{c.label}{c.ok ? "" : " (missing)"}</span>
                </li>
              ))}
            </ul>
            {!ready ? <p className="mt-3 text-xs text-stone-500">The AI caller can&apos;t be turned on until everything is set.</p> : null}
          </Card>
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          <Card title="Up next">
            {upNext.length === 0 ? (
              <Empty>Nobody is left for the AI to call.</Empty>
            ) : (
              <ul className="divide-y divide-stone-100">
                {upNext.map((c) => {
                  const open = isWithinCallingHours(c.tz, settings, now);
                  return (
                    <li key={c.id} className="flex items-center gap-3 py-2">
                      <TierBadge tier={c.tier} />
                      <Link href={`/contacts/${c.id}`} className="min-w-0 flex-1 truncate text-sm font-medium text-stone-900 hover:underline">{c.farm}</Link>
                      <span className={`text-xs ${open ? "text-field-700" : "text-stone-400"}`}>{localClock(c.tz, now)} {c.state}</span>
                      {c.attempts ? <Badge>try {c.attempts + 1}</Badge> : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card title="Settings">
            <form action={saveAiSettings} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Calls per day"><input name="daily_cap" type="number" min={0} max={500} defaultValue={settings.daily_cap} className={inputStyles} /></Field>
                <Field label="Calls per run" hint="Runs every 5 minutes"><input name="calls_per_run" type="number" min={1} max={5} defaultValue={settings.calls_per_run} className={inputStyles} /></Field>
                <Field label="Start hour (their time)"><input name="call_start_hour" type="number" min={0} max={23} defaultValue={settings.call_start_hour} className={inputStyles} /></Field>
                <Field label="End hour (their time)"><input name="call_end_hour" type="number" min={1} max={24} defaultValue={settings.call_end_hour} className={inputStyles} /></Field>
                <Field label="Tries per farmer"><input name="max_attempts" type="number" min={1} max={10} defaultValue={settings.max_attempts} className={inputStyles} /></Field>
                <Field label="Hours between tries"><input name="retry_gap_hours" type="number" min={1} max={336} defaultValue={settings.retry_gap_hours} className={inputStyles} /></Field>
              </div>
              <fieldset>
                <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-stone-600">Days</legend>
                <div className="flex flex-wrap gap-2">
                  {DAYS.map(([d, name]) => (
                    <label key={d} className="flex items-center gap-1.5 rounded-lg border border-stone-300 px-2.5 py-1.5 text-sm">
                      <input type="checkbox" name="call_days" value={d} defaultChecked={settings.call_days.includes(d)} className="accent-field-700" />
                      {name}
                    </label>
                  ))}
                </div>
              </fieldset>
              <button type="submit" className={buttonStyles.primary}>Save settings</button>
            </form>
          </Card>
        </div>

        <Card title="Recent AI calls">
          {recent.length === 0 ? (
            <p className="text-sm text-stone-600">No AI calls yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[40rem] text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-stone-500">
                  <tr><th className="py-2 pr-3 font-semibold">When</th><th className="py-2 pr-3 font-semibold">Farm</th><th className="py-2 pr-3 font-semibold">Result</th><th className="py-2 font-semibold">Summary</th></tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {recent.map((call) => (
                    <tr key={call.id} className="align-top">
                      <td className="py-2 pr-3 whitespace-nowrap text-stone-600">{shortDate(call.started_at ?? call.created_at, true)}</td>
                      <td className="py-2 pr-3">{call.contact ? <Link href={`/contacts/${call.contact.id}`} className="font-medium text-stone-900 hover:underline">{call.contact.farm}</Link> : <span className="text-stone-500">{call.notes?.startsWith("Test call") ? "Test call" : "Not on the list"}</span>}</td>
                      <td className="py-2 pr-3 whitespace-nowrap">
                        {call.status === "error" ? <Badge tone="bad">Didn&apos;t go out</Badge> : call.status === "uncertain" ? <Badge tone="bad">Unclear</Badge> : call.outcome ? <Badge tone={call.outcome === "wants_call_with_henry" ? "good" : "neutral"}>{OUTCOME_TEXT[call.outcome] ?? call.outcome}</Badge> : <span className="text-stone-500">{call.status === "registered" || call.status === "ongoing" ? "In progress" : call.disconnection_reason?.replace(/_/g, " ") ?? ""}</span>}
                      </td>
                      <td className="py-2 text-stone-700">{call.summary || call.notes || ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-stone-50 px-2 py-3">
      <dt className="text-xs text-stone-500">{label}</dt>
      <dd className="mt-1 text-lg font-semibold text-stone-900">{value}</dd>
    </div>
  );
}
