CREATE OR REPLACE VIEW public.scoreboard AS
SELECT
  u.id AS user_id,
  u.username,
  u.display_name,
  COALESCE(a.assigned_completed, 0) AS assigned_completed,
  COALESCE(a.assigned_points, 0) AS assigned_points,
  COALESCE(cp.competition_points, 0) AS competition_points,
  COALESCE(ach.achievement_points, 0) AS achievement_points,
  COALESCE(ach.achievements_completed, 0) AS achievements_completed,
  (COALESCE(a.assigned_points, 0) + COALESCE(cp.competition_points, 0) + COALESCE(ach.achievement_points, 0))::integer AS total_points
FROM public.users u
LEFT JOIN (
  SELECT user_id, COUNT(id) AS assigned_completed, (COUNT(id) * 5)::integer AS assigned_points
  FROM public.assignments
  WHERE outcome = 'success'
  GROUP BY user_id
) a ON a.user_id = u.id
LEFT JOIN (
  SELECT user_id, SUM(points)::integer AS competition_points
  FROM public.competition_placements
  GROUP BY user_id
) cp ON cp.user_id = u.id
LEFT JOIN (
  SELECT ua.user_id,
         SUM(COALESCE(ac.points, 0))::integer AS achievement_points,
         COUNT(ua.id)::integer AS achievements_completed
  FROM public.user_achievements ua
  JOIN public.achievements ac ON ua.achievement_id = ac.id
  GROUP BY ua.user_id
) ach ON ach.user_id = u.id
ORDER BY total_points DESC;

-- Allow the anon and authenticated roles to read the view
GRANT SELECT ON public.scoreboard TO anon, authenticated;
