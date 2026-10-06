-- ============================================================
-- Walktober: achievement ladders + profile visibility
--
-- achievements.show_on_profile  false keeps an achievement off Brispace
--                               profiles; points still count everywhere.
-- Count von Count               now the full-month award: every season day
--                               has an entry (backfills OK), 3 pts.
-- Streak ladder                 5/10/15/20/25/31 days in a row, each logged
--                               on time, 1 pt each, off profile.
-- Goal ladder                   5/10/15/20/25/31 total days at goal,
--                               1 pt each, off profile.
-- All awarded by routes/api-walktober.js on step save.
-- Next year: copy the blocks below with the new year.
-- Date: 2026-10-05
-- ============================================================

BEGIN;

ALTER TABLE public.achievements
  ADD COLUMN IF NOT EXISTS show_on_profile boolean NOT NULL DEFAULT true;

-- Must run before the ladder insert, which reuses walktober_2026_streak_10.
UPDATE public.achievements
SET key = 'walktober_2026_full_month'
WHERE key IN ('walktober_2026_streak_7', 'walktober_2026_streak_10')
  AND name = 'Count von Count';

INSERT INTO public.achievements
  (key, name, description, points, metadata, is_visitor_eligible, show_on_profile, image_url)
VALUES (
  'walktober_2026_full_month',
  'Count von Count',
  'Do you know why they call you the Count? Because you love to count! Ah-hah-hah!',
  3,
  '{"trigger":"walktober:entry","year":2026,"type":"full_month"}'::jsonb,
  true,
  true,
  '/images/achievement_step_count_streak.gif'
)
ON CONFLICT (key) DO UPDATE
SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  points = EXCLUDED.points,
  metadata = EXCLUDED.metadata,
  is_visitor_eligible = EXCLUDED.is_visitor_eligible,
  show_on_profile = EXCLUDED.show_on_profile,
  image_url = EXCLUDED.image_url;

INSERT INTO public.achievements
  (key, name, description, points, metadata, is_visitor_eligible, show_on_profile, image_url)
SELECT
  'walktober_2026_streak_' || t,
  'Ghost Writer',
  'Logged your steps on time ' || t || ' days in a row.',
  1,
  jsonb_build_object('trigger', 'walktober:entry', 'year', 2026, 'ladder', 'streak', 'tier', t),
  true,
  false,
  '/images/badge-ghost.svg'
FROM unnest(ARRAY[5, 10, 15, 20, 25, 31]) AS t
UNION ALL
SELECT
  'walktober_2026_goal_days_' || t,
  'Ghoul Getter',
  'Reached your goal on ' || t || ' days.',
  1,
  jsonb_build_object('trigger', 'walktober:entry', 'year', 2026, 'ladder', 'goal', 'tier', t),
  true,
  false,
  '/images/badge-ghoul.svg'
FROM unnest(ARRAY[5, 10, 15, 20, 25, 31]) AS t
ON CONFLICT (key) DO UPDATE
SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  points = EXCLUDED.points,
  metadata = EXCLUDED.metadata,
  is_visitor_eligible = EXCLUDED.is_visitor_eligible,
  show_on_profile = EXCLUDED.show_on_profile,
  image_url = EXCLUDED.image_url;

COMMIT;

-- ============================================================
-- Verify:
-- SELECT key, name, points, show_on_profile FROM achievements
--   WHERE key LIKE 'walktober_2026_%' ORDER BY key;
-- ============================================================
