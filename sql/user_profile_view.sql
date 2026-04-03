-- Canonical definition of user_profile_view.
-- Run this AFTER user_profile_fields.sql (which adds the flat columns).
-- NOTE: Uses DROP + CREATE (not CREATE OR REPLACE) because PostgreSQL does not
-- allow renaming view columns via CREATE OR REPLACE VIEW.

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
