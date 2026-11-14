import Link from "next/link";
import { signOut } from "@/app/actions";
import { NavLinks } from "@/components/nav";
import { getStore } from "@/lib/store";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

export default async function DashLayout({ children }: LayoutProps<"/">) {
  const store = getStore();
  const [counts, inbound, settings] = await Promise.all([store.statusCounts(), store.inboundUnhandled(), store.getSettings()]);
  const followUps = (counts.follow_up ?? 0) + (counts.meeting ?? 0) + inbound.length;

  return (
    <div className="min-h-dvh">
      <header className="bg-field-800 text-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <span className="grid size-7 place-items-center rounded-lg bg-white/15" aria-hidden="true">
              <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 21v-8" /><path d="M12 13c0-4 3-7 7-7 0 4-3 7-7 7Z" /><path d="M12 15c0-3-2.5-5.5-6-5.5 0 3 2.5 5.5 6 5.5Z" /></svg>
            </span>
            Irrigant Calls
            {env.demo ? <span className="rounded bg-amber-300 px-1.5 py-0.5 text-[10px] font-bold uppercase text-amber-950">Demo data</span> : null}
          </Link>
          <div className="order-3 w-full sm:order-none sm:w-auto sm:flex-1">
            <NavLinks followUps={followUps} aiOn={settings.ai_enabled} />
          </div>
          <div className="flex items-center gap-1">
            <a href="/export" className="rounded-lg px-3 py-2 text-sm font-medium text-field-100 hover:bg-white/10 hover:text-white">Export CSV</a>
            <form action={signOut}>
              <button type="submit" className="rounded-lg px-3 py-2 text-sm font-medium text-field-100 hover:bg-white/10 hover:text-white">Sign out</button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
