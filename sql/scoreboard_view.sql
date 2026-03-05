CREATE OR REPLACE VIEW scoreboard AS
SELECT
  u.id AS user_id,
  u.username,
  u.display_name,
  COALESCE(a.assigned_completed, 0) AS assigned_completed,
  COALESCE(a.assigned_points, 0) AS assigned_points,
  COALESCE(cp.competition_points, 0) AS competition_points,
  COALESCE(ach.achievement_points, 0) AS achievement_points,
  (COALESCE(a.assigned_points, 0) + COALESCE(cp.competition_points, 0) + COALESCE(ach.achievement_points, 0))::integer AS total_points
FROM users u
LEFT JOIN (
  SELECT user_id, COUNT(id) AS assigned_completed, COUNT(id) * 5 AS assigned_points
  FROM assignments
  WHERE outcome = 'success'
  GROUP BY user_id
) a ON a.user_id = u.id
LEFT JOIN (
  SELECT user_id, SUM(points)::integer AS competition_points
  FROM competition_placements
  GROUP BY user_id
) cp ON cp.user_id = u.id
LEFT JOIN (
  SELECT ua.user_id, SUM(coalesce(ac.points,0))::integer AS achievement_points
  FROM user_achievements ua
  JOIN achievements ac ON ua.achievement_id = ac.id
  GROUP BY ua.user_id
) ach ON ach.user_id = u.id
ORDER BY total_points DESC;
