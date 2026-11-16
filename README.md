# Irrigant Calls

Irrigant's outreach dashboard: the call list, follow-ups, and the AI caller that
phones farmers through Retell (voice: ElevenLabs "Nico" on Eleven v4 Turbo).

- **Call list**: every farm from the call sheet, Tier A first, filterable by tier, type, state and status.
  Tap a number to call from your phone, then log how it went in one tap.
- **To follow up**: people who called (208) 928-3200 back, farmers who asked for a call, and meetings.
- **AI caller**: an on/off switch, daily limit, calling hours (in each farmer's own time zone),
  who's up next, and every AI call with its summary, transcript and recording.
- **Script**: everything the AI says, editable: every section of the call script (rename, remove, add, or
  edit it all as one block of text), the voicemail, and what callers hear when they ring back. Changes
  go live on the next call; every save is kept and can be restored; "Call me to test" rings your own phone.
  The **Test script** tab edits a separate test-only agent with no honesty rules (it can say it's Henry);
  the AI caller never uses it, and it only ever rings the test phone.
- **Export CSV**: the call sheet back out, same 33 columns, with the results columns filled in.

## How it fits together

```
Supabase (contacts, calls, settings)
   ^            ^                         ^
   | pages      | results                 | every 5 min: who's due?
Next.js app <-- Retell webhook        scheduler -> /api/cron/dial -> Retell places the call
```

- The browser never talks to the database: all reads and writes run on the server with the
  Supabase secret key, and row level security blocks everything else.
- The dialer claims contacts inside one database statement (`claim_contacts_for_ai`), so two
  overlapping runs can never call the same farmer. A call Retell refused is released and retried
  later; a call whose outcome is unclear keeps its claim, because calling someone twice is worse
  than missing them.
- Retell webhooks are verified with the signing key, may repeat or arrive out of order, and never
  undo something already settled (a do-not-call always sticks).
- The Script page reads and writes the agents in Retell directly (the callback agent is found from the
  phone number), and keeps each version in `script_versions`. If the script was changed in Retell
  itself, that version is saved to the history before it's replaced. Whatever is edited, an honesty
  block is added at the end: asked whether it's a person or Henry, the agent says it's his assistant.

## Where it runs

- **App**: https://irrigant-calls.vercel.app (Vercel project `irrigant-calls`, team HT). Environment
  variables are set in Vercel (names in `.env.example`); `RETELL_API_KEY` must be the Retell key with
  the webhook badge, because Retell signs webhooks with it.
- **Deploys**: until the Vercel account is connected to GitHub, deploy from a checkout with
  `npx vercel deploy --prod`. Once it's connected (`vercel git connect`), every push to `main` deploys.
- **Database**: Supabase project `irrigant-calls`; tables in `supabase/migrations/`, call sheet imported.
- **Scheduler**: Supabase `pg_cron` job `irrigant-dial` calls `/api/cron/dial` every 5 minutes
  (`supabase/scheduler.sql`); its bearer secret lives in Supabase Vault as `cron_secret` and must match
  `CRON_SECRET` in Vercel.
- **Retell**: the outbound, inbound and test agents post to `/api/retell/webhook`.
- The AI caller is off until it's turned on from the **AI caller** page.

## Development

```bash
npm install
cp .env.example .env.local        # fill it in, or set DEMO_MODE=1 to use made-up farms
npm run dev
npm run check                     # types, tests, lint
```

Call sheets and exports never go in this repo (`*.csv` is ignored): they hold people's details.
