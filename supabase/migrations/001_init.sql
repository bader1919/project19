-- RefVault schema: a generic "items" library (videos today; wikis, courses later)
-- with links, topics, collections, notes and full-text search (English + Arabic).

create extension if not exists pg_trgm;

-- ---------------------------------------------------------------------------
-- Text normalisation used for both indexing and querying.
-- Lower-cases, strips Arabic diacritics/tatweel and folds common letter
-- variants (أ إ آ ٱ -> ا, ة -> ه, ى -> ي) so Arabic search is forgiving.
-- ---------------------------------------------------------------------------
create or replace function public.norm_text(t text)
returns text
language sql
immutable
parallel safe
as $$
  select lower(
    translate(
      regexp_replace(coalesce(t, ''), '[ً-ْٰـ]', '', 'g'),
      'أإآٱةى',
      'ااااهي'
    )
  )
$$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.items (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  type          text not null default 'video' check (type in ('video', 'wiki', 'course', 'article')),
  title         text not null default '',
  source_url    text,
  summary       text,
  key_points    jsonb not null default '[]'::jsonb,
  extra         jsonb not null default '{}'::jsonb,
  status        text not null default 'fetched' check (status in ('fetched', 'transcript_pending', 'analyzed', 'error')),
  error         text,
  search_doc    text not null default '',
  search_vector tsvector generated always as (to_tsvector('simple', search_doc)) stored,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  analyzed_at   timestamptz
);
create index items_user_created_idx on public.items (user_id, created_at desc);
create index items_search_idx on public.items using gin (search_vector);
create index items_search_trgm_idx on public.items using gin (search_doc gin_trgm_ops);

create table public.video_details (
  item_id             uuid primary key references public.items (id) on delete cascade,
  user_id             uuid not null default auth.uid() references auth.users (id) on delete cascade,
  youtube_id          text not null,
  channel             text,
  channel_url         text,
  thumbnail           text,
  published_at        date,
  duration_sec        integer,
  description         text,
  transcript          text,
  transcript_segments jsonb not null default '[]'::jsonb,
  transcript_lang     text,
  transcript_source   text,
  description_info    jsonb not null default '[]'::jsonb,
  mentions            jsonb not null default '[]'::jsonb,
  unique (user_id, youtube_id)
);

create table public.links (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  item_id       uuid not null references public.items (id) on delete cascade,
  url           text not null,
  original_url  text,
  domain        text,
  label         text,
  context       text,
  source        text not null default 'manual' check (source in ('description', 'transcript', 'manual', 'ai')),
  timestamp_sec integer,
  created_at    timestamptz not null default now(),
  unique (item_id, url)
);
create index links_user_idx on public.links (user_id, created_at desc);
create index links_domain_idx on public.links (user_id, domain);

create table public.tags (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name       text not null,
  created_at timestamptz not null default now()
);
create unique index tags_user_name_idx on public.tags (user_id, lower(name));

create table public.item_tags (
  item_id uuid not null references public.items (id) on delete cascade,
  tag_id  uuid not null references public.tags (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  primary key (item_id, tag_id)
);
create index item_tags_tag_idx on public.item_tags (tag_id);

create table public.collections (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null,
  description text,
  created_at  timestamptz not null default now()
);
create unique index collections_user_name_idx on public.collections (user_id, lower(name));

create table public.collection_items (
  collection_id uuid not null references public.collections (id) on delete cascade,
  item_id       uuid not null references public.items (id) on delete cascade,
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  added_at      timestamptz not null default now(),
  primary key (collection_id, item_id)
);

create table public.notes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  item_id    uuid not null references public.items (id) on delete cascade,
  body       text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index notes_item_idx on public.notes (item_id);
create index notes_user_idx on public.notes (user_id, updated_at desc);

create table public.user_settings (
  user_id         uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  supadata_key    text,
  ytio_key        text,
  updated_at      timestamptz not null default now()
);

create table public.api_tokens (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  token_hash   text not null unique,
  label        text,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz
);

-- ---------------------------------------------------------------------------
-- Row level security: every row belongs to exactly one user.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['items','video_details','links','tags','item_tags',
                           'collections','collection_items','notes','user_settings','api_tokens']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())',
      t || '_owner', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Search document: everything about an item flattened into one normalised
