\set ON_ERROR_STOP 1
grant all on all tables in schema public to authenticated, service_role;
insert into auth.users values ('11111111-1111-1111-1111-111111111111'), ('22222222-2222-2222-2222-222222222222');

set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);

insert into items (id, title, source_url, summary) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Building a RAG app with Postgres', 'https://youtu.be/x', 'Uses pgvector and Supabase'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'شرح الذكاء الاصطناعي للمبتدئين', 'https://youtu.be/y', 'مقدمة عن النماذج اللغوية');
insert into video_details (item_id, youtube_id, channel, transcript) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'x', 'Dev Channel', 'today we look at the langchain docs'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'y', 'قناة', 'سنتحدث عن أدوات الذكاء الاصطناعي');
insert into links (item_id, url, domain, label, source) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'https://github.com/pgvector/pgvector', 'github.com', 'pgvector repo', 'description');
insert into tags (id, name) values ('bbbbbbbb-0000-0000-0000-000000000001', 'Databases');
insert into item_tags (item_id, tag_id) values ('aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001');
insert into notes (item_id, body) values ('aaaaaaaa-0000-0000-0000-000000000002', 'remember to try ollama');

\echo '--- english prefix (langch) ---'
select title, snippet from search_library('langch');
\echo '--- link domain (pgvector) ---'
select title from search_library('pgvector repo');
\echo '--- arabic without hamza (ادوات) ---'
select title from search_library('ادوات');
\echo '--- note text (ollama) ---'
select title from search_library('ollama');
\echo '--- tag filter ---'
select title, tags from search_library(null, p_tag => 'databases');
\echo '--- topic counts ---'
select name, item_count from topic_counts();
\echo '--- weird input does not error ---'
select count(*) from search_library($q$it's a "test" (with) :* & | ! \ chars$q$);

\echo '--- other user sees nothing ---'
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);
select count(*) as other_user_rows from search_library(null);
select count(*) as other_user_items from items;
