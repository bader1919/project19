-- Realistic demo library for design reviews and screenshots of the local stack.
-- psql -h /var/tmp -p 5499 -U postgres -d refvault_e2e -f tests/e2e/seed-demo.sql
\set ON_ERROR_STOP 1
\set u '\'11111111-1111-4111-8111-111111111111\''
insert into auth.users values (:u) on conflict do nothing;

insert into items (id, user_id, type, title, source_url, summary, key_points, status, analyzed_at, analyzed_by, created_at) values
 ('d0000000-0000-4000-8000-000000000001', :u, 'video', 'Do schools kill creativity? | Sir Ken Robinson | TED', 'https://www.youtube.com/watch?v=iG9CE55wbtY',
  'Sir Ken Robinson argues that school systems educate children out of their creativity. Creativity matters as much as literacy, yet education ranks subjects with maths and languages at the top and the arts at the bottom. He tells the story of Gillian Lynne, who was nearly labelled with a learning disorder and became a celebrated choreographer once someone saw she was a dancer.',
  '["Treat creativity with the same status as literacy","Kids are not frightened of being wrong; schools teach them to be","Public education was designed for the needs of industrialism","Intelligence is diverse, dynamic and distinct"]',
  'analyzed', now() - interval '2 hours', 'gemma', now() - interval '2 hours'),
 ('d0000000-0000-4000-8000-000000000002', :u, 'video', 'Building a RAG app with Postgres and pgvector', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  'A hands-on walkthrough of retrieval-augmented generation using only Postgres: embeddings stored with pgvector, HNSW indexes, hybrid search with full-text ranking, and a small API in front.',
  '["Use HNSW indexes for fast approximate search","Combine vector and full-text scores (reciprocal rank fusion)","Chunk documents by headings, 300–500 tokens"]',
  'analyzed', now() - interval '1 day', 'claude', now() - interval '1 day'),
 ('d0000000-0000-4000-8000-000000000003', :u, 'video', 'شرح الذكاء الاصطناعي للمبتدئين: كيف تعمل النماذج اللغوية', 'https://www.youtube.com/watch?v=aircAruvnKk',
  'شرح مبسط لطريقة عمل النماذج اللغوية الكبيرة: تقسيم النص إلى رموز، التنبؤ بالكلمة التالية، والتدريب على كميات ضخمة من البيانات. يعرض الفيديو أدوات مجانية لتجربة النماذج ومصادر للتعلم.',
  '["النموذج يتنبأ بالرمز التالي فقط","جودة البيانات أهم من حجمها","جرّب النماذج المفتوحة محلياً قبل الدفع"]',
  'analyzed', now() - interval '3 days', 'gemma', now() - interval '3 days'),
 ('d0000000-0000-4000-8000-000000000004', :u, 'video', 'The best note-taking workflow for developers (2026)', 'https://www.youtube.com/watch?v=jNQXAC9IVRw',
  null, '[]', 'fetched', null, null, now() - interval '5 minutes'),
 ('d0000000-0000-4000-8000-000000000005', :u, 'video', 'Supabase Edge Functions in 100 seconds', 'https://www.youtube.com/watch?v=5Kb-4i7dQPs',
  null, '[]', 'transcript_pending', null, null, now() - interval '1 minute')
on conflict (id) do nothing;

insert into video_details (item_id, user_id, youtube_id, channel, thumbnail, duration_sec, description, transcript, transcript_segments, transcript_lang, transcript_source, mentions, description_info) values
 ('d0000000-0000-4000-8000-000000000001', :u, 'iG9CE55wbtY', 'TED', 'https://i.ytimg.com/vi/iG9CE55wbtY/hqdefault.jpg', 1164,
  'Sir Ken Robinson makes an entertaining and profoundly moving case for creating an education system that nurtures creativity. Follow TED: https://twitter.com/TEDTalks  More talks: https://www.ted.com/talks',
  'Good morning. How are you? It''s been great, hasn''t it? I''ve been blown away by the whole thing.',
  '[{"start":15,"dur":0,"text":"Good morning. How are you?"},{"start":19,"dur":0,"text":"It''s been great, hasn''t it? I''ve been blown away by the whole thing."},{"start":545,"dur":0,"text":"Now, I don''t mean to say that being wrong is the same thing as being creative."},{"start":550,"dur":0,"text":"What we do know is, if you''re not prepared to be wrong, you''ll never come up with anything original."}]',
  'en', 'supadata',
  '[{"kind":"person","name":"Gillian Lynne","context":"Choreographer of Cats and The Phantom of the Opera","timestamp_sec":905},{"kind":"person","name":"Pablo Picasso","context":"All children are born artists","timestamp_sec":585},{"kind":"book","name":"Epiphany","context":"Robinson''s book of interviews about finding your talent","timestamp_sec":890}]',
  '[{"kind":"social","text":"TED on Twitter","url":"https://twitter.com/TEDTalks"}]'),
 ('d0000000-0000-4000-8000-000000000002', :u, 'dQw4w9WgXcQ', 'Postgres Builders', 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg', 1840,
  'Code: https://github.com/pgvector/pgvector  Slides: https://bit.ly/rag-pg-slides  00:00 Intro 03:10 Embeddings 12:40 HNSW 21:05 Hybrid search',
  'Today we build a RAG app entirely in Postgres.', '[{"start":0,"dur":0,"text":"Today we build a RAG app entirely in Postgres."},{"start":190,"dur":0,"text":"First, embeddings."}]', 'en', 'youtube (your PC)',
  '[{"kind":"tool","name":"pgvector","context":"Vector similarity for Postgres","timestamp_sec":200},{"kind":"paper","name":"Reciprocal Rank Fusion","context":"Merging ranked lists","timestamp_sec":1300}]',
  '[{"kind":"chapter","text":"Intro","timestamp_sec":0},{"kind":"chapter","text":"Embeddings","timestamp_sec":190},{"kind":"chapter","text":"HNSW","timestamp_sec":760},{"kind":"chapter","text":"Hybrid search","timestamp_sec":1265},{"kind":"code","text":"Use code PGRAG for 20% off the course"}]'),
 ('d0000000-0000-4000-8000-000000000003', :u, 'aircAruvnKk', 'قناة التقنية ببساطة', 'https://i.ytimg.com/vi/aircAruvnKk/hqdefault.jpg', 980,
  'روابط الأدوات: https://huggingface.co  https://ollama.com',
  'مرحباً بكم في هذه الحلقة عن الذكاء الاصطناعي.', '[{"start":0,"dur":0,"text":"مرحباً بكم في هذه الحلقة عن الذكاء الاصطناعي."},{"start":42,"dur":0,"text":"اليوم نشرح كيف تعمل النماذج اللغوية."}]', 'ar', 'supadata',
  '[{"kind":"tool","name":"Ollama","context":"تشغيل النماذج محلياً","timestamp_sec":610}]', '[]'),
 ('d0000000-0000-4000-8000-000000000004', :u, 'jNQXAC9IVRw', 'Dev Notes', 'https://i.ytimg.com/vi/jNQXAC9IVRw/hqdefault.jpg', 720, 'My setup: https://obsidian.md', 'We start with a capture habit.', '[{"start":0,"dur":0,"text":"We start with a capture habit."}]', 'en', 'youtube (your PC)', '[]', '[]'),
 ('d0000000-0000-4000-8000-000000000005', :u, '5Kb-4i7dQPs', 'Fireship', 'https://i.ytimg.com/vi/5Kb-4i7dQPs/hqdefault.jpg', null, null, null, '[]', null, null, '[]', '[]')
