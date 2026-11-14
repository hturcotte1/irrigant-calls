-- The AI caller's clock: call /api/cron/dial every 5 minutes from Supabase itself,
-- so it works on any Vercel plan (Vercel's Hobby plan only allows daily crons).
--
-- 1. Store the same CRON_SECRET you set in Vercel (run once in the Supabase SQL editor,
--    replacing the placeholder; the value stays in Supabase Vault, encrypted):
--      select vault.create_secret('<your CRON_SECRET>', 'cron_secret');
-- 2. Replace https://YOUR-APP.vercel.app below with the deployed address, then run the rest.

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('irrigant-dial') where exists (select 1 from cron.job where jobname = 'irrigant-dial');

select cron.schedule(
  'irrigant-dial',
  '*/5 * * * *',
  $$
  select net.http_get(
    url := 'https://YOUR-APP.vercel.app/api/cron/dial',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    timeout_milliseconds := 55000
  );
  $$
);

-- To pause the clock entirely (the "Turn off" switch on the AI page is usually enough):
--   select cron.unschedule('irrigant-dial');
