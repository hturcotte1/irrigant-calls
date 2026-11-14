// The call sheet, back out: the original 33 columns in their original order,
// with the results columns filled from the dashboard, plus three extras at the end.

import type { Contact } from "./types.ts";
import { STATUS_LABEL } from "./status.ts";

export const SHEET_COLUMNS = [
  "Call #", "Tier", "Score", "Farm / operation", "Contact", "Role", "Phone", "Phone 2", "Time zone",
  "Their time vs Boise", "City", "County", "State", "Segment", "Crops / livestock", "Size", "Irrigation",
  "Tech / precision ag", "Opening line", "Why they fit (score)", "Email", "Website", "Number check",
  "Where the number came from", "Notes for caller", "Lead ID", "DNC status", "Call status", "Date called",
  "Spoke with", "Outcome / next step", "Follow-up date", "Caller notes",
] as const;

export const EXTRA_COLUMNS = ["Follow-up note", "AI call attempts", "Consent"] as const;

const FROM_FIELDS: Partial<Record<(typeof SHEET_COLUMNS)[number], keyof Contact>> = {
  "Call #": "call_no", "Tier": "tier", "Score": "score", "Farm / operation": "farm", "Contact": "contact_name",
  "Role": "role", "Phone": "phone", "Phone 2": "phone2", "Time zone": "time_zone", "Their time vs Boise": "their_time_vs_boise",
  "City": "city", "County": "county", "State": "state", "Segment": "segment", "Crops / livestock": "crops", "Size": "size",
  "Irrigation": "irrigation", "Tech / precision ag": "tech", "Opening line": "opening_line", "Why they fit (score)": "why_fit",
  "Email": "email", "Website": "website", "Number check": "number_check", "Where the number came from": "number_source",
  "Notes for caller": "notes_for_caller", "Lead ID": "lead_id",
};

export function boiseDate(isoString: string | null): string {
  if (!isoString) return "";
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Boise" }).format(new Date(isoString));
}

function results(c: Contact): Record<string, string> {
  return {
    "DNC status": c.dnc ? `Do not call${c.dnc_reason ? `: ${c.dnc_reason}` : ""}` : "",
    "Call status": c.status === "not_called" ? "" : STATUS_LABEL[c.status],
    "Date called": boiseDate(c.last_called_at),
    "Spoke with": c.spoke_with ?? "",
    "Outcome / next step": c.outcome ?? "",
    "Follow-up date": c.follow_up_date ?? "",
    "Caller notes": c.caller_notes ?? "",
    "Follow-up note": c.follow_up_note ?? "",
    "AI call attempts": String(c.attempts ?? 0),
    "Consent": c.consent_source ?? "",
  };
}

/** Quote when needed, and keep spreadsheet apps from treating a cell as a formula. */
export function csvCell(value: unknown): string {
  let s = value === null || value === undefined ? "" : String(value);
  if (/^[=@]/.test(s) || /^[+-][^\d\s]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function contactsToCsv(contacts: Contact[]): string {
  const header = [...SHEET_COLUMNS, ...EXTRA_COLUMNS];
  const lines = [header.map(csvCell).join(",")];
  for (const c of contacts) {
    const res = results(c);
    const row = header.map((col) => {
      if (col in res) return res[col];
      const raw = c.raw?.[col];
      if (typeof raw === "string") return raw;
      const field = FROM_FIELDS[col as (typeof SHEET_COLUMNS)[number]];
      return field ? (c[field] as unknown) : "";
    });
    lines.push(row.map(csvCell).join(","));
  }
  return "﻿" + lines.join("\r\n") + "\r\n"; // BOM so Excel reads the UTF-8 correctly
}
