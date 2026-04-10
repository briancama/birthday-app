-- Backfill: award Jukebox Hero to users who already had a favorite song saved.
-- Safe to run multiple times (only inserts missing user_achievements rows).
-- Prerequisite: achievements row with key = 'first_fav_song' exists.

BEGIN;

WITH jukebox_achievement AS (
  SELECT id
  FROM achievements
  WHERE key = 'first_fav_song'
),
eligible AS (
  SELECT DISTINCT
    ufs.user_id,
    ufs.song_id,
    ja.id AS achievement_id
  FROM user_favorite_songs ufs
  CROSS JOIN jukebox_achievement ja
  LEFT JOIN user_achievements ua
    ON ua.user_id = ufs.user_id
   AND ua.achievement_id = ja.id
  WHERE ua.id IS NULL
)
INSERT INTO user_achievements (user_id, achievement_id, details)
SELECT
  e.user_id,
  e.achievement_id,
  jsonb_build_object(
    'source', 'backfill:first_fav_song',
    'song_id', e.song_id
  )
FROM eligible e;

COMMIT;
