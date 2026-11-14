-- Irrigant calls: contacts from the call sheet, every call (AI, manual, inbound), and dialer settings.
--
-- Row level security is on with no policies, so only the server (secret key)
-- can read or write. The browser never talks to the database directly.

create extension if not exists pgcrypto;

create table if not exists contacts (
  id uuid primary key default gen_random_uuid(),
  lead_id text unique not null,              -- "Lead ID" (IRR-0001)
  call_no integer,                           -- "Call #"
  tier text,                                 -- A, B, C
  score integer,
  farm text not null,                        -- "Farm / operation"
  contact_name text,                         -- "Contact"
  first_name text,                           -- first word of contact_name
  role text,
  phone text not null,                       -- E.164, e.g. +12085551234
  phone2 text,
  time_zone text,                            -- as written in the sheet
  tz text,                                   -- IANA zone used for calling hours
  their_time_vs_boise text,
  city text,
  county text,
  state text,
  segment text,
  crops text,                                -- "Crops / livestock"
  size text,
  irrigation text,
  tech text,                                 -- "Tech / precision ag"
  opening_line text,
  why_fit text,                              -- "Why they fit (score)"
  email text,
  website text,
  number_check text,
  number_source text,                        -- "Where the number came from"
  notes_for_caller text,
  raw jsonb,                                 -- the original sheet row, untouched

  consent_source text,                       -- how they agreed to be called
  consent_recorded_at timestamptz,
  ai_allowed boolean not null default true,  -- false: Henry calls them himself
  ai_block_reason text,

  dnc boolean not null default false,
  dnc_at timestamptz,
  dnc_reason text,

  -- not_called | no_answer | voicemail | spoke | follow_up | meeting | not_interested | wrong_number | dnc
  status text not null default 'not_called',
  spoke_with text,
  outcome text,                              -- "Outcome / next step"
  follow_up_date date,
  follow_up_note text,                       -- preferred times, what they asked for
  caller_notes text,

  attempts integer not null default 0,       -- AI attempts
  last_called_at timestamptz,
  last_call_kind text,                       -- ai | manual | inbound
  next_attempt_after timestamptz,            -- also the dialer's claim on a contact

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists contacts_status_idx on contacts (status);
create index if not exists contacts_priority_idx on contacts (tier, score desc, call_no);
create index if not exists contacts_phone_idx on contacts (phone);
create index if not exists contacts_phone2_idx on contacts (phone2);
create index if not exists contacts_follow_up_idx on contacts (follow_up_date);

create table if not exists calls (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid references contacts (id) on delete set null,
  kind text not null,                        -- ai | manual | inbound
  direction text not null,                   -- outbound | inbound
  retell_call_id text unique,
  from_number text,
  to_number text,
  started_at timestamptz,
  ended_at timestamptz,
  duration_s integer,
  status text,                               -- registered | ongoing | ended | error | logged
  disconnection_reason text,
  in_voicemail boolean,
  outcome text,
  interest_level text,
  preferred_times text,
  summary text,
  transcript text,
  recording_url text,
  analysis jsonb,
  notes text,
  handled boolean not null default false,    -- inbound callbacks: Henry has dealt with it
  created_at timestamptz not null default now()
);

create index if not exists calls_contact_idx on calls (contact_id, created_at desc);
create index if not exists calls_kind_idx on calls (kind, created_at desc);

create table if not exists settings (
  id integer primary key default 1 check (id = 1),
  ai_enabled boolean not null default false, -- the dialer does nothing until this is on
  daily_cap integer not null default 50,
  call_start_hour integer not null default 10, -- in the contact's own time zone
  call_end_hour integer not null default 19,
  call_days integer[] not null default '{1,2,3,4,5}', -- ISO weekdays, Monday = 1
  max_attempts integer not null default 3,
  retry_gap_hours integer not null default 48,
  updated_at timestamptz not null default now()
);

insert into settings (id) values (1) on conflict (id) do nothing;

alter table contacts enable row level security;
alter table calls enable row level security;
alter table settings enable row level security;

create or replace function touch_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists contacts_touch on contacts;
create trigger contacts_touch before update on contacts for each row execute function touch_updated_at();
drop trigger if exists settings_touch on settings;
create trigger settings_touch before update on settings for each row execute function touch_updated_at();

-- The dialer's claim: picks contacts that may be called right now and marks
-- them in one statement, so two overlapping runs can never call the same person.
create or replace function claim_contacts_for_ai(max_count integer)
returns setof contacts language plpgsql as $$
declare
  s settings%rowtype;
begin
  select * into s from settings where id = 1;
  return query
  with picked as (
    select c.id from contacts c
    where c.ai_allowed
      and c.consent_source is not null
      and not c.dnc
      and c.status in ('not_called', 'no_answer', 'voicemail')
      and c.attempts < s.max_attempts
      and (c.next_attempt_after is null or c.next_attempt_after <= now())
      and c.tz is not null
      and extract(isodow from (now() at time zone c.tz))::int = any (s.call_days)
      and extract(hour from (now() at time zone c.tz))::int >= s.call_start_hour
      and extract(hour from (now() at time zone c.tz))::int < s.call_end_hour
    order by c.tier nulls last, c.score desc nulls last, c.call_no nulls last
    limit greatest(max_count, 0)
    for update skip locked
  )
  update contacts c
     set attempts = c.attempts + 1,
         last_called_at = now(),
         last_call_kind = 'ai',
         next_attempt_after = now() + make_interval(hours => s.retry_gap_hours)
    from picked
   where c.id = picked.id
  returning c.*;
end $$;
