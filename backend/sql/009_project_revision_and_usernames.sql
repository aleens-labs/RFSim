alter table app_user
  add column if not exists username text;

update app_user
set username = left(
  coalesce(
    nullif(regexp_replace(lower(split_part(email, '@', 1)), '[^a-z0-9._-]+', '-', 'g'), ''),
    'user-' || left(replace(id::text, '-', ''), 12)
  ),
  120
)
where username is null or btrim(username) = '';

alter table app_user
  alter column username set not null;

alter table project
  add column if not exists revision bigint not null default 0;

create unique index if not exists idx_app_user_email_lower on app_user (lower(email));
create unique index if not exists idx_app_user_username_lower on app_user (lower(username));
create index if not exists idx_app_user_full_name_lower on app_user (lower(full_name));

create or replace function touch_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_touch_app_user_updated_at') then
    create trigger trg_touch_app_user_updated_at
      before update on app_user
      for each row
      execute function touch_updated_at();
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'trg_touch_project_updated_at') then
    create trigger trg_touch_project_updated_at
      before update on project
      for each row
      execute function touch_updated_at();
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'trg_touch_user_ai_config_updated_at') then
    create trigger trg_touch_user_ai_config_updated_at
      before update on user_ai_config
      for each row
      execute function touch_updated_at();
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'trg_touch_user_tak_profile_updated_at') then
    create trigger trg_touch_user_tak_profile_updated_at
      before update on user_tak_profile
      for each row
      execute function touch_updated_at();
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'trg_touch_project_tak_binding_updated_at') then
    create trigger trg_touch_project_tak_binding_updated_at
      before update on project_tak_binding
      for each row
      execute function touch_updated_at();
  end if;
end $$;
