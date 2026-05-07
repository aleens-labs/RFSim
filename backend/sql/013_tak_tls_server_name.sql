alter table user_tak_profile
  add column if not exists tls_server_name text not null default '';
