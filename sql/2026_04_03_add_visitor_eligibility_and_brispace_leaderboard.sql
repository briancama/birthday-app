-- Brispace leaderboard: only count achievements that visitors can realistically earn.
-- Adds a catalog-level flag to achievements and a dedicated leaderboard view.

BEGIN;

ALTER TABLE public.achievements
ADD COLUMN IF NOT EXISTS is_visitor_eligible boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.achievements.is_visitor_eligible IS
  'Whether this achievement should count toward Brispace visitor leaderboard score.';

-- Challenge/event assignment achievements are participant-only and should not
-- affect Brispace visitor rank calculations.
UPDATE public.achievements
SET is_visitor_eligible = false
WHERE key IN (
  'all_assigned_completed',
  'first_challenge',
  'three_challenges',
  'the_challenger'
);

CREATE OR REPLACE VIEW public.brispace_leaderboard AS
SELECT
  u.id AS user_id,
  u.username,
  u.display_name,
  u.headshot,
  COALESCE(ach.achievement_points, 0) AS achievement_points,
  COALESCE(ach.achievements_completed, 0) AS achievements_completed
FROM public.users u
LEFT JOIN (
  SELECT
    ua.user_id,
    SUM(COALESCE(a.points, 0))::integer AS achievement_points,
    COUNT(ua.id)::integer AS achievements_completed
  FROM public.user_achievements ua
  JOIN public.achievements a ON a.id = ua.achievement_id
  WHERE a.is_visitor_eligible = true
  GROUP BY ua.user_id
) ach ON ach.user_id = u.id
WHERE u.username IS NOT NULL
  AND u.username <> ''
ORDER BY achievement_points DESC, achievements_completed DESC, u.created_at ASC;

COMMIT;
