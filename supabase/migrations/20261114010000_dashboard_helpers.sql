-- Helpers for the dashboard: pacing for the dialer, and two small summaries the
-- call list needs (PostgREST returns at most 1,000 rows, so counting happens here).

alter table settings add column if not exists calls_per_run integer not null default 1;

create or replace function status_counts()
returns jsonb language sql stable as $$
  select coalesce(jsonb_object_agg(status, n), '{}'::jsonb)
  from (select status, count(*) as n from contacts group by status) s;
$$;

create or replace function contact_facets()
returns jsonb language sql stable as $$
  select jsonb_build_object(
    'tiers', (select coalesce(jsonb_agg(distinct tier order by tier), '[]'::jsonb) from contacts where tier is not null),
    'segments', (select coalesce(jsonb_agg(distinct segment order by segment), '[]'::jsonb) from contacts where segment is not null),
    'states', (select coalesce(jsonb_agg(distinct state order by state), '[]'::jsonb) from contacts where state is not null)
  );
$$;

-- Who the dialer would call next, ignoring the clock. Read-only: the AI page's preview.
create or replace function ai_queue_preview(max_count integer)
returns setof contacts language sql stable as $$
  select c.* from contacts c, settings s
  where s.id = 1
    and c.ai_allowed
    and c.consent_source is not null
    and not c.dnc
    and c.status in ('not_called', 'no_answer', 'voicemail')
    and c.attempts < s.max_attempts
    and (c.next_attempt_after is null or c.next_attempt_after <= now())
  order by c.tier nulls last, c.score desc nulls last, c.call_no nulls last
  limit greatest(max_count, 0);
$$;

create or replace function ai_queue_size()
returns integer language sql stable as $$
  select count(*)::int from contacts c, settings s
  where s.id = 1 and c.ai_allowed and c.consent_source is not null and not c.dnc
    and c.status in ('not_called', 'no_answer', 'voicemail') and c.attempts < s.max_attempts;
$$;
