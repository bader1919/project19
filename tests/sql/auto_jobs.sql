-- Which videos does the background worker pick up, and when? (migration 004)
-- Run after the migrations: psql -v ON_ERROR_STOP=1 -f tests/sql/auto_jobs.sql
begin;
insert into auth.users values ('33333333-3333-3333-3333-333333333333');
insert into items (id, user_id, title, status, created_at, analyzed_at, analysis_attempts) values
  ('c0000000-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333', 'new, no transcript',     'transcript_pending', now(),                      null, 0),
  ('c0000000-0000-0000-0000-000000000002', '33333333-3333-3333-3333-333333333333', 'old, no transcript',     'transcript_pending', now() - interval '10 min',  null, 0),
  ('c0000000-0000-0000-0000-000000000003', '33333333-3333-3333-3333-333333333333', 'new, PC failed',         'transcript_pending', now(),                      null, 0),
  ('c0000000-0000-0000-0000-000000000004', '33333333-3333-3333-3333-333333333333', 'transcript, unanalyzed', 'fetched',            now(),                      null, 0),
  ('c0000000-0000-0000-0000-000000000005', '33333333-3333-3333-3333-333333333333', 'analyzed',               'analyzed',           now(),                      now(), 0),
  ('c0000000-0000-0000-0000-000000000006', '33333333-3333-3333-3333-333333333333', 'analysis gave up',       'fetched',            now(),                      null, 5),
  ('c0000000-0000-0000-0000-000000000007', '33333333-3333-3333-3333-333333333333', 'transcript gave up',     'transcript_pending', now() - interval '1 day',   null, 0),
  ('c0000000-0000-0000-0000-000000000008', '33333333-3333-3333-3333-333333333333', 'backing off',            'transcript_pending', now() - interval '1 day',   null, 0);
insert into video_details (item_id, user_id, youtube_id, pc_failed, auto_attempts, auto_next_at) values
  ('c0000000-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333', 'v1', false, 0, null),
  ('c0000000-0000-0000-0000-000000000002', '33333333-3333-3333-3333-333333333333', 'v2', false, 0, null),
  ('c0000000-0000-0000-0000-000000000003', '33333333-3333-3333-3333-333333333333', 'v3', true,  0, null),
  ('c0000000-0000-0000-0000-000000000004', '33333333-3333-3333-3333-333333333333', 'v4', false, 0, null),
  ('c0000000-0000-0000-0000-000000000005', '33333333-3333-3333-3333-333333333333', 'v5', false, 0, null),
  ('c0000000-0000-0000-0000-000000000006', '33333333-3333-3333-3333-333333333333', 'v6', false, 0, null),
  ('c0000000-0000-0000-0000-000000000007', '33333333-3333-3333-3333-333333333333', 'v7', true,  8, null),
  ('c0000000-0000-0000-0000-000000000008', '33333333-3333-3333-3333-333333333333', 'v8', true,  2, now() + interval '1 hour');

create temp table got as select * from claim_auto_jobs(10);
do $$
declare v text := (select string_agg(right(item_id::text, 1) || ':' || kind, ',' order by item_id) from got);
begin
  -- 1 waits for the PC helper; 5 is done; 6 gave up; 8 is backing off; 7 gave up on the
  -- transcript, so it gets an analysis from the title + description instead.
  if v is distinct from '2:transcript,3:transcript,4:analysis,7:analysis' then raise exception 'claimed %', v; end if;
  -- Leased: a second worker run right away gets nothing.
  if exists (select 1 from claim_auto_jobs(10)) then raise exception 'jobs were claimed twice'; end if;
end $$;
rollback;
\echo auto_jobs.sql: ok
