-- Backfill top_8_complete achievement for users who already have a full Top 8.
-- Safe to run multiple times; existing awards are skipped.

BEGIN;

WITH target_achievement AS (
  SELECT id
  FROM achievements
  WHERE key = 'top_8_complete'
  LIMIT 1
)
INSERT INTO user_achievements (user_id, achievement_id, details)
SELECT
  up.user_id,
  ta.id,
  jsonb_build_object(
    'top_n_count', jsonb_array_length(COALESCE(up.top_n, '[]'::jsonb)),
    'source', 'backfill_2026_04_10'
  )
FROM user_profile up
CROSS JOIN target_achievement ta
WHERE jsonb_typeof(COALESCE(up.top_n, '[]'::jsonb)) = 'array'
  AND jsonb_array_length(COALESCE(up.top_n, '[]'::jsonb)) >= 8
ON CONFLICT DO NOTHING;

COMMIT;
