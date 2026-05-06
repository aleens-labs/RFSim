alter table user_ai_config
  add column if not exists is_server_wide boolean not null default false;

create unique index if not exists idx_user_ai_config_single_server_wide
  on user_ai_config (is_server_wide)
  where is_server_wide = true;

create table if not exists user_server_ai_key_access (
  user_id uuid primary key references app_user(id) on delete cascade,
  granted_by_user_id uuid not null references app_user(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_user_server_ai_key_access_granted_by
  on user_server_ai_key_access (granted_by_user_id, updated_at desc);
