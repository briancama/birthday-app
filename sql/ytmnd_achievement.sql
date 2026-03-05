-- Achievement: YTMND Easter Egg
-- Awarded when a user discovers and clicks the Y-T-M-N-D sequence on the event-info page.

BEGIN;

INSERT INTO achievements (key, name, description, points, metadata)
VALUES (
  'ytmnd',
  'You''re The Man Now Dog!',
  'You found the secret. Sean Connery is proud of you.',
  10,
  '{"trigger":"ytmnd"}'
)
ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  points = EXCLUDED.points,
  metadata = EXCLUDED.metadata;

COMMIT;
