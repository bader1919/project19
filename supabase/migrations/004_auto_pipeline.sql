-- Everything automatic: after a video is saved, the transcript and the analysis are
-- produced in the background by (a) the user's PC helper, which fetches captions over
-- a home connection YouTube does not block, and (b) a worker that uses Gemini.

alter table public.video_details
  add column if not exists auto_attempts     int not null default 0,       -- background tries so far
  add column if not exists auto_next_at      timestamptz,                  -- not before this time (lease / back-off)
  add column if not exists transcript_cursor int not null default 0,       -- seconds already transcribed by Gemini (long videos go in parts)
  add column if not exists pc_failed         boolean not null default false, -- the PC helper could not get captions
  add column if not exists helper_done       boolean not null default false; -- the PC helper already reported on this video

alter table public.items
  add column if not exists analysis_attempts int not null default 0,
  add column if not exists analyzed_by       text;                         -- 'gemini' (automatic) or 'claude'

alter table public.user_settings
  add column if not exists helper_seen_at timestamptz;                     -- last time the PC helper checked in

-- Give the PC helper this long to fetch captions before Gemini takes over.
create or replace function private.pc_grace() returns interval language sql immutable as $$ select interval '3 minutes' $$;

/*
 * Pick the next background jobs and lease them for 5 minutes, so overlapping worker
 * runs never process the same item. kind = 'transcript' | 'analysis'.
 */
create or replace function public.claim_auto_jobs(p_limit int default 3)
returns table (item_id uuid, user_id uuid, kind text)
language plpgsql security definer set search_path = public, private as $$
begin
  return query
  with picked as (
    select i.id, i.user_id,
           case when i.status = 'transcript_pending' and v.auto_attempts < 8 then 'transcript' else 'analysis' end as k
      from public.items i
      join public.video_details v on v.item_id = i.id
     where (v.auto_next_at is null or v.auto_next_at <= now())
       and (
         -- no transcript yet: wait for the PC helper first, unless it already gave up
         (i.status = 'transcript_pending' and v.auto_attempts < 8
            and (v.pc_failed or v.transcript_cursor > 0 or i.created_at < now() - private.pc_grace()))
         -- transcript ready (or given up on) but never analysed
         or (i.status in ('fetched', 'transcript_pending') and i.analyzed_at is null and i.analysis_attempts < 5
               and (i.status = 'fetched' or v.auto_attempts >= 8))
       )
     order by i.created_at
     limit greatest(1, least(p_limit, 10))
       for update of v skip locked
  )
  update public.video_details v
     set auto_next_at = now() + interval '5 minutes'
    from picked p
   where v.item_id = p.id
  returning p.id, p.user_id, p.k;
end $$;

revoke all on function public.claim_auto_jobs(int) from public, anon, authenticated;
grant execute on function public.claim_auto_jobs(int) to service_role;
revoke all on function private.pc_grace() from public, anon, authenticated;

-- Run the worker every minute. The URL and shared secret live in private.app_secrets
-- (rows 'worker_url' and 'worker_secret', inserted by hand, never committed).

create or replace function private.kick_worker() returns void
language plpgsql security definer set search_path = public, private as $$
declare
  v_url text := (select value from private.app_secrets where name = 'worker_url');
  v_secret text := (select value from private.app_secrets where name = 'worker_secret');
begin
  if v_url is null or v_secret is null then return; end if;
  -- Only call out when there is work, so an idle library costs nothing.
  if not exists (
    select 1 from public.items i join public.video_details v on v.item_id = i.id
     where (v.auto_next_at is null or v.auto_next_at <= now())
       and ((i.status = 'transcript_pending' and v.auto_attempts < 8)
            or (i.analyzed_at is null and i.analysis_attempts < 5
                and (i.status = 'fetched' or (i.status = 'transcript_pending' and v.auto_attempts >= 8))))
  ) then return; end if;
  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-worker-secret', v_secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 150000
  );
end $$;

revoke all on function private.kick_worker() from public, anon, authenticated;

-- (Skipped where pg_cron isn't available, e.g. the local test database.)
do $do$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.unschedule(jobid) from cron.job where jobname = 'refvault-worker';
    perform cron.schedule('refvault-worker', '* * * * *', 'select private.kick_worker()');
  end if;
end $do$;
