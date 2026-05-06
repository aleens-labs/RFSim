create table if not exists user_emitter_profile (
  id text primary key,
  owner_user_id uuid not null references app_user(id) on delete cascade,
  name text not null,
  version integer not null default 1,
  sort_position integer not null default 0,
  asset_type text not null default 'radio',
  emitter_label text not null default 'radio',
  force text not null default 'friendly',
  icon text not null default 'radio',
  color text not null default '#38bdf8',
  frequency_mhz double precision not null default 0,
  power_w double precision not null default 0,
  waveform text not null default '',
  profile_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_user_emitter_profile_owner_position
  on user_emitter_profile (owner_user_id, sort_position asc, updated_at desc);

create index if not exists idx_user_emitter_profile_owner_name
  on user_emitter_profile (owner_user_id, lower(name));
