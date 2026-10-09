-- Gemini as a free transcript source (it can watch a YouTube URL directly).
alter table public.user_settings add column if not exists gemini_key text;
alter table public.user_settings add column if not exists gemini_model text;
