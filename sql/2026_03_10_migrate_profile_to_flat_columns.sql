-- Migrate user_profile from JSONB profile_details to explicit flat columns.
--
-- Starting schema has: profile_intro, prompt_html, profile_title, prompt_title,
-- age, profile_bg_url, profile_bg_mode, favorite_song_id, profile_details (jsonb),
-- is_public, created_at, updated_at.
--
-- This migration:
--   1. Adds the new explicit interest/detail columns (IF NOT EXISTS — safe to re-run).
--   2. Drops the profile_details CHECK constraint.
--   3. Drops the profile_details column.
--
-- After running this, apply sql/user_profile_view.sql to recreate the view.

-- ── Step 0: Drop existing view (must happen before column changes) ────────────
DROP VIEW IF EXISTS public.user_profile_view CASCADE;

-- ── Step 1: Add explicit profile field columns ────────────────────────────────
ALTER TABLE public.user_profile
  ADD COLUMN IF NOT EXISTS status           text,
  ADD COLUMN IF NOT EXISTS hometown         text,
  ADD COLUMN IF NOT EXISTS fav_movie        text,
  ADD COLUMN IF NOT EXISTS fav_song         text,
  ADD COLUMN IF NOT EXISTS about_html       text,
  ADD COLUMN IF NOT EXISTS general_interest text,
  ADD COLUMN IF NOT EXISTS television       text,
  ADD COLUMN IF NOT EXISTS top_n            jsonb NOT NULL DEFAULT '[]'::jsonb;

-- ── Step 2: Drop the profile_details CHECK constraint ────────────────────────
ALTER TABLE public.user_profile
  DROP CONSTRAINT IF EXISTS user_profile_profile_details_check;

-- ── Step 3: Drop profile_details column ──────────────────────────────────────
ALTER TABLE public.user_profile
  DROP COLUMN IF EXISTS profile_details;
