import type { ReactNode } from "react";
import { STATUS_LABEL, STATUS_TONE } from "@/lib/status";
import type { ContactStatus } from "@/lib/types";

type Tone = "neutral" | "info" | "good" | "warn" | "bad";

const TONES: Record<Tone, string> = {
  neutral: "bg-stone-100 text-stone-700 ring-stone-200",
  info: "bg-sky-50 text-sky-800 ring-sky-200",
  good: "bg-field-50 text-field-800 ring-field-100",
  warn: "bg-amber-50 text-amber-900 ring-amber-200",
  bad: "bg-rose-50 text-rose-800 ring-rose-200",
};

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset whitespace-nowrap ${TONES[tone]}`}>{children}</span>;
}

export function StatusBadge({ status }: { status: ContactStatus }) {
  return <Badge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>;
}

export function TierBadge({ tier }: { tier: string | null }) {
  if (!tier) return null;
  const style = tier === "A" ? "bg-field-700 text-white" : tier === "B" ? "bg-field-100 text-field-800" : "bg-stone-200 text-stone-700";
  return <span title={`Tier ${tier}`} className={`inline-grid size-6 shrink-0 place-items-center rounded-md text-xs font-bold ${style}`}>{tier}</span>;
}

export function Card({ title, action, children, className = "" }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-stone-200 bg-white shadow-sm ${className}`}>
      {title || action ? (
        <header className="flex items-center justify-between gap-3 border-b border-stone-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-stone-900">{title}</h2>
          {action}
        </header>
      ) : null}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function PageHeader({ title, sub, action }: { title: string; sub?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-stone-900">{title}</h1>
        {sub ? <p className="mt-1 text-sm text-stone-600">{sub}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-lg border border-dashed border-stone-300 bg-stone-50 px-4 py-8 text-center text-sm text-stone-600">{children}</p>;
}

export function Notice({ tone = "info", children }: { tone?: Tone; children: ReactNode }) {
  return <div className={`rounded-lg px-4 py-3 text-sm ring-1 ring-inset ${TONES[tone]}`}>{children}</div>;
}

export const buttonStyles = {
  primary: "inline-flex items-center justify-center gap-2 rounded-lg bg-field-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-field-800 disabled:opacity-50",
  secondary: "inline-flex items-center justify-center gap-2 rounded-lg border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-stone-800 shadow-sm hover:bg-stone-50",
  quiet: "inline-flex items-center justify-center gap-1 rounded-md px-2.5 py-1.5 text-sm font-medium text-field-700 hover:bg-field-50",
  danger: "inline-flex items-center justify-center gap-2 rounded-lg border border-rose-300 bg-white px-4 py-2.5 text-sm font-semibold text-rose-700 hover:bg-rose-50",
};

export const inputStyles =
  "w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 shadow-sm placeholder:text-stone-400 focus:border-field-600 focus:outline-none focus:ring-2 focus:ring-field-100";

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-stone-600">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-stone-500">{hint}</span> : null}
    </label>
  );
}

/** "(208) 555-0100" from "+12085550100". */
export function prettyPhone(e164: string | null): string {
  const d = (e164 ?? "").replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : e164 ?? "";
}

export function PhoneIcon({ className = "size-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M2 3.5A1.5 1.5 0 0 1 3.5 2h1.148a1.5 1.5 0 0 1 1.465 1.175l.513 2.31a1.5 1.5 0 0 1-1.07 1.767l-.97.26a11.04 11.04 0 0 0 5.902 5.902l.26-.97a1.5 1.5 0 0 1 1.767-1.07l2.31.513A1.5 1.5 0 0 1 18 13.352V14.5a1.5 1.5 0 0 1-1.5 1.5H15C8.096 16 2.5 10.404 2.5 3.5V3.5Z" />
    </svg>
  );
}
