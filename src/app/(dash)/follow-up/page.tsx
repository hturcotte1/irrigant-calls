import type { Metadata } from "next";
import Link from "next/link";
import { markCallHandled } from "@/app/actions";
import { Badge, Card, Empty, PageHeader, PhoneIcon, StatusBadge, TierBadge, buttonStyles, prettyPhone } from "@/components/ui";
import { getStore } from "@/lib/store";
import { HOME_TZ, localClock, shortDate } from "@/lib/time";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "To follow up" };

function dueLabel(date: string | null, today: string): { text: string; tone: "bad" | "warn" | "neutral" } | null {
  if (!date) return null;
  if (date < today) return { text: `Overdue · ${shortDate(`${date}T12:00:00Z`)}`, tone: "bad" };
  if (date === today) return { text: "Today", tone: "warn" };
  return { text: shortDate(`${date}T12:00:00Z`), tone: "neutral" };
}

export default async function FollowUpPage() {
  const store = getStore();
  const [inbound, contacts] = await Promise.all([store.inboundUnhandled(), store.followUps()]);
  const now = new Date();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: HOME_TZ }).format(now);
  const sorted = [...contacts].sort((a, b) => (a.follow_up_date ?? "9999").localeCompare(b.follow_up_date ?? "9999"));

  return (
    <>
      <PageHeader title="To follow up" sub="People who called back, asked for a call, or have a meeting set. Call them from your cell, then log how it went." />

      <div className="space-y-6">
        <Card title={`Called our number back${inbound.length ? ` (${inbound.length})` : ""}`}>
          {inbound.length === 0 ? (
            <p className="text-sm text-stone-600">Nobody right now. When a farmer calls (208) 928-3200, they show up here.</p>
          ) : (
            <ul className="divide-y divide-stone-100">
              {inbound.map((call) => {
                const phone = call.from_number ?? call.contact?.phone ?? null;
                return (
                  <li key={call.id} className="flex flex-wrap items-center gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      {call.contact ? (
                        <Link href={`/contacts/${call.contact.id}`} className="font-semibold text-stone-900 hover:underline">{call.contact.farm}</Link>
                      ) : (
                        <span className="font-semibold text-stone-900">Number not on the list</span>
                      )}
                      <p className="text-sm text-stone-600">
                        {call.contact?.contact_name ? `${call.contact.contact_name} · ` : ""}{prettyPhone(phone)} · called {shortDate(call.started_at ?? call.created_at, true)}
                      </p>
                      {call.outcome === "do_not_call" ? <p className="mt-1 text-sm text-rose-700">Asked not to be called again.</p> : null}
                    </div>
                    {phone && call.outcome !== "do_not_call" ? (
                      <a href={`tel:${phone}`} className={buttonStyles.primary}><PhoneIcon /> Call back</a>
                    ) : null}
                    <form action={markCallHandled}>
                      <input type="hidden" name="callId" value={call.id} />
                      <button type="submit" className={buttonStyles.secondary}>Done</button>
                    </form>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card title={`Follow-ups and meetings${sorted.length ? ` (${sorted.length})` : ""}`}>
          {sorted.length === 0 ? (
            <Empty>No follow-ups yet. Farmers the AI or you mark as interested land here.</Empty>
          ) : (
            <ul className="divide-y divide-stone-100">
              {sorted.map((c) => {
                const due = dueLabel(c.follow_up_date, today);
                return (
                  <li key={c.id} className="relative flex items-start gap-3 py-3">
                    <TierBadge tier={c.tier} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link href={`/contacts/${c.id}`} className="font-semibold text-stone-900 after:absolute after:inset-0 hover:underline">{c.farm}</Link>
                        <StatusBadge status={c.status} />
                        {due ? <Badge tone={due.tone}>{due.text}</Badge> : null}
                      </div>
                      <p className="text-sm text-stone-600">
                        {c.contact_name ?? "No contact name"} · {[c.city, c.state].filter(Boolean).join(", ")}
                        {c.tz ? ` · ${localClock(c.tz, now)} their time` : ""}
                      </p>
                      {c.outcome ? <p className="mt-1 text-sm font-medium text-stone-800">{c.outcome}</p> : null}
                      {c.follow_up_note ? <p className="text-sm text-amber-900">They said: {c.follow_up_note}</p> : null}
                    </div>
                    <a href={`tel:${c.phone}`} aria-label={`Call ${c.farm}`} className="relative z-10 grid size-10 shrink-0 place-items-center rounded-full bg-field-50 text-field-700 ring-1 ring-field-100 hover:bg-field-100">
                      <PhoneIcon />
                    </a>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
