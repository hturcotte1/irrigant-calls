import type { Metadata } from "next";
import Link from "next/link";
import { createHash } from "node:crypto";
import { restoreScriptVersion, saveTestPhone, testCall } from "@/app/actions";
import { CopyLiveButton, ScriptEditor, TestScriptEditor } from "@/components/script-editor";
import { Badge, Card, Field, Notice, PageHeader, PhoneIcon, buttonStyles, inputStyles, prettyPhone } from "@/components/ui";
import { getAgentScript, getTestAgentScript, type LiveScript } from "@/lib/retell-api";
import { FOOTER_BODY, VARIABLES, editableSections, editableText, honestyProblem, missingVariables, unknownVariables } from "@/lib/script";
import { getStore } from "@/lib/store";
import { shortDate } from "@/lib/time";
import type { ScriptVersion } from "@/lib/types";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Script" };

const NOTICE_TONES = ["info", "good", "warn", "bad"] as const;
type NoticeTone = (typeof NOTICE_TONES)[number];

const words = (list: string[]) => (list.length < 2 ? list.join("") : `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`);
const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

function isLive(v: ScriptVersion, live: LiveScript) {
  return (
    v.prompt === live.prompt &&
    (v.voicemail ?? "") === live.voicemail &&
    (v.callback_greeting === null || live.callbackGreeting === null || v.callback_greeting === live.callbackGreeting) &&
    (v.callback_prompt === null || live.callbackPrompt === null || v.callback_prompt === live.callbackPrompt)
  );
}

