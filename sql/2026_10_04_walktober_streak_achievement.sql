-- ============================================================
-- Walktober: 7-day logging streak ("Count von Count")
--
-- Earned for 7 consecutive season days, each first logged by the end of the
-- next day (created_at < step_date + 2 days, UTC). Checked and awarded by
-- routes/api-walktober.js on every step save. No schema change needed.
-- Date: 2026-10-04
-- ============================================================

BEGIN;

INSERT INTO public.achievements (key, name, description, points, metadata, is_visitor_eligible, image_url)
VALUES (
  'walktober_2026_streak_7',
  'Count von Count',
  'Do you know why they call you the Count? Because you love to count! Ah-hah-hah!',
  3,
  '{"trigger":"walktober:entry","year":2026,"type":"streak","days":7}'::jsonb,
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
  image_url = EXCLUDED.image_url;

COMMIT;

-- ============================================================
-- Verify:
-- SELECT key, name, points FROM achievements WHERE key = 'walktober_2026_streak_7';
-- ============================================================
