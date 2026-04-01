-- Achievement: Forgot Your Phone
-- Awarded when a user completes the "Forgot your phone?" security question
-- flow on the login page and then successfully logs in.
-- Trigger key: 'forgot_phone' (dispatched via window achievement:trigger event)

BEGIN;

INSERT INTO achievements (key, name, description, points, metadata)
VALUES (
  'forgot_phone',
  'Senior Moment',
  'You forgot your own phone number and had to answer four security questions about yourself to log into your own website. Legendary.',
  2,
  '{"trigger":"forgot_phone","hidden":true}'::jsonb
)
ON CONFLICT (key) DO UPDATE SET
  name        = EXCLUDED.name,
  description = EXCLUDED.description,
  points      = EXCLUDED.points,
  metadata    = EXCLUDED.metadata;

COMMIT;
