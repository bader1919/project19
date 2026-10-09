-- Adding a transcript API key (Supadata / youtube-transcript.io) in Settings restarts every
-- video still waiting for a transcript, including ones the worker had given up on
-- because no key was set. Their analysis is re-enabled too (it waits for the transcript).
create or replace function private.requeue_after_new_key() returns trigger
language plpgsql security definer set search_path = public, private as $$
begin
  if (new.supadata_key is not null and new.supadata_key is distinct from (case when tg_op = 'UPDATE' then old.supadata_key end))
     or (new.ytio_key is not null and new.ytio_key is distinct from (case when tg_op = 'UPDATE' then old.ytio_key end)) then
    update public.video_details v
       set auto_attempts = 0, auto_next_at = null, pc_failed = true
      from public.items i
     where i.id = v.item_id and i.user_id = new.user_id
       and i.status = 'transcript_pending' and v.transcript is null;
    update public.items
       set analysis_attempts = 0
     where user_id = new.user_id and status = 'transcript_pending' and analyzed_at is null;
  end if;
  return new;
end $$;

revoke all on function private.requeue_after_new_key() from public, anon, authenticated;

drop trigger if exists user_settings_requeue on public.user_settings;
create trigger user_settings_requeue after insert or update of supadata_key, ytio_key on public.user_settings
  for each row execute function private.requeue_after_new_key();
