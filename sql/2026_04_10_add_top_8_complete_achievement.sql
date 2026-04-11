-- Add Top 8 completion achievement: awarded when a user fills all 8 Top 8 slots.

BEGIN;

INSERT INTO achievements (key, name, description, points, metadata, is_visitor_eligible)
VALUES (
  'top_8_complete',
  'My Crew''s All Here',
  'Filled every slot in your Top 8.',
  2,
  '{"trigger":"top8:completed","threshold":8}'::jsonb,
  true
)
ON CONFLICT (key) DO NOTHING;

COMMIT;
