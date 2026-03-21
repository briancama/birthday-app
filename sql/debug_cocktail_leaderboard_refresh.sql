-- Debug query for cocktail leaderboard refresh
-- Run this SELECT directly to see what the refresh will do

SELECT
  e.id AS entry_id,
  e.competition_id,
  e.entry_name,
  e.user_id,
  u.username,
  COALESCE(ROUND(AVG(
    ((cj.taste_score::numeric
      + cj.presentation_score::numeric
      + cj.workmanship_score::numeric
      + cj.creativity_score::numeric) / 4.0)
  )::numeric, 3), 0) AS avg_score,
  COALESCE(ROUND(AVG(cj.taste_score::numeric)::numeric, 3), 0) AS taste_avg,
  COALESCE(ROUND(AVG(cj.presentation_score::numeric)::numeric, 3), 0) AS presentation_avg,
  COALESCE(ROUND(AVG(cj.workmanship_score::numeric)::numeric, 3), 0) AS workmanship_avg,
  COALESCE(ROUND(AVG(cj.creativity_score::numeric)::numeric, 3), 0) AS creativity_avg,
  COUNT(cj.id) AS judgments_count,
  COALESCE(fav.favorites_count, 0) AS favorites_count,
  MAX(cj.submitted_at) AS last_judged_at,
  e.submitted_at
FROM public.cocktail_entries e
LEFT JOIN public.cocktail_judgments cj
  ON cj.entry_id = e.id
  AND cj.judge_user_id != e.user_id
LEFT JOIN (
  SELECT entry_id, COUNT(*) AS favorites_count
  FROM public.cocktail_favorites
  GROUP BY entry_id
) fav ON fav.entry_id = e.id
LEFT JOIN public.users u ON u.id = e.user_id
GROUP BY e.id, e.competition_id, e.entry_name, e.user_id, u.username, fav.favorites_count, e.submitted_at
ORDER BY avg_score DESC, judgments_count DESC, entry_id;