-- text column (title, summary, topics, description, transcript, links, notes).
-- ---------------------------------------------------------------------------
-- All string values inside a jsonb document, space separated (for indexing).
create or replace function public.jsonb_strings(j jsonb)
returns text
language sql
immutable
as $$
  select coalesce(string_agg(x #>> '{}', ' '), '')
    from jsonb_path_query(coalesce(j, 'null'::jsonb), 'strict $.**') as x
   where jsonb_typeof(x) = 'string'
$$;

create or replace function public.build_search_doc(
  p_item uuid, p_title text, p_summary text, p_key_points jsonb, p_extra jsonb)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select public.norm_text(concat_ws(' ',
    p_title, p_summary, public.jsonb_strings(p_key_points), public.jsonb_strings(p_extra),
    (select string_agg(t.name, ' ') from item_tags it join tags t on t.id = it.tag_id where it.item_id = p_item),
    (select concat_ws(' ', v.channel, v.description, public.jsonb_strings(v.description_info), public.jsonb_strings(v.mentions), v.transcript)
       from video_details v where v.item_id = p_item),
    (select string_agg(concat_ws(' ', l.url, l.domain, l.label, l.context), ' ') from links l where l.item_id = p_item),
    (select string_agg(n.body, ' ') from notes n where n.item_id = p_item)
  ))
$$;

create or replace function public.items_before_write()
returns trigger
language plpgsql
as $$
begin
  new.search_doc := public.build_search_doc(new.id, new.title, new.summary, new.key_points, new.extra);
  if tg_op = 'UPDATE' then
    new.updated_at := now();
  end if;
  return new;
end $$;

create trigger items_before_insert before insert on public.items
  for each row execute function public.items_before_write();
create trigger items_before_update before update of title, summary, key_points, extra, status on public.items
  for each row execute function public.items_before_write();

-- Related tables refresh their item's search_doc (updates only search_doc, so
-- the column-specific items trigger above does not re-fire).
create or replace function public.refresh_item_search()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_item uuid;
begin
  v_item := case when tg_op = 'DELETE' then old.item_id else new.item_id end;
  update items i
     set search_doc = build_search_doc(i.id, i.title, i.summary, i.key_points, i.extra)
   where i.id = v_item;
  return null;
end $$;

create trigger video_details_search after insert or update or delete on public.video_details
  for each row execute function public.refresh_item_search();
create trigger links_search after insert or update or delete on public.links
  for each row execute function public.refresh_item_search();
create trigger item_tags_search after insert or delete on public.item_tags
  for each row execute function public.refresh_item_search();
create trigger notes_search after insert or update or delete on public.notes
  for each row execute function public.refresh_item_search();

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
create trigger notes_touch before update on public.notes
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Prefix tsquery from free text: "vector datab" -> 'vector':* & 'datab':*
-- ---------------------------------------------------------------------------
create or replace function public.to_prefix_tsquery(q text)
returns tsquery
language sql
immutable
as $$
  select case when w is null then null else to_tsquery('simple', w) end
  from (
    select string_agg(quote_literal(word) || ':*', ' & ') as w
    from regexp_split_to_table(
      trim(regexp_replace(public.norm_text(q), '[''"\\:&|!()<>*,.;?/\-]+', ' ', 'g')), '\s+') as word
    where word <> ''
  ) s
$$;

-- ---------------------------------------------------------------------------
-- search_library: ranked search with optional filters.
-- Called from the browser (RLS applies, p_user ignored by policy) and from
-- server functions with the service role (p_user required).
-- ---------------------------------------------------------------------------
create or replace function public.search_library(
  q            text default null,
  p_type       text default null,
  p_tag        text default null,
  p_collection uuid default null,
  p_status     text default null,
  p_limit      int  default 30,
  p_offset     int  default 0,
  p_user       uuid default null)
returns table (
  id uuid, type text, title text, summary text, status text, source_url text,
  thumbnail text, channel text, created_at timestamptz, snippet text, rank real, tags text[])
language sql
stable
as $$
  with p as (
    select coalesce(p_user, auth.uid()) as uid,
           nullif(trim(public.norm_text(q)), '') as nq,
           public.to_prefix_tsquery(q) as tsq
  )
  select i.id, i.type, i.title, i.summary, i.status, i.source_url,
         v.thumbnail, v.channel, i.created_at,
         case when p.tsq is null then left(coalesce(i.summary, ''), 240)
              else ts_headline('simple', i.search_doc, p.tsq,
                     'MaxFragments=2, MaxWords=22, MinWords=8, StartSel=[[, StopSel=]], FragmentDelimiter= … ')
         end as snippet,
         case when p.tsq is null then 0::real else ts_rank(i.search_vector, p.tsq) end as rank,
         array(select t.name from item_tags it join tags t on t.id = it.tag_id
                where it.item_id = i.id order by t.name) as tags
    from p
    join public.items i on i.user_id = p.uid
    left join public.video_details v on v.item_id = i.id
   where (p.nq is null or i.search_vector @@ p.tsq or i.search_doc like '%' || p.nq || '%')
     and (p_type is null or i.type = p_type)
     and (p_status is null or i.status = p_status)
     and (p_tag is null or exists (
           select 1 from item_tags it join tags t on t.id = it.tag_id
            where it.item_id = i.id and lower(t.name) = lower(p_tag)))
     and (p_collection is null or exists (
           select 1 from collection_items ci where ci.item_id = i.id and ci.collection_id = p_collection))
   order by rank desc, i.created_at desc
   limit greatest(1, least(p_limit, 200)) offset greatest(0, p_offset)
$$;

-- Topic list with counts
create or replace function public.topic_counts(p_user uuid default null)
returns table (id uuid, name text, item_count bigint)
language sql
stable
as $$
  select t.id, t.name, count(it.item_id)
    from public.tags t
    left join public.item_tags it on it.tag_id = t.id
   where t.user_id = coalesce(p_user, auth.uid())
   group by t.id, t.name
   order by count(it.item_id) desc, t.name
$$;

grant execute on function public.search_library(text, text, text, uuid, text, int, int, uuid) to authenticated, service_role;
grant execute on function public.topic_counts(uuid) to authenticated, service_role;
grant execute on function public.norm_text(text) to authenticated, service_role;
grant execute on function public.to_prefix_tsquery(text) to authenticated, service_role;
