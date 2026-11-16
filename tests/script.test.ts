import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FOOTER_HEADING, buildSections, editableSections, editableText, finalScript, headingFor, headingInput, honestyProblem,
  missingVariables, parseScript, prettyHeading, serializeScript, toHeading, unknownVariables,
} from "../src/lib/script.ts";

const PROMPT = `You are Henry's virtual assistant at Irrigant.

WHAT WE KNOW ABOUT THEM (blank means we don't know)
- Name: {{first_name}}
- Farm: {{farm_name}}

YOUR FIRST LINE
Say: "Hi, is this {{first_name}} from {{farm_name}}?"

WHO YOU ARE
If they ask "Is this Henry?", or whether you're a real person, a robot or a computer, say you're Henry's automated assistant. Never claim to be Henry or any human.

THE HEART OF THE CALL: THEIR OPERATION
- what they grow

- how they irrigate

RULES (never break these)
- Never quote a price.`;

test("a script splits into its sections and goes back together unchanged", () => {
  const sections = parseScript(PROMPT);
  assert.deepEqual(sections.map((s) => s.heading), [null, "WHAT WE KNOW ABOUT THEM (blank means we don't know)", "YOUR FIRST LINE", "WHO YOU ARE", "THE HEART OF THE CALL: THEIR OPERATION", "RULES (never break these)"]);
  assert.equal(serializeScript(sections), PROMPT);
});

test("the honesty block is added once at the end and never shows up as an editable section", () => {
  const final = finalScript(parseScript(PROMPT));
  assert.ok(final.startsWith(PROMPT));
  assert.ok(final.endsWith("This comes before anything above."));
  assert.equal(final.split(FOOTER_HEADING).length, 2);
  assert.equal(editableText(final), PROMPT);
  assert.equal(finalScript(editableSections(final)), final);
});

test("every section can be edited, renamed, removed or added, and an untouched editor changes nothing", () => {
  const sections = editableSections(PROMPT);
  const untouched = sections.map((s) => ({ title: headingInput(s.heading), body: s.body.replace(/\n/g, "\r\n"), original: s.heading, intro: s.heading === null }));
  assert.equal(serializeScript(buildSections(untouched)), PROMPT);

  const edited = untouched.map((s) => ({ ...s }));
  edited[1].body = "- Name: {{first_name}}"; // the per-farmer block is editable too
  edited[3].title = "Who you are, and Helios (keep it short)";
  edited[3].body = "You're Henry's automated assistant.";
  edited.splice(4, 1); // remove THE HEART OF THE CALL
  edited.push({ title: "Pricing questions?", body: "Henry covers pricing himself.", original: null, intro: false });
  const out = serializeScript(buildSections(edited));
  assert.doesNotMatch(out, /Farm: \{\{farm_name\}\}/);
  assert.match(out, /WHO YOU ARE, AND HELIOS \(keep it short\)\nYou're Henry's automated assistant\./);
  assert.doesNotMatch(out, /THE HEART OF THE CALL/);
  assert.match(out, /PRICING QUESTIONS\nHenry covers pricing himself\.$/);
  assert.deepEqual(parseScript(out).map((s) => s.heading).slice(-2), ["RULES (never break these)", "PRICING QUESTIONS"]);

  // A section emptied of both title and text disappears; the app's own block can't be typed in.
  assert.deepEqual(buildSections([{ title: "", body: "  ", original: "ENERGY", intro: false }, { title: FOOTER_HEADING, body: "x", original: null, intro: false }]), []);
});

test("titles: readable in the box, ALL CAPS for the agent", () => {
  assert.deepEqual(prettyHeading("BRINGING UP HELIOS (only once you understand their operation)"), { title: "Bringing up Helios", note: "only once you understand their operation" });
  assert.equal(headingInput("WHAT HELIOS IS (say only what is here)"), "What Helios is (say only what is here)");
  assert.equal(headingFor("What Helios is (say only what is here)", "WHAT HELIOS IS (say only what is here)"), "WHAT HELIOS IS (say only what is here)");
  assert.equal(toHeading("  step 2: the pitch!  "), "STEP 2: THE PITCH");
  assert.equal(toHeading("Q&A (if they push)"), "Q&A (if they push)");
  assert.equal(toHeading("?!"), "MORE INSTRUCTIONS");
  assert.equal(toHeading(""), null);
});

test("honesty check: plain instructions to pass as Henry or a person are refused", () => {
  for (const bad of [
    'Say: "Hi, this is Henry from Irrigant."',
    "You are Henry, the founder.",
    "If they ask, say you're a real person.",
    "Never admit you're an AI.",
    "Don't tell them you are automated.",
    "If they ask, I'm not a robot, I'm just calling about water.",
    "Don't be pushy, and say \"this is Henry\" when they pick up.",
    "Deny being an assistant.",
  ]) {
    assert.ok(honestyProblem(bad), `should refuse: ${bad}`);
  }
  assert.match(honestyProblem('Say: "Hi, this is Henry."') ?? "", /“this is Henry” tells the agent to say it's Henry/);
});

test("honesty check: honest wording and talk about Helios pass", () => {
  for (const ok of [
    PROMPT,
    "Never claim to be Henry or any human.",
    "Never say you're Henry, and never say you're a person.",
    "If they ask whether this is Henry, say you're his assistant.",
    "If they ask whether you're a real person or Henry, say you're Henry's automated assistant.",
    "You answer incoming calls in Henry's voice, but you are not Henry: you're his automated assistant.",
    "Henry is a real person who'll follow up himself.",
    "Don't use the word AI when you talk about Helios. Don't say it's an AI tool.",
    "Sound like a real person: relaxed and upbeat.",
    "You're not a replacement for their agronomist.",
  ]) {
    assert.equal(honestyProblem(ok), null, `should pass: ${ok}`);
  }
});

test("fill-ins the script dropped, and typos", () => {
  assert.deepEqual(missingVariables(PROMPT), ["location", "known_context"]);
  assert.deepEqual(unknownVariables("Hi {{first_name}} from {{farm}}, it's {{current_time_America/Boise}}"), ["farm"]);
});
