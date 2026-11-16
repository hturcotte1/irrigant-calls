// The AI's script, as the dashboard edits it. A Retell prompt is plain text with
// ALL-CAPS headings; each heading starts a section. Henry can change all of it.
// One block is always added at the end of whatever he saves (FOOTER_*): on real
// calls the agent tells the truth when asked whether it's a person or Henry.
// honestyProblem() refuses edits that plainly tell it otherwise.

export type ScriptSection = { heading: string | null; body: string };

const HEADING = /^[A-Z][A-Z0-9 ,:'’&-]*[A-Z0-9)](\s*\([^)]*\))?$/;

export const FOOTER_HEADING = "ALWAYS TRUE, WHATEVER ELSE THIS SCRIPT SAYS";
export const FOOTER_BODY =
  "If anyone asks whether you're a real person, a robot or a computer, or whether you're Henry, tell them honestly that you're an automated assistant for Henry at Irrigant, and that Henry is a real person who'll follow up himself. If they seem to think they're talking to Henry, gently let them know you're his assistant. Never claim to be Henry or any other human. This comes before anything above.";

/** The fill-ins every call gets (see call-vars.ts). */
export const VARIABLES = [
  { name: "first_name", means: "their first name" },
  { name: "farm_name", means: "their farm's name" },
  { name: "location", means: "where they're located" },
  { name: "known_context", means: "what your list says about their operation" },
] as const;

// Retell fills these in by itself.
const SYSTEM_VARIABLES = new Set(["current_time", "current_calendar", "user_number", "agent_number", "call_id", "direction", "session_type", "session_duration"]);

export function isHeading(line: string): boolean {
  const t = line.trim();
  return t.length > 2 && t.length < 90 && HEADING.test(t);
}

export function parseScript(prompt: string): ScriptSection[] {
  const sections: ScriptSection[] = [];
  let current: ScriptSection = { heading: null, body: "" };
  const lines: string[] = [];
  const flush = () => {
    current.body = lines.join("\n").replace(/^\s*\n/, "").trimEnd();
    if (current.heading !== null || current.body) sections.push(current);
    lines.length = 0;
  };
  for (const line of prompt.replace(/\r\n/g, "\n").split("\n")) {
    if (isHeading(line)) {
      flush();
      current = { heading: line.trim(), body: "" };
    } else {
      lines.push(line);
    }
  }
  flush();
  return sections;
}

export function serializeScript(sections: ScriptSection[]): string {
  return sections
    .filter((s) => s.heading || s.body.trim())
    .map((s) => (s.heading ? `${s.heading}\n${s.body.trim()}` : s.body.trim()))
    .join("\n\n");
}

const isFooter = (s: ScriptSection) => s.heading === FOOTER_HEADING;

/** Everything Henry edits: the whole script except the block the app adds. */
export function editableSections(prompt: string): ScriptSection[] {
  return parseScript(prompt).filter((s) => !isFooter(s));
}

export function editableText(prompt: string): string {
  return serializeScript(editableSections(prompt));
}

/** What goes to Retell: Henry's sections, then the honesty block. */
export function finalScript(sections: ScriptSection[]): string {
  return serializeScript([...sections.filter((s) => !isFooter(s)), { heading: FOOTER_HEADING, body: FOOTER_BODY }]);
}

/** "THE HEART OF THE CALL: THEIR OPERATION (note)" -> { title: "The heart of the call: their operation", note: "note" } */
export function prettyHeading(heading: string | null): { title: string; note: string | null } {
  if (!heading) return { title: "Introduction", note: null };
  const m = /^(.*?)\s*(\(([^)]*)\))?$/.exec(heading);
  const base = (m?.[1] ?? heading).toLowerCase();
  return { title: base.charAt(0).toUpperCase() + base.slice(1).replace(/\bhelios\b/g, "Helios").replace(/\bhenry\b/g, "Henry").replace(/\bai\b/g, "AI"), note: m?.[3] ?? null };
}

/** A heading as its title box shows it: "What Helios is (say only what is here)". */
export function headingInput(heading: string | null): string {
  if (!heading) return "";
  const { title, note } = prettyHeading(heading);
  return note ? `${title} (${note})` : title;
}

