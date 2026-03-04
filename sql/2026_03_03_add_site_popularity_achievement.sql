-- Add achievement for clicking 10 unique site-award images
BEGIN;

INSERT INTO achievements (key, name, description, points, metadata)
VALUES (
  'site_popularity',
  'You Really Like Me!',
  'You voted my site best aaron carter/predator/blink-182/christian/olsen twins website in the world!!!',
  5,
  '{"trigger":"site:award:clicked","threshold":10}'
)
ON CONFLICT (key) DO NOTHING;

COMMIT;
