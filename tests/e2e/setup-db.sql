-- Extra pieces for running the app against PostgREST locally (on top of tests/sql/supabase_stub.sql)
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(coalesce(current_setting('request.jwt.claim.sub', true),
                         (nullif(current_setting('request.jwt.claims', true), '')::json ->> 'sub')), '')::uuid
$$;
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticator') then
    create role authenticator login noinherit password 'e2e';
  end if;
end $$;
grant anon, authenticated, service_role to authenticator;
grant usage on schema public to anon;
