# CLAUDE.md

Read AGENTS.md first: it holds the Next.js 16 rules (this is not the Next.js in your training data).

## What this is

Irrigant's outreach dashboard (Next.js 16 + Supabase + Retell). See README.md for the parts.

## Rules

- Never commit a call sheet, an export, or anyone's contact details. `*.csv` is gitignored; keep it that way.
- The Supabase secret key is server-only. Pages read data through `src/lib/store` (`getStore()`), never from the browser.
- Schema changes go in a new file under `supabase/migrations/`.
- The AI caller must never call a contact that is do-not-call, has no consent recorded, is `ai_allowed = false`,
  or was already reached. That rule lives in `claim_contacts_for_ai`; don't add a second path that dials.
  The one exception is the Script page's test call (`testCall` in `src/app/actions.ts`): it only rings the
  test phone in settings, refuses any number on the call list, and is never linked to a contact.
- Calling someone twice is worse than missing them: an unclear Retell result keeps the claim (see `src/lib/dialer.ts`).
- Webhook handling must stay idempotent and never undo a settled status (`src/lib/retell-map.ts`, tested in `tests/`).
- The agent must never claim to be Henry or a human on real calls. Henry can edit every word of the script
  on the Script page, so `src/lib/script.ts` enforces this: every saved script ends with the honesty block
  (`FOOTER_*`), and `honestyProblem` refuses plain instructions to pass as Henry or a person. Keep both.
  The only script without them is the test agent's (`RETELL_TEST_AGENT_ID`, the Script page's Test tab),
  so Henry can hear any version on his own phone. Only `testCall` uses that agent. Never use it in the
  dialer, attach it to the phone number, or let it ring anyone but the test phone.

## Commands

```bash
npm run dev        # DEMO_MODE=1 for made-up farms without a database
npm run check      # typecheck + tests + lint
npm run build
```
