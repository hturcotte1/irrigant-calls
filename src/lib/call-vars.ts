// What the AI agent is told about the person it's calling. The Retell agent's
// prompt reads these four as {{first_name}}, {{farm_name}}, {{location}} and
// {{known_context}}; a blank value means "we don't know".

import type { Contact } from "./types.ts";

export const STATE_NAMES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado", CT: "Connecticut",
  DE: "Delaware", FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa",
  KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan",
  MN: "Minnesota", MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire",
  NJ: "New Jersey", NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio",
  OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota",
  TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia", WA: "Washington", WV: "West Virginia",
  WI: "Wisconsin", WY: "Wyoming",
};

const clean = (v: string | null | undefined) => (v ?? "").replace(/\s+/g, " ").trim();
const same = (a: string, b: string) => a.toLowerCase().replace(/[^a-z]/g, "") === b.toLowerCase().replace(/[^a-z]/g, "");

/** "Petaluma, California"; "Humboldt County, California"; or just the state. Said out loud, so no abbreviations. */
export function spokenLocation(c: Pick<Contact, "city" | "county" | "state">): string {
  const state = STATE_NAMES[clean(c.state).toUpperCase()] ?? clean(c.state);
  const city = clean(c.city);
  const county = clean(c.county);
  if (city) return state ? `${city}, ${state}` : city;
  if (county) return `${county.replace(/\s+county$/i, "")} County${state ? `, ${state}` : ""}`;
  return state;
}

/** The farm name to say, or blank when it's just the person's own name (or missing). */
export function spokenFarm(c: Pick<Contact, "farm" | "contact_name">): string {
  const farm = clean(c.farm);
  if (!farm || farm === "(no farm name)") return "";
  if (c.contact_name && same(farm, clean(c.contact_name))) return "";
  // "Heglar Creek Farms (Heglar Creek Dairy LLC)" -> "Heglar Creek Farms"; "Sunrise Organic Dairy, LLC" -> "Sunrise Organic Dairy".
  // Nobody says "LLC" out loud.
  return farm.replace(/\s*\(.*?\)\s*$/, "").replace(LEGAL_ENDING, "").trim();
}

const LEGAL_ENDING = /[\s,]+(?:L\.?L\.?C\.?|P\.?L\.?L\.?C\.?|L\.?L\.?L\.?P\.?|L\.?L\.?P\.?|L\.?P\.?|Inc\.?|Incorporated|Corp\.?|Corporation|Ltd\.?|Limited)$/i;

/** Facts from the sheet the agent may bring up, one at a time. Never internal sourcing notes. */
export function knownContext(c: Contact, maxLength = 700): string {
  const parts: string[] = [];
  const add = (label: string, value: string | null | undefined) => {
    const v = clean(value);
    if (v) parts.push(`${label}: ${v}`);
  };
  add("Grows or raises", c.crops);
  add("Size", c.size);
  add("Irrigation", c.irrigation);
  add("Equipment and tech", c.tech);
  add("Type of operation", c.segment);
  add("Listed as", c.role);
  add("Suggested opener", c.opening_line);
  add("Notes", c.notes_for_caller);
  const text = parts.join(". ");
  return text.length > maxLength ? `${text.slice(0, maxLength - 1).trimEnd()}…` : text;
}

export function callVariables(c: Contact): Record<string, string> {
  return {
    first_name: clean(c.first_name),
    farm_name: spokenFarm(c),
    location: spokenLocation(c),
    known_context: knownContext(c),
  };
}
