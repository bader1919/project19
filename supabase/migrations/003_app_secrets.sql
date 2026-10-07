-- Server-wide secrets (e.g. a shared Gemini API key used when a user hasn't set their own).
-- Values are inserted manually (SQL editor), never committed to the repo:
--   insert into private.app_secrets (name, value) values ('gemini_api_key', '<key>');
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
create table if not exists private.app_secrets (
  name       text primary key,
  value      text not null,
  updated_at timestamptz not null default now()
);
revoke all on private.app_secrets from public, anon, authenticated;

create or replace function public.app_secret(p_name text)
returns text
language sql
stable
security definer
set search_path = private
as $$ select value from private.app_secrets where name = p_name $$;
revoke execute on function public.app_secret(text) from public, anon, authenticated;
grant execute on function public.app_secret(text) to service_role;
