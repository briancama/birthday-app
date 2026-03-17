-- Add secret_tracks achievement awarded when a user discovers and listens to all 3 hidden tracks
-- by rewinding past track 0 on the music player.
-- Safe to run multiple times (ON CONFLICT DO NOTHING).

BEGIN;

INSERT INTO achievements (key, name, description, points, metadata)
VALUES (
  'secret_tracks',
  'B-Side',
  'You rewound past the beginning and found the hidden tracks.',
  5,
  '{"trigger":"secret_rewind"}'::jsonb
)
ON CONFLICT (key) DO NOTHING;

COMMIT;