on conflict (item_id) do nothing;

insert into links (user_id, item_id, url, domain, label, context, source, timestamp_sec) values
 (:u, 'd0000000-0000-4000-8000-000000000001', 'https://twitter.com/TEDTalks', 'twitter.com', 'TED on X/Twitter', 'Follow TED', 'description', null),
 (:u, 'd0000000-0000-4000-8000-000000000001', 'https://www.ted.com/talks', 'ted.com', 'More TED talks', 'Browse the talk library', 'description', null),
 (:u, 'd0000000-0000-4000-8000-000000000002', 'https://github.com/pgvector/pgvector', 'github.com', 'pgvector GitHub repo', 'Code for the demo', 'description', null),
 (:u, 'd0000000-0000-4000-8000-000000000002', 'https://docs.google.com/presentation/d/rag-pg', 'docs.google.com', 'Slides', 'Expanded from bit.ly/rag-pg-slides', 'description', null),
 (:u, 'd0000000-0000-4000-8000-000000000002', 'https://supabase.com/docs/guides/ai', 'supabase.com', 'Supabase AI guide', 'Mentioned at 12:40', 'transcript', 760),
 (:u, 'd0000000-0000-4000-8000-000000000003', 'https://huggingface.co', 'huggingface.co', 'Hugging Face', 'مكتبة النماذج المفتوحة', 'description', null),
 (:u, 'd0000000-0000-4000-8000-000000000003', 'https://ollama.com', 'ollama.com', 'Ollama', 'تشغيل النماذج على جهازك', 'description', null),
 (:u, 'd0000000-0000-4000-8000-000000000004', 'https://obsidian.md', 'obsidian.md', null, 'My setup', 'description', null)
on conflict do nothing;

insert into tags (id, user_id, name) values
 ('e0000000-0000-4000-8000-000000000001', :u, 'Education'), ('e0000000-0000-4000-8000-000000000002', :u, 'Creativity'),
 ('e0000000-0000-4000-8000-000000000003', :u, 'Databases'), ('e0000000-0000-4000-8000-000000000004', :u, 'AI'),
 ('e0000000-0000-4000-8000-000000000005', :u, 'ذكاء اصطناعي')
on conflict do nothing;
insert into item_tags (user_id, item_id, tag_id) values
 (:u, 'd0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001'),
 (:u, 'd0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000002'),
 (:u, 'd0000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-000000000003'),
 (:u, 'd0000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-000000000004'),
 (:u, 'd0000000-0000-4000-8000-000000000003', 'e0000000-0000-4000-8000-000000000004'),
 (:u, 'd0000000-0000-4000-8000-000000000003', 'e0000000-0000-4000-8000-000000000005')
on conflict do nothing;

insert into collections (id, user_id, name, description) values ('f0000000-0000-4000-8000-000000000001', :u, 'RAG project', 'Everything for the search side-project') on conflict do nothing;
insert into collection_items (user_id, collection_id, item_id) values (:u, 'f0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000002') on conflict do nothing;

insert into notes (user_id, item_id, body) values
 (:u, 'd0000000-0000-4000-8000-000000000002', 'Try hybrid search with **RRF** on the docs site. HNSW m=16, ef_construction=64 was enough.'),
 (:u, 'd0000000-0000-4000-8000-000000000001', 'Good opener for the workshop on learning design.');