/** Whatever was typed in a title box, as a heading the agent reads: ALL CAPS, with an optional note in brackets. */
export function toHeading(input: string): string | null {
  const raw = input.replace(/\s+/g, " ").trim();
  if (!raw) return null;
  const m = /^(.*?)\s*\(([^()]*)\)$/.exec(raw);
  const main = (m ? m[1] : raw)
    .toUpperCase()
    .replace(/[^A-Z0-9 ,:'’&-]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[^A-Z]+/, "")
    .slice(0, 70)
    .replace(/[^A-Z0-9]+$/, "");
  const note = (m?.[2] ?? "").replace(/\s+/g, " ").trim().slice(0, Math.max(0, 85 - main.length));
  const heading = note ? `${main} (${note})` : main;
  return isHeading(heading) ? heading : "MORE INSTRUCTIONS";
}

/** An untouched title box keeps its heading exactly; a changed one is cleaned up. */
export function headingFor(input: string, original: string | null): string | null {
  if (original && input.replace(/\s+/g, " ").trim() === headingInput(original)) return original;
  return toHeading(input);
}

export type SectionInput = { title: string; body: string; original: string | null; intro: boolean };

/** The script from the section editor, in order. A section with no title and no text is dropped. */
export function buildSections(inputs: SectionInput[]): ScriptSection[] {
  const out: ScriptSection[] = [];
  for (const input of inputs) {
    const body = input.body.replace(/\r\n/g, "\n").trimEnd();
    const heading = input.intro ? null : headingFor(input.title, input.original);
    if (heading === FOOTER_HEADING || (!heading && !body.trim())) continue;
    out.push({ heading, body });
  }
  return out;
}

const NEGATION = /\b(?:never|not|don['’]t|dont|do not|doesn['’]t|cannot|can['’]t|won['’]t|mustn['’]t)\b/i;
const QUESTION = /\b(?:if|whether|ask|asks|asked|asking|wonder|wonders)\b/i;

const RULES: { pattern: RegExp; why: string; negatable: boolean }[] = [
  {
    why: "tells the agent to say it's Henry",
    negatable: true,
    pattern:
      /\b(?:(?:you are|you['’]re|youre|your name is|introduce yourself as|pretend to be|pretend you['’]re|pretend you are|claim to be|claim you['’]re|claim you are|act as|speak as|i['’]m|i am|my name is|this is|it['’]s)\s+henry\b(?!['’]s)|henry here\b)/gi,
  },
  {
    why: "tells the agent to say it's a person",
    negatable: true,
    pattern:
      /\b(?:you are|you['’]re|youre|pretend to be|pretend you['’]re|pretend you are|claim to be|claim you['’]re|claim you are|say you['’]re|say you are|say that you['’]re|say that you are|tell them you['’]re|tell them you are|i['’]m|i am)\s+(?:a |an )?(?:real |actual |live )?(?:human|person|man|woman)\b/gi,
  },
  {
    why: "tells the agent to deny being automated",
    negatable: true,
    pattern: /\b(?:you are|you['’]re|i['’]m|i am)\s+not\s+(?:a |an )?(?:ai|a\.i\.|robot|bot|computer|machine|recording|automated|virtual)\b/gi,
  },
  {
    why: "tells the agent to hide that it's automated",
    negatable: false,
    pattern:
      /\b(?:don['’]t|dont|do not|never|avoid)\s+(?:say|saying|admit|admitting|reveal|revealing|tell (?:them|anyone|people)|telling (?:them|anyone|people)|mention|mentioning|confirm|confirming|disclose|disclosing|let (?:them|anyone) know)\s+(?:that\s+)?(?:you['’]re|you are|you)\s+(?:an?\s+)?(?:ai|a\.i\.|automated|robot|bot|computer|machine|virtual|artificial|assistant|recording)\b/gi,
  },
  { why: "tells the agent to deny being automated", negatable: false, pattern: /\bdeny\s+(?:being|that you['’]re|that you are|you['’]re|you are)\b/gi },
];

/** The text just before `index`, back to the last stop character. */
function clauseBefore(text: string, index: number, stops: RegExp, max: number): string {
  const chunk = text.slice(Math.max(0, index - max), index);
  let cut = -1;
  for (let i = chunk.length - 1; i >= 0; i--) {
    if (stops.test(chunk[i])) {
      cut = i;
      break;
    }
  }
  return chunk.slice(cut + 1);
}

/**
 * Why this text can't go out on real calls, or null. It catches plain instructions
 * to pass as Henry or a person ("this is Henry", "say you're a real person",
 * "never admit you're an AI"); "never say you're Henry" and "if they ask whether
 * you're a person..." are fine. The footer covers whatever this misses.
 */
export function honestyProblem(text: string): string | null {
  for (const rule of RULES) {
    for (const m of text.matchAll(rule.pattern)) {
      const at = m.index ?? 0;
      if (rule.negatable) {
        if (NEGATION.test(clauseBefore(text, at, /[.!?\n;,]/, 80))) continue;
        if (QUESTION.test(clauseBefore(text, at, /[.!?\n;:,"“”]/, 50))) continue;
      }
      return `“${m[0].trim()}” ${rule.why}`;
    }
  }
  return null;
}

/** Fill-ins the script no longer uses, so the agent won't get that detail. */
export function missingVariables(prompt: string): string[] {
  return VARIABLES.filter((v) => !new RegExp(`\\{\\{\\s*${v.name}\\s*\\}\\}`).test(prompt)).map((v) => v.name);
}

/** {{things}} no call fills in, usually a typo. */
export function unknownVariables(text: string): string[] {
  const known = new Set<string>(VARIABLES.map((v) => v.name));
  const found = new Set<string>();
  for (const m of text.matchAll(/\{\{\s*([^{}\s]+)\s*\}\}/g)) {
    const name = m[1];
    if (!known.has(name) && !SYSTEM_VARIABLES.has(name) && !name.startsWith("current_time")) found.add(name);
  }
  return [...found];
}
