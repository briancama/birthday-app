-- ============================================================
-- Walktober: Biggest Day awards (3 / 2 / 1 pts)
--
-- Each walker's single best day, dense-ranked (ties share a place, so one
-- walker can only win one place). Awarded by the admin Close action in
-- routes/api-walktober.js alongside the medals. Off Brispace profiles;
-- points still count on every leaderboard.
-- Run BEFORE closing: Close refuses to run if these rows are missing.
-- Next year: copy with the new year.
-- Date: 2026-10-31
-- ============================================================

BEGIN;

INSERT INTO public.achievements
  (key, name, description, points, metadata, is_visitor_eligible, show_on_profile, image_url)
VALUES
  (
    'walktober_2026_big_day_1',
    'Biggest Day',
    'Walked the most steps in a single day of Walktober 2026.',
    3,
    '{"trigger":"walktober:close","year":2026,"type":"big_day","place":1}'::jsonb,
    true,
    false,
    '/images/big_walk_day_gold.gif'
  ),
  (
    'walktober_2026_big_day_2',
    '2nd Biggest Day',
    'Walked the second most steps in a single day of Walktober 2026.',
    2,
    '{"trigger":"walktober:close","year":2026,"type":"big_day","place":2}'::jsonb,
    true,
    false,
    '/images/big_walk_day_silver.gif'
  ),
  (
    'walktober_2026_big_day_3',
    '3rd Biggest Day',
    'Walked the third most steps in a single day of Walktober 2026.',
    1,
    '{"trigger":"walktober:close","year":2026,"type":"big_day","place":3}'::jsonb,
    true,
    false,
    '/images/big_walk_day_bronze.gif'
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

COMMIT;

-- ============================================================
-- Verify:
-- SELECT key, name, points, show_on_profile FROM achievements
--   WHERE key LIKE 'walktober_2026_big_day_%' ORDER BY key;
-- ============================================================
