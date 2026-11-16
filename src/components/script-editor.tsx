"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { copyLiveToTest, saveScript, saveTestScript } from "@/app/actions";
import { Card, Field, buttonStyles, inputStyles } from "@/components/ui";
import { headingInput } from "@/lib/script";
import type { ScriptFormState } from "@/lib/types";

type Props = {
  view: "sections" | "text";
  sections: { heading: string | null; body: string }[];
  fullText: string;
  voicemail: string;
  callback: { greeting: string; prompt: string } | null;
  footer: string;
  /** "Saved: script and voicemail…" after a save, shown in the save bar. */
  saved: string | null;
};

const INITIAL: ScriptFormState = { error: null, notice: null, values: null, at: 0 };
const textArea = `${inputStyles} max-h-[70vh] min-h-20 leading-relaxed`;
const titleBox =
  "min-w-0 flex-1 resize-none overflow-hidden rounded-md border border-transparent bg-transparent px-2 py-1.5 text-sm font-semibold leading-snug text-stone-900 hover:border-stone-200 focus:border-field-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-field-100";

/** Height before the page's script runs; after that every box grows to fit its text. */
function rowsFor(text: string, min = 3, max = 22) {
  const lines = text.split("\n").reduce((n, line) => n + Math.max(1, Math.ceil(line.length / 80)), 0);
  return Math.min(max, Math.max(min, lines + 1));
}

