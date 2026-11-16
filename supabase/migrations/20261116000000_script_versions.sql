-- Editing the AI's script from the dashboard: every save is kept, so an earlier
-- version can be restored, and "Call me to test" rings the number in settings.

create table if not exists script_versions (
  id uuid primary key default gen_random_uuid(),
  prompt text not null,
  voicemail text,
  note text,                                  -- e.g. "Restored from Nov 16, 3:05 PM"
  created_at timestamptz not null default now()
);

-- What callers hear when they ring the number back (the inbound agent).
-- Blank in a version means "leave it as it is" on restore.
alter table script_versions add column if not exists callback_greeting text;
alter table script_versions add column if not exists callback_prompt text;

create index if not exists script_versions_created_idx on script_versions (created_at desc);
alter table script_versions enable row level security;

alter table settings add column if not exists test_phone text;
