-- Add achievement for clicking every sidebar ad at least once
BEGIN;

INSERT INTO achievements (key, name, description, points, metadata, is_visitor_eligible, image_url)
VALUES (
  'ad_completionist',
  'No Ad Blocker',
  'You clicked every sidebar advertisement. The capatilist internet thanks you for your service.',
  3,
  '{"trigger":"ad:clicked:all"}',
  true,
  '/images/achievement_ad.jpg'
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
