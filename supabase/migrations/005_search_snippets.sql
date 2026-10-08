-- Search snippets in the original case.
-- search_library built its ts_headline from items.search_doc, which is normalised (lower-cased, Arabic folded),
-- so results showed "building a rag app with postgres...". The headline is now taken from the original text:
-- first title + summary + key points, then channel/description/transcript, and only if neither contains the
-- match (e.g. an Arabic spelling variant, or a hit in a link or note) from the normalised search_doc as before.
-- Same signature and return type as 001_init.sql, so this is a plain create-or-replace.

-- Returns a ts_headline of p_text only when it actually contains a match, else null.
create or replace function public.headline_if_match(p_text text, p_q tsquery)
returns text
language sql
immutable
set search_path = public
as $$
  select case when h like '%[[%' then h end
    from (select ts_headline('simple', coalesce(p_text, ''), p_q,
            'MaxFragments=2, MaxWords=22, MinWords=8, StartSel=[[, StopSel=]], FragmentDelimiter= … ') as h) s
$$;
revoke execute on function public.headline_if_match(text, tsquery) from public, anon;
grant execute on function public.headline_if_match(text, tsquery) to authenticated, service_role;

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
              else coalesce(
                     public.headline_if_match(
                       concat_ws(E'\n', i.title, i.summary, public.jsonb_strings(i.key_points)), p.tsq),
                     public.headline_if_match(
                       concat_ws(E'\n', left(v.description, 20000), left(v.transcript, 100000), v.channel), p.tsq),
                     ts_headline('simple', i.search_doc, p.tsq,
                       'MaxFragments=2, MaxWords=22, MinWords=8, StartSel=[[, StopSel=]], FragmentDelimiter= … '))
         end as snippet,
         case when p.tsq is null then 0::real else ts_rank(i.search_vector, p.tsq) end as rank,
         array(select t.name from item_tags it join tags t on t.id = it.tag_id
                where it.item_id = i.id order by t.name) as tags
    from p
    join public.items i on i.user_id = p.uid
    left join public.video_details v on v.item_id = i.id
   where (p.nq is null or i.search_vector @@ p.tsq or i.search_doc like '%' || replace(replace(replace(p.nq, '\', '\\'), '%', '\%'), '_', '\_') || '%')
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

grant execute on function public.search_library(text, text, text, uuid, text, int, int, uuid) to authenticated, service_role;
