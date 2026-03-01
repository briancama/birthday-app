-- Add achievements for challenge submissions (1 and 3 submissions)
BEGIN;

INSERT INTO achievements (key, name, description, points, metadata)
VALUES
  ('first_challenge', 'First Challenge', 'Submit your first challenge', 1, '{"trigger":"challenge:submitted","threshold":1}'),
  ('three_challenges', 'Triple Challenger', 'Submit three challenges', 3, '{"trigger":"challenge:submitted","threshold":3}')
ON CONFLICT (key) DO NOTHING;

COMMIT;
