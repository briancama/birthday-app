-- View: site_leaderboard
-- Achievement-points-only leaderboard, includes ALL users (participants + visitors).
-- Used by the "Site" tab on leaderboard.html.

CREATE OR REPLACE VIEW public.site_leaderboard AS
SELECT
  u.id              AS user_id,
  u.username,
  u.display_name,
  u.user_type,
  COALESCE(ach.achievement_points, 0)      AS achievement_points,
  COALESCE(ach.achievements_completed, 0)  AS achievements_completed
FROM public.users u
LEFT JOIN (
  SELECT
    ua.user_id,
    SUM(COALESCE(ac.points, 0))::integer AS achievement_points,
    COUNT(ua.id)::integer                AS achievements_completed
  FROM public.user_achievements ua
  JOIN public.achievements ac ON ua.achievement_id = ac.id
  GROUP BY ua.user_id
) ach ON ach.user_id = u.id
WHERE u.username IS NOT NULL
  AND u.username != ''
ORDER BY achievement_points DESC, achievements_completed DESC;
