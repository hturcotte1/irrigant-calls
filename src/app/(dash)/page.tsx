import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Empty, PageHeader, PhoneIcon, StatusBadge, TierBadge, buttonStyles, inputStyles, prettyPhone } from "@/components/ui";
import { STATUSES, STATUS_LABEL } from "@/lib/status";
import { PAGE_SIZE, getStore } from "@/lib/store";
import { isWithinCallingHours, localClock, shortDate } from "@/lib/time";
import type { ContactFilters } from "@/lib/types";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Call list" };

const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

export default async function CallListPage({ searchParams }: PageProps<"/">) {
  const sp = await searchParams;
  const filters: ContactFilters = {
    q: one(sp.q), tier: one(sp.tier), segment: one(sp.segment), state: one(sp.state), status: one(sp.status),
    who: one(sp.who) === "ai" || one(sp.who) === "manual" ? (one(sp.who) as "ai" | "manual") : "all",
    page: Math.max(0, Number(one(sp.page) ?? 0) || 0),
  };
  const store = getStore();
  const [{ rows, total }, facets, counts, settings] = await Promise.all([store.listContacts(filters), store.facets(), store.statusCounts(), store.getSettings()]);
  const everyone = Object.values(counts).reduce((a, b) => a + b, 0);
  const now = new Date();

  const href = (patch: Partial<Record<keyof ContactFilters, string | number | undefined>>) => {
    const p = new URLSearchParams();
    const merged = { ...filters, page: undefined, ...patch } as Record<string, string | number | undefined>;
    for (const [k, v] of Object.entries(merged)) if (v !== undefined && v !== "" && !(k === "who" && v === "all") && !(k === "page" && v === 0)) p.set(k, String(v));
    const s = p.toString();
    return s ? `/?${s}` : "/";
  };
  const filtered = Boolean(filters.q || filters.tier || filters.segment || filters.state || filters.status || filters.who !== "all");
  const from = (filters.page ?? 0) * PAGE_SIZE;

  return (
    <>
      <PageHeader title="Call list" sub={`${everyone.toLocaleString()} farms, Tier A first. Tap a farm to see its details and log a call.`} />

      <div className="mb-4 flex gap-2 overflow-x-auto pb-1" role="list" aria-label="Filter by status">
        <Chip href={href({ status: undefined })} active={!filters.status} label="All" count={everyone} />
        {STATUSES.filter((s) => counts[s]).map((s) => (
          <Chip key={s} href={href({ status: s })} active={filters.status === s} label={STATUS_LABEL[s]} count={counts[s]} />
        ))}
      </div>

      <form method="get" className="mb-5 grid grid-cols-2 gap-2 rounded-xl border border-stone-200 bg-white p-3 shadow-sm sm:grid-cols-6">
        {filters.status ? <input type="hidden" name="status" value={filters.status} /> : null}
        <input name="q" defaultValue={filters.q} placeholder="Search farm, name, town or phone" aria-label="Search" className={`${inputStyles} col-span-2`} />
        <Select name="tier" value={filters.tier} label="Any tier" options={facets.tiers.map((t) => [t, `Tier ${t}`])} />
        <Select name="segment" value={filters.segment} label="Any type" options={facets.segments.map((s) => [s, s])} />
        <Select name="state" value={filters.state} label="Any state" options={facets.states.map((s) => [s, s])} />
        <Select name="who" value={filters.who === "all" ? undefined : filters.who} label="AI and you" options={[["ai", "AI can call"], ["manual", "Call yourself"]]} />
        <div className="col-span-2 flex gap-2 sm:col-span-6 sm:justify-end">
          {filtered ? <Link href="/" className={buttonStyles.secondary}>Clear</Link> : null}
          <button type="submit" className={`${buttonStyles.primary} flex-1 sm:flex-none`}>Apply</button>
        </div>
      </form>

      {rows.length === 0 ? (
        <Empty>No farms match these filters.</Empty>
      ) : (
        <ul className="divide-y divide-stone-100 overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm">
          {rows.map((c) => {
            const goodTime = isWithinCallingHours(c.tz, settings, now);
            return (
              <li key={c.id} className="relative flex items-start gap-3 px-4 py-3 hover:bg-stone-50 sm:items-center">
                <TierBadge tier={c.tier} />
                <div className="grid min-w-0 flex-1 gap-1 sm:grid-cols-[minmax(0,2fr)_minmax(0,1.3fr)_minmax(0,1.2fr)_15.5rem] sm:items-center sm:gap-4">
                  <div className="min-w-0">
                    <Link href={`/contacts/${c.id}`} className="block truncate font-semibold text-stone-900 after:absolute after:inset-0">
                      {c.farm}
                    </Link>
                    <p className="truncate text-sm text-stone-600" title={c.role ?? undefined}>
                      {c.contact_name ?? "No contact name"}
                      {c.role ? <span className="text-stone-400"> · {c.role.replace(/\s*\(.*\)$/, "")}</span> : null}
                    </p>
                  </div>
                  <p className="truncate text-sm text-stone-700">
                    {[c.city, c.state].filter(Boolean).join(", ")}
                    {c.tz ? (
                      <span className={`ml-2 inline-flex items-center gap-1 text-xs ${goodTime ? "text-field-700" : "text-stone-400"}`} title={goodTime ? "Inside calling hours" : "Outside calling hours"}>
                        <span className={`size-1.5 rounded-full ${goodTime ? "bg-field-600" : "bg-stone-300"}`} />
                        {localClock(c.tz, now)}
                      </span>
                    ) : null}
                  </p>
                  <p className="truncate text-sm text-stone-600" title={c.crops ?? undefined}>{c.crops ?? c.segment}</p>
                  <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                    <StatusBadge status={c.status} />
                    {!c.ai_allowed ? <Badge tone="warn">Call yourself</Badge> : null}
                    {c.follow_up_date ? <span className="text-xs text-stone-500">Follow up {shortDate(`${c.follow_up_date}T12:00:00Z`)}</span> : c.last_called_at ? <span className="text-xs text-stone-500">Called {shortDate(c.last_called_at)}</span> : null}
                  </div>
                </div>
                <a href={`tel:${c.phone}`} aria-label={`Call ${c.farm} at ${prettyPhone(c.phone)}`} className="relative z-10 grid size-10 shrink-0 place-items-center rounded-full bg-field-50 text-field-700 ring-1 ring-field-100 hover:bg-field-100">
                  <PhoneIcon />
                </a>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-4 flex items-center justify-between text-sm text-stone-600">
        <span>{total ? `${(from + 1).toLocaleString()}–${Math.min(from + PAGE_SIZE, total).toLocaleString()} of ${total.toLocaleString()}` : ""}</span>
        <div className="flex gap-2">
          {(filters.page ?? 0) > 0 ? <Link className={buttonStyles.secondary} href={href({ page: (filters.page ?? 0) - 1 })}>Previous</Link> : null}
          {from + PAGE_SIZE < total ? <Link className={buttonStyles.secondary} href={href({ page: (filters.page ?? 0) + 1 })}>Next</Link> : null}
        </div>
      </div>
    </>
  );
}

function Chip({ href, active, label, count }: { href: string; active: boolean; label: string; count: number }) {
  return (
    <Link role="listitem" href={href} aria-current={active ? "true" : undefined}
      className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium ring-1 ring-inset ${active ? "bg-field-700 text-white ring-field-700" : "bg-white text-stone-700 ring-stone-200 hover:bg-stone-50"}`}>
      {label}
      <span className={`text-xs ${active ? "text-field-100" : "text-stone-500"}`}>{count.toLocaleString()}</span>
    </Link>
  );
}

function Select({ name, value, label, options }: { name: string; value?: string; label: string; options: string[][] }) {
  return (
    <select name={name} defaultValue={value ?? ""} aria-label={label} className={inputStyles}>
      <option value="">{label}</option>
      {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  );
}
