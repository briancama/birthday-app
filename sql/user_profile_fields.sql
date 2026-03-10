-- Add new user-facing profile fields to user_profile table
ALTER TABLE public.user_profile
  ADD COLUMN IF NOT EXISTS status         text,
  ADD COLUMN IF NOT EXISTS hometown       text,
  ADD COLUMN IF NOT EXISTS fav_movie      text,
  ADD COLUMN IF NOT EXISTS fav_song       text,
  ADD COLUMN IF NOT EXISTS fav_food       text,
  ADD COLUMN IF NOT EXISTS looking_for    text,
  ADD COLUMN IF NOT EXISTS top_n          jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS about_html     text;

-- Recreate user_profile_view to expose all profile columns
CREATE OR REPLACE VIEW public.user_profile_view AS
SELECT
  u.id                          AS user_id,
  u.display_name,
  u.username,
  u.headshot,
  u.user_type,
  p.profile_intro,
  p.about_html,
  p.prompt_html,
  p.profile_title,
  p.prompt_title,
  p.age,
  p.profile_bg_url,
  p.profile_bg_mode,
  p.favorite_song_id,
  p.profile_details,
  p.status,
  p.hometown,
  p.fav_movie,
  p.fav_song,
  p.fav_food,
  p.looking_for,
  p.top_n,
  p.is_public,
  p.created_at,
  p.updated_at
FROM public.users u
LEFT JOIN public.user_profile p ON p.user_id = u.id;
