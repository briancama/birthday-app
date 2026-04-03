-- 2026_04_02_add_profile_gif_key_to_user_profile.sql
-- Adds a curated profile GIF key to user_profile.

ALTER TABLE public.user_profile
  ADD COLUMN IF NOT EXISTS profile_gif_key text;
