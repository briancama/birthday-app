-- ============================================================
-- Leaderboards: published profiles only
--
-- site_leaderboard + brispace_leaderboard now require
-- user_profile.is_published = true, matching the Friends page.
-- A user who hasn't published their profile doesn't appear —
-- this also keeps auto-provisioned visitor accounts (temp
-- visitor_* usernames from the On a Stick registration widget)
-- off both boards.
--
-- Known drop-off at time of writing (unpublished with points):
-- luisae (17), ianb (11), ericw (1), allisoni (1).
-- Re-publish their profile and they reappear — no data loss.
-- Date: 2026-10-01
-- ============================================================

CREATE OR REPLACE VIEW public.site_leaderboard AS
SELECT
  u.id              AS user_id,
  u.username,
  u.display_name,
  u.user_type,
  COALESCE(ach.achievement_points, 0)      AS achievement_points,
  COALESCE(ach.achievements_completed, 0)  AS achievements_completed
FROM public.users u
JOIN public.user_profile up
  ON up.user_id = u.id AND up.is_published = true
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

CREATE OR REPLACE VIEW public.brispace_leaderboard AS
SELECT
  u.id AS user_id,
  u.username,
  u.display_name,
  u.headshot,
  COALESCE(ach.achievement_points, 0) AS achievement_points,
  COALESCE(ach.achievements_completed, 0) AS achievements_completed
FROM public.users u
JOIN public.user_profile up
  ON up.user_id = u.id AND up.is_published = true
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

-- ============================================================
-- Verify:
-- SELECT username, achievement_points FROM site_leaderboard;
-- -- luisae/ianb/ericw/allisoni should be absent until published.
-- ============================================================
