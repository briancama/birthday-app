-- Add wall post achievements: 3-tier system for posting on other users' BriSpace walls.
-- Only counts posts where author_user_id != target_user_id (no self-posts).
-- Multiple posts on the same wall count toward the total (cumulative, not distinct).
-- is_visitor_eligible = true so these contribute to Brispace leaderboard rank.

BEGIN;

INSERT INTO achievements (key, name, description, points, metadata, is_visitor_eligible)
VALUES
  (
    'wall_flower',
    'Wall Flower',
    'Left your first message on someone''s wall.',
    1,
    '{"trigger":"wall:posted","threshold":1}'::jsonb,
    true
  ),
  (
    'social_butterfly',
    'Social Butterfly',
    'Kept the conversation going — posted on 5 walls.',
    2,
    '{"trigger":"wall:posted","threshold":5}'::jsonb,
    true
  ),
  (
    'toms_best_friend',
    'Tom''s Best Friend',
    'Wall legend. 20+ posts on people''s walls.',
    3,
    '{"trigger":"wall:posted","threshold":20}'::jsonb,
    true
  )
ON CONFLICT (key) DO NOTHING;

COMMIT;
