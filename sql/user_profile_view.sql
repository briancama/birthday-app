-- Canonical definition of user_profile_view.
-- Run this AFTER user_profile_fields.sql (which adds the flat columns).
-- NOTE: Uses DROP + CREATE (not CREATE OR REPLACE) because PostgreSQL does not
-- allow renaming view columns via CREATE OR REPLACE VIEW.

-- Keep this file resilient on databases that were created before the
-- profile_details -> flat-column migration sequence was fully applied.
ALTER TABLE public.user_profile
  ADD COLUMN IF NOT EXISTS status text,
  ADD COLUMN IF NOT EXISTS hometown text,
  ADD COLUMN IF NOT EXISTS fav_movie text,
  ADD COLUMN IF NOT EXISTS fav_song text,
  ADD COLUMN IF NOT EXISTS about_html text,
  ADD COLUMN IF NOT EXISTS general_interest text,
  ADD COLUMN IF NOT EXISTS television text,
  ADD COLUMN IF NOT EXISTS top_n jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS is_published boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS profile_gif_key text;

DROP VIEW IF EXISTS public.user_profile_view;

CREATE VIEW public.user_profile_view AS
SELECT
  -- ── Identity (from users table) ───────────────────────────────────────
  u.id                          AS user_id,
  u.display_name,
  u.username,
  u.headshot,
  u.user_type,

  -- ── Page presentation ─────────────────────────────────────────────────
  p.profile_title,
  p.profile_bg_url,
  p.profile_bg_mode,
  p.profile_gif_key,
  p.is_published,

  -- ── Sidebar / details card ────────────────────────────────────────────
  p.status,
  p.hometown,
  p.age,

  -- ── About Me (rich text) ──────────────────────────────────────────────
  p.about_html,

  -- ── Interests card ────────────────────────────────────────────────────
  p.general_interest,
  p.fav_movie,
  p.fav_song,
  p.television,

  -- ── Top N ─────────────────────────────────────────────────────────────
  p.top_n,

  -- ── Metadata ──────────────────────────────────────────────────────────
  p.created_at,
  p.updated_at

FROM public.users u
LEFT JOIN public.user_profile p ON p.user_id = u.id;
