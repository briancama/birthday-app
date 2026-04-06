-- Achievement: Jukebox Hero
-- Awarded the first time a user saves a favorite song in the music player.
-- Trigger: 'achievement:trigger' window event with key 'first_fav_song'
-- dispatched by music-player.js after a successful upsert to user_favorite_songs.

BEGIN;

INSERT INTO achievements (key, name, description, points, metadata)
VALUES (
  'first_fav_song',
  'Jukebox Hero',
  'You starred your first favorite song. Excellent taste.',
  1,
  '{"trigger":"music:fav:set"}'::jsonb
)
ON CONFLICT (key) DO UPDATE SET
  name        = EXCLUDED.name,
  description = EXCLUDED.description,
  points      = EXCLUDED.points,
  metadata    = EXCLUDED.metadata;

COMMIT;
