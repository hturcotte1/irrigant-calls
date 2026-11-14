import type { Metadata } from "next";
import { signIn } from "@/app/actions";
import { buttonStyles, inputStyles } from "@/components/ui";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : "/";
  const failed = params.error === "1";
  const configured = Boolean(process.env.DASHBOARD_PASSWORD);

  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <form action={signIn} className="w-full max-w-sm rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
        <div className="mb-6 flex items-center gap-3">
          <Mark />
          <div>
            <h1 className="text-lg font-semibold text-stone-900">Irrigant Calls</h1>
            <p className="text-sm text-stone-600">Call list, follow-ups and the AI caller</p>
          </div>
        </div>
        {!configured ? (
          <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-200">
            No password is set yet. Add <code className="font-mono">DASHBOARD_PASSWORD</code> to the app&apos;s environment variables.
          </p>
        ) : null}
        <input type="hidden" name="next" value={next} />
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-stone-700">Password</span>
          <input name="password" type="password" autoComplete="current-password" required autoFocus className={inputStyles} />
        </label>
        {failed ? <p className="mt-2 text-sm text-rose-700" role="alert">That password didn&apos;t match. Try again.</p> : null}
        <button type="submit" className={`${buttonStyles.primary} mt-5 w-full`}>Sign in</button>
      </form>
    </main>
  );
}

function Mark() {
  return (
    <span className="grid size-10 place-items-center rounded-xl bg-field-700 text-white" aria-hidden="true">
      <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 21v-8" />
        <path d="M12 13c0-4 3-7 7-7 0 4-3 7-7 7Z" />
        <path d="M12 15c0-3-2.5-5.5-6-5.5 0 3 2.5 5.5 6 5.5Z" />
      </svg>
    </span>
  );
}
