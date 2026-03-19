-- Add "Goblin King" hidden Easter Egg achievement.
-- Awarded when a user discovers and clicks the secret golden pixel at the
-- center of the page.

BEGIN;

INSERT INTO achievements (key, name, description, points, metadata)
VALUES (
  'goblin_king',
  'Goblin King',
  'You danced magic and slapped that baby. Baby.',
  50,
  '{"hidden": true, "trigger": "easter_egg:goblin_pixel"}'::jsonb
)
ON CONFLICT (key) DO NOTHING;

COMMIT;