export default async function ScriptPage({ searchParams }: PageProps<"/script">) {
  const sp = await searchParams;
  const param = (key: string) => (typeof sp[key] === "string" ? (sp[key] as string) : undefined);
  const testTab = param("view") === "test";
  const view = param("view") === "text" ? "text" : "sections";
  const store = getStore();
  const [settings, versions, loaded, testLoaded] = await Promise.all([
    store.getSettings(),
    testTab ? [] : store.listScriptVersions(20),
    testTab
      ? { script: null, error: null }
      : getAgentScript().then(
          (script) => ({ script, error: null }),
          (e: unknown) => ({ script: null, error: errorText(e) }),
        ),
    testTab
      ? getTestAgentScript().then(
          (script) => ({ script, error: null }),
          (e: unknown) => ({ script: null, error: errorText(e) }),
        )
      : { script: null, error: null },
  ]);
  const live = loaded.script;
  const test = testLoaded.script;

  const saved = param("saved")?.split(",").filter(Boolean) ?? [];
  const testTone = NOTICE_TONES.find((t) => t === param("tone")) ?? "info";
  const warnings: { tone: NoticeTone; text: string }[] = [];
  if (live) {
    const problem = honestyProblem(editableText(live.prompt));
    if (problem) warnings.push({ tone: "bad", text: `The live script was changed outside the dashboard, and ${problem}. Reword it here and save.` });
    for (const name of missingVariables(live.prompt)) {
      const v = VARIABLES.find((x) => x.name === name);
      warnings.push({ tone: "warn", text: `The script no longer uses {{${name}}}, so the agent won't know ${v?.means ?? "that detail"}.` });
    }
    const unknown = unknownVariables([live.prompt, live.voicemail, live.callbackGreeting ?? "", live.callbackPrompt ?? ""].join("\n"));
    if (unknown.length) {
      warnings.push({ tone: "warn", text: `${unknown.map((n) => `{{${n}}}`).join(", ")} isn't a fill-in, so the agent sees it as typed. Check the spelling against the list on the right.` });
    }
    if (live.callbackError) warnings.push({ tone: "warn", text: `Couldn't load what callers hear when they ring back: ${live.callbackError}` });
  }
  const hash = (parts: unknown[]) => createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0, 16);
  const key = live ? hash([live.prompt, live.voicemail, live.callbackGreeting, live.callbackPrompt]) : "none";
  const liveVersionId = live ? versions.find((v) => isLive(v, live))?.id : undefined;
  const sections = live ? editableSections(live.prompt) : [];
  const savedMessage = saved.length
    ? `Saved your changes to the ${words(saved)}. The next call uses ${saved.length > 1 ? "them" : "it"}.${param("history") === "failed" ? " (The history entry couldn't be written, so this version can't be restored later.)" : ""}`
    : null;
  const which = testTab ? "test" : "live";

  return (
    <>
      <PageHeader
        title="Script"
        sub={testTab ? "Your private test script. Try anything here: it only ever rings your own phone." : "Everything the AI caller says. Edit any of it; changes go live on the next call."}
        action={
          <form action={testCall} className="lg:hidden">
            <input type="hidden" name="which" value={which} />
            <button type="submit" className={buttonStyles.secondary} disabled={!settings.test_phone}>
              <PhoneIcon /> {testTab ? "Call me with the test script" : "Call me to test"}
            </button>
          </form>
        }
      />

      <nav aria-label="Which script" className="mb-5 inline-flex rounded-lg bg-stone-200/70 p-1 text-sm font-medium">
        {[
          { href: "/script", label: "Live script", active: !testTab },
          { href: "/script?view=test", label: "Test script", active: testTab },
        ].map((t) => (
          <Link
            key={t.href}
            href={t.href}
            aria-current={t.active ? "page" : undefined}
            className={`rounded-md px-3 py-1.5 ${t.active ? "bg-white text-stone-900 shadow-sm" : "text-stone-600 hover:text-stone-900"}`}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      <div className="space-y-5">
        {param("restored") === "1" ? <Notice tone="good">Restored. The next call uses that version.</Notice> : null}
        {param("restored") === "0" ? <Notice>That version is already live.</Notice> : null}
        {param("copied") === "1" ? <Notice tone="good">Copied the live script into the test script. Edit away, then call yourself to hear it.</Notice> : null}
        {param("test") ? <Notice tone={testTone}>{param("test")}</Notice> : null}
        {param("error") ? <Notice tone="bad">{param("error")}</Notice> : null}
        {loaded.error ? (
          <Notice tone="bad">Couldn&apos;t load the script from Retell, so it can&apos;t be edited right now. Try reloading the page. ({loaded.error})</Notice>
        ) : null}
        {testLoaded.error ? <Notice tone="bad">Couldn&apos;t load the test script from Retell. Try reloading the page. ({testLoaded.error})</Notice> : null}
        {testTab && !test && !testLoaded.error ? (
          <Notice tone="bad">The test agent isn&apos;t set up: RETELL_TEST_AGENT_ID is missing in Vercel.</Notice>
        ) : null}
        {warnings.map((w) => (
          <Notice key={w.text} tone={w.tone}>{w.text}</Notice>
        ))}

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="min-w-0 space-y-4">
            {testTab && test ? (
              <>
                <Notice tone="warn">
                  No honesty rules here, so it can say it&apos;s you. This is a separate agent: the AI caller never uses it, and it only
                  ever rings your test phone. Farmers only ever hear the live script.
                </Notice>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm text-stone-600">The test script in one piece. Lines in ALL CAPS start a section.</p>
                  <CopyLiveButton />
                </div>
                <TestScriptEditor
                  key={hash([test.prompt])}
                  prompt={test.prompt}
                  saved={param("testsaved") === "1" ? "Saved the test script. Call yourself to hear it." : null}
                />
              </>
            ) : null}

            {!testTab && live ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm text-stone-600">
                    {view === "text" ? "The whole script in one piece." : `${sections.length} sections, in the order the agent reads them.`}
                  </p>
                  <Link href={view === "text" ? "/script" : "/script?view=text"} className={buttonStyles.quiet}>
                    {view === "text" ? "Edit section by section" : "Edit as one block of text"}
                  </Link>
                </div>
                <ScriptEditor
                  key={`${view}-${key}`}
                  view={view}
                  sections={sections}
                  fullText={editableText(live.prompt)}
                  voicemail={live.voicemail}
                  callback={live.callbackGreeting !== null && live.callbackPrompt !== null ? { greeting: live.callbackGreeting, prompt: editableText(live.callbackPrompt) } : null}
                  footer={FOOTER_BODY}
                  saved={savedMessage}
                />
              </>
            ) : null}
          </div>

          <aside className="space-y-5">
            <Card title={testTab ? "Hear the test script" : "Try it on your phone"}>
              <form action={testCall} className="space-y-3">
                <input type="hidden" name="which" value={which} />
                <Field label="Pretend I'm" hint="Optional. A farm or name on your list, so you hear what they'd hear. Their record isn't touched.">
                  <input name="as" className={inputStyles} placeholder="Farm or name" autoComplete="off" />
                </Field>
                <button type="submit" disabled={!settings.test_phone || (testTab && !test)} className={`${buttonStyles.primary} w-full`}>
                  <PhoneIcon /> Call {settings.test_phone ? prettyPhone(settings.test_phone) : "me"}
                </button>
              </form>
              <form action={saveTestPhone} className="mt-4 flex items-end gap-2 border-t border-stone-100 pt-4">
                {testTab ? <input type="hidden" name="view" value="test" /> : null}
                <div className="min-w-0 flex-1">
                  <Field label="Your phone">
                    <input name="phone" type="tel" required defaultValue={prettyPhone(settings.test_phone)} className={inputStyles} />
                  </Field>
                </div>
                <button type="submit" className={buttonStyles.secondary}>Save</button>
              </form>
              <p className="mt-3 text-xs text-stone-500">
                Uses the {testTab ? "test" : "live"} script as saved. Test calls only ring this number and aren&apos;t logged against any farmer.
              </p>
            </Card>

            <Card title="Fill-ins">
              <p className="text-sm text-stone-600">Type these anywhere, and each call swaps in that farmer&apos;s details:</p>
              <dl className="mt-3 space-y-2 text-sm">
                {VARIABLES.map((v) => (
                  <div key={v.name}>
                    <dt><code className="rounded bg-stone-100 px-1.5 py-0.5 text-xs text-stone-800">{`{{${v.name}}}`}</code></dt>
                    <dd className="mt-0.5 text-stone-600">{v.means}</dd>
                  </div>
                ))}
              </dl>
              {testTab ? null : <p className="mt-3 text-xs text-stone-500">To delete a section, tick Remove. To move sections around, edit as one block of text.</p>}
            </Card>

            {testTab ? null : (
              <Card title="History">
                {versions.length === 0 ? (
                  <p className="text-sm text-stone-600">No saved versions yet.</p>
                ) : (
                  <ol className="-my-2 divide-y divide-stone-100">
                    {versions.map((v) => (
                      <li key={v.id} className="py-2.5">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-stone-900">
                              {shortDate(v.created_at, true)}
                              {v.id === liveVersionId ? <Badge tone="good">Live now</Badge> : null}
                            </p>
                            {v.note ? <p className="text-xs text-stone-500">{v.note}</p> : null}
                          </div>
                          {live && v.id !== liveVersionId ? (
                            <form action={restoreScriptVersion}>
                              <input type="hidden" name="versionId" value={v.id} />
                              <button type="submit" className={buttonStyles.quiet}>Restore</button>
                            </form>
                          ) : null}
                        </div>
                        <details className="mt-1">
                          <summary className="cursor-pointer text-xs font-medium text-field-700 hover:underline">Show what it said</summary>
                          <pre className="mt-2 max-h-72 overflow-auto rounded-lg bg-stone-50 p-3 font-sans text-xs leading-relaxed whitespace-pre-wrap text-stone-700">
                            {editableText(v.prompt)}
                            {v.voicemail ? `\n\nVOICEMAIL\n${v.voicemail}` : ""}
                            {v.callback_greeting ? `\n\nWHEN SOMEONE CALLS BACK\n${v.callback_greeting}` : ""}
                          </pre>
                        </details>
                      </li>
                    ))}
                  </ol>
                )}
              </Card>
            )}
          </aside>
        </div>
      </div>
    </>
  );
}
