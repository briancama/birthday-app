-- Canonical definition of user_profile_view.
-- Run this AFTER user_profile_fields.sql (which adds the flat columns).
-- Safe to re-run (CREATE OR REPLACE).
--
-- Columns exposed are exactly what templates/user.ejs and routes/users.js need.
-- Legacy columns (profile_intro, prompt_html, age, profile_details, fav_food, etc.)
-- are intentionally excluded from the view surface to keep it clean.

CREATE OR REPLACE VIEW public.user_profile_view AS
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
  p.is_public,

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

  -- ── Metadata ──────────────────────────────────────────────────────────
  p.created_at,
  p.updated_at

FROM public.users u
LEFT JOIN public.user_profile p ON p.user_id = u.id;