function fit(el: HTMLTextAreaElement) {
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight + 2}px`;
}

/** Titles are one line to the agent: Enter doesn't add a line break. */
const noEnter = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
  if (e.key === "Enter") e.preventDefault();
};

/** Warn before closing the tab with unsaved edits. */
function useLeaveWarning(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
}

export function ScriptEditor(props: Props) {
  const [state, action] = useActionState(saveScript, INITIAL);
  const [dirty, setDirty] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  useLeaveWarning(dirty);

  // Size every box to its text, again whenever the form is rebuilt.
  useEffect(() => {
    form.current?.querySelectorAll("textarea").forEach(fit);
  }, [state.at]);

  // After a refused save the form is rebuilt from what was typed (state.values).
  const value = (name: string, fallback: string) => state.values?.[name] ?? fallback;

  return (
    <form
      ref={form}
      key={state.at}
      action={action}
      onInput={(e) => {
        setDirty(true);
        if (e.target instanceof HTMLTextAreaElement) fit(e.target);
      }}
      onChange={() => setDirty(true)}
      className="space-y-4"
    >
      <input type="hidden" name="view" value={props.view} />

      {props.view === "text" ? (
        <Card>
          <textarea
            name="full"
            aria-label="The whole script"
            defaultValue={value("full", props.fullText)}
            rows={rowsFor(props.fullText, 20, 40)}
            className={`${inputStyles} min-h-96 font-mono text-[13px] leading-relaxed`}
          />
          <p className="mt-2 text-xs text-stone-500">Each line in ALL CAPS starts a section. Move, add or delete anything.</p>
        </Card>
      ) : (
        <>
          <input type="hidden" name="count" value={props.sections.length} />
          {props.sections.map((s, i) => {
            const intro = s.heading === null;
            return (
              <section key={i} className="group rounded-xl border border-stone-200 bg-white shadow-sm has-checked:border-rose-200 has-checked:bg-rose-50/40">
                <input type="hidden" name={`orig-${i}`} value={s.heading ?? ""} />
                {intro ? <input type="hidden" name={`intro-${i}`} value="1" /> : null}
                <div className="flex items-start gap-2 border-b border-stone-100 px-3 py-2">
                  <span className="w-5 shrink-0 pt-2 text-right text-xs font-semibold tabular-nums text-stone-400">{i + 1}</span>
                  {intro ? (
                    <span className="min-w-0 flex-1 px-2 py-1.5 text-sm font-semibold text-stone-900">Introduction</span>
                  ) : (
                    <textarea
                      name={`title-${i}`}
                      rows={1}
                      aria-label={`Title of section ${i + 1}`}
                      defaultValue={value(`title-${i}`, headingInput(s.heading))}
                      onKeyDown={noEnter}
                      className={titleBox}
                    />
                  )}
                  <label className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium text-stone-500 hover:bg-stone-50 hover:text-rose-700">
                    <input type="checkbox" name={`remove-${i}`} value="1" defaultChecked={state.values?.[`remove-${i}`] === "1"} className="accent-rose-600" />
                    Remove
                  </label>
                </div>
                <div className="p-3 group-has-checked:opacity-50">
                  <textarea
                    name={`body-${i}`}
                    aria-label={intro ? "Introduction" : `Text of section ${i + 1}`}
                    defaultValue={value(`body-${i}`, s.body)}
                    rows={rowsFor(s.body)}
                    className={textArea}
                  />
                </div>
                <p className="hidden px-4 pb-3 text-xs font-medium text-rose-700 group-has-checked:block">This section is deleted when you save.</p>
              </section>
            );
          })}

          <section className="rounded-xl border border-dashed border-stone-300 bg-stone-50/70">
            <div className="border-b border-dashed border-stone-200 px-3 py-2">
              <textarea
                name="new-title"
                rows={1}
                aria-label="Title of a new section"
                placeholder="+ Add a section: type its title"
                defaultValue={value("new-title", "")}
                onKeyDown={noEnter}
                className={`${titleBox} w-full placeholder:font-medium placeholder:text-field-700`}
              />
            </div>
            <div className="p-3">
              <textarea name="new-body" aria-label="Text of the new section" placeholder="What the agent should do or say. It goes at the end." defaultValue={value("new-body", "")} rows={3} className={textArea} />
            </div>
          </section>
        </>
      )}

      <Card title="Voicemail">
        <p className="mb-2 text-sm text-stone-600">Read out in your voice when a call goes to voicemail. Fill-ins work here too.</p>
        <textarea name="voicemail" aria-label="Voicemail" required defaultValue={value("voicemail", props.voicemail)} rows={rowsFor(props.voicemail, 3, 8)} className={textArea} />
      </Card>

      {props.callback ? (
        <Card title="When someone calls the number back">
          <Field label="What it says when it picks up">
            <textarea name="callback-greeting" required defaultValue={value("callback-greeting", props.callback.greeting)} rows={2} className={textArea} />
          </Field>
          <details className="mt-3" open={Boolean(state.values && state.values["callback-prompt"] !== props.callback.prompt)}>
            <summary className="cursor-pointer text-sm font-medium text-field-700 hover:underline">What it does if they keep talking</summary>
            <textarea
              name="callback-prompt"
              aria-label="What it does if they keep talking"
              defaultValue={value("callback-prompt", props.callback.prompt)}
              rows={rowsFor(props.callback.prompt, 4, 14)}
              className={`${textArea} mt-2`}
            />
          </details>
        </Card>
      ) : null}

      <section className="rounded-xl border border-field-100 bg-field-50 p-4">
        <h2 className="text-sm font-semibold text-field-900">Always added at the end</h2>
        <p className="mt-1 text-sm leading-relaxed text-stone-700">{props.footer}</p>
        <p className="mt-2 text-xs text-stone-500">The one part you can&apos;t remove. It keeps the AI honest about being your assistant when someone asks.</p>
      </section>

      <SaveBar state={state} dirty={dirty} saved={props.saved} />
    </form>
  );
}

/** The test agent's script, as one block of text. No honesty rules: it only ever rings Henry's test phone. */
export function TestScriptEditor({ prompt, saved }: { prompt: string; saved: string | null }) {
  const [state, action] = useActionState(saveTestScript, INITIAL);
  const [dirty, setDirty] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  useLeaveWarning(dirty);
  useEffect(() => {
    form.current?.querySelectorAll("textarea").forEach(fit);
  }, [state.at]);

  return (
    <form
      ref={form}
      key={state.at}
      action={action}
      onInput={(e) => {
        setDirty(true);
        if (e.target instanceof HTMLTextAreaElement) fit(e.target);
      }}
      className="space-y-4"
    >
      <Card>
        <textarea
          name="prompt"
          aria-label="The test script"
          defaultValue={state.values?.prompt ?? prompt}
          rows={rowsFor(prompt, 20, 40)}
          className={`${inputStyles} min-h-96 font-mono text-[13px] leading-relaxed`}
        />
        <p className="mt-2 text-xs text-stone-500">Fill-ins work the same as in the live script.</p>
      </Card>
      <SaveBar state={state} dirty={dirty} saved={saved} idle="Only ever rings your test phone." label="Save test script" />
    </form>
  );
}

/** Overwrites the test script, so it asks first. */
export function CopyLiveButton() {
  return (
    <form
      action={copyLiveToTest}
      onSubmit={(e) => {
        if (!window.confirm("Replace the test script with a copy of the live script?")) e.preventDefault();
      }}
    >
      <button type="submit" className={buttonStyles.quiet}>Start from the live script</button>
    </form>
  );
}

function SaveBar({ state, dirty, saved, idle = "Changes go live on the next call.", label = "Save script" }: {
  state: ScriptFormState;
  dirty: boolean;
  saved: string | null;
  idle?: string;
  label?: string;
}) {
  const { pending } = useFormStatus();
  const [message, tone] = pending
    ? ["Saving to the AI caller…", "text-stone-600"]
    : state.error
      ? [state.error, "font-medium text-rose-700"]
      : state.notice
        ? [state.notice, "text-stone-600"]
        : dirty
          ? ["You have unsaved changes.", "font-medium text-amber-800"]
          : saved
            ? [saved, "font-medium text-field-700"]
            : [idle, "text-stone-600"];
  return (
    <div className="sticky bottom-0 z-10 -mx-4 border-t border-stone-200 bg-white/95 px-4 py-3 shadow-[0_-4px_12px_-6px_rgba(0,0,0,0.12)] backdrop-blur sm:mx-0 sm:rounded-xl sm:border">
      <div className="flex items-center justify-between gap-3">
        <p role={state.error ? "alert" : "status"} className={`min-w-0 flex-1 text-sm ${tone}`}>
          {message}
        </p>
        <button type="submit" disabled={pending} className={`${buttonStyles.primary} shrink-0`}>
          {pending ? "Saving…" : label}
        </button>
      </div>
    </div>
  );
}
