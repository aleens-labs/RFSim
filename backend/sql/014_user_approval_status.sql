alter table app_user
  add column if not exists account_status text not null default 'approved',
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by_user_id uuid references app_user(id) on delete set null;

update app_user
   set account_status = 'approved',
       approved_at = coalesce(approved_at, created_at)
 where account_status is null
    or account_status = 'approved';

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'app_user_account_status_check'
       and conrelid = 'app_user'::regclass
  ) then
    alter table app_user
      add constraint app_user_account_status_check
      check (account_status in ('pending', 'approved'));
  end if;
end $$;

create index if not exists idx_app_user_account_status_created
  on app_user (account_status, created_at desc);
