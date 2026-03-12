-- Add all flat profile fields to user_profile table.
-- Run this migration once. Each column uses IF NOT EXISTS so it is safe to re-run.
-- View is defined separately in sql/user_profile_view.sql.
--
-- NOTE: If your database still has the original profile_details JSONB column,
-- run sql/2026_03_10_migrate_profile_to_flat_columns.sql instead — it adds
-- these same columns AND drops profile_details in one operation.
ALTER TABLE public.user_profile
  ADD COLUMN IF NOT EXISTS status           text,
  ADD COLUMN IF NOT EXISTS hometown         text,
  ADD COLUMN IF NOT EXISTS fav_movie        text,
  ADD COLUMN IF NOT EXISTS fav_song         text,
  ADD COLUMN IF NOT EXISTS about_html       text,
  ADD COLUMN IF NOT EXISTS general_interest text,
  ADD COLUMN IF NOT EXISTS television       text,
  ADD COLUMN IF NOT EXISTS top_n            jsonb NOT NULL DEFAULT '[]'::jsonb;

-- fav_food column is kept in the DB to preserve existing data but is no longer
-- exposed via the view or the API.
