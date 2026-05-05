create extension if not exists pgcrypto;

create table if not exists app_user (
  id uuid primary key default gen_random_uuid(),
  username text not null,
  email text not null unique,
  password_hash text not null,
  full_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists project (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references app_user(id) on delete cascade,
  name text not null,
  description text not null default '',
  latest_state_json jsonb not null default '{}'::jsonb,
  revision bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists project_snapshot (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references project(id) on delete cascade,
  label text not null,
  state_json jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists user_ai_config (
  id text primary key,
  owner_user_id uuid not null references app_user(id) on delete cascade,
  label text not null default '',
  provider text not null,
  api_key text not null,
  model text not null default '',
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_project_owner_updated on project (owner_user_id, updated_at desc);
create index if not exists idx_project_snapshot_project_created on project_snapshot (project_id, created_at desc);
create index if not exists idx_user_ai_config_owner_position on user_ai_config (owner_user_id, position asc, updated_at desc);
create unique index if not exists idx_app_user_email_lower on app_user (lower(email));
create unique index if not exists idx_app_user_username_lower on app_user (lower(username));
create index if not exists idx_app_user_full_name_lower on app_user (lower(full_name));
