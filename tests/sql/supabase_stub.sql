-- Minimal stand-in for the parts of Supabase the migration depends on,
-- so the schema can be tested against a plain local PostgreSQL.
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key);
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role bypassrls; end if;
end $$;
grant usage on schema public, auth to authenticated, service_role;
grant execute on function auth.uid() to authenticated, service_role;
