-- Add H4x0r achievement awarded when a user completes the scam dialog flow.
-- Safe to run multiple times (ON CONFLICT DO NOTHING).

BEGIN;

INSERT INTO achievements (key, name, description, points, metadata)
VALUES (
  'hacked',
  'H4x0r',
  'You did not pass the Insanity Test!',
  2,
  '{"trigger":"hacked"}'::jsonb
)
ON CONFLICT (key) DO NOTHING;

COMMIT;
