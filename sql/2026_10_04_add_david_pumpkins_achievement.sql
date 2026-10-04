-- Hidden Walktober easter egg: click all four Halloween character gifs
-- (zombie, frankenstein, skull, werewolf), let the last dance track finish,
-- and David S. Pumpkins rises. Awarded client-side via rpc_award_achievement_by_key.

BEGIN;

INSERT INTO achievements (key, name, description, points, metadata, is_visitor_eligible, image_url)
VALUES (
  'david_pumpkins',
  'David S Pumpkins',
  'You did the monster mash',
  2,
  '{"hidden": true, "trigger": "easter_egg:walktober_pumpkin_gifs"}'::jsonb,
  true,
  '/images/pumpkin_face.gif'
)
ON CONFLICT (key) DO UPDATE
SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  points = EXCLUDED.points,
  metadata = EXCLUDED.metadata,
  is_visitor_eligible = EXCLUDED.is_visitor_eligible,
  image_url = EXCLUDED.image_url;

COMMIT;
