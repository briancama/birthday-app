-- Migration: Create achievements catalog and per-user awards
BEGIN;

-- Achievements catalog
CREATE TABLE IF NOT EXISTS achievements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  points integer NOT NULL DEFAULT 0,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- Per-user awarded achievements
CREATE TABLE IF NOT EXISTS user_achievements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  achievement_id uuid NOT NULL REFERENCES achievements(id) ON DELETE CASCADE,
  awarded_at timestamptz DEFAULT now(),
  details jsonb DEFAULT '{}'::jsonb,
  UNIQUE (user_id, achievement_id)
);

CREATE INDEX IF NOT EXISTS idx_user_achievements_user_id ON user_achievements(user_id);
CREATE INDEX IF NOT EXISTS idx_achievements_key ON achievements(key);

-- Example seed achievements
-- Example seed achievements (keep only non-competition / desired seeds)
INSERT INTO achievements (key, name, description, points, metadata)
VALUES
  ('first_comment', 'Hello World', 'Sign the guestbook once', 2, '{"trigger":"guestbook:first"}')
  ON CONFLICT (key) DO NOTHING;

INSERT INTO achievements (key, name, description, points, metadata)
VALUES
  ('rickroll', 'Got Rick Rolled', 'You clicked the Claim Prize — surprise!', 1, '{"trigger":"rickroll"}')
  ON CONFLICT (key) DO NOTHING;

COMMIT;
