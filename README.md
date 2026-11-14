# Irrigant Calls

Irrigant's outreach dashboard: the call list, follow-ups, and the AI caller that
phones farmers in Henry's cloned voice through Retell.

- **Call list**: every farm from the call sheet, Tier A first, filterable by tier, type, state and status.
  Tap a number to call from your phone, then log how it went in one tap.
- **To follow up**: people who called (208) 928-3200 back, farmers who asked for a call, and meetings.
- **AI caller**: an on/off switch, daily limit, calling hours (in each farmer's own time zone),
  who's up next, and every AI call with its summary, transcript and recording.
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

## Setup

1. **Database**: the tables are in `supabase/migrations/`. They're already applied to the
   `irrigant-calls` Supabase project and the call sheet is imported (3,019 contacts).
2. **Vercel**: import this repo, then add the environment variables from `.env.example`.
3. **Scheduler**: follow `supabase/scheduler.sql` (works on any Vercel plan).
4. **Retell**: point the outbound and inbound agents' webhook at
   `https://YOUR-APP.vercel.app/api/retell/webhook`.
5. Open the dashboard, check the Setup card on the **AI caller** page, and turn it on when ready.
   It's off until you do.

## Development

```bash
npm install
cp .env.example .env.local        # fill it in, or set DEMO_MODE=1 to use made-up farms
npm run dev
npm run check                     # types, tests, lint
```

Call sheets and exports never go in this repo (`*.csv` is ignored): they hold people's details.
