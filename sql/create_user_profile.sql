-- SQL migration: create user_profile table, trigger, and view
-- Run this on your Postgres / Supabase instance

CREATE TABLE IF NOT EXISTS user_profile (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  profile_intro text,
  prompt_html text,
  profile_title text,
  prompt_title text,
  age integer,
  profile_bg_url text,
  profile_bg_mode text DEFAULT 'cover',
  favorite_song_id uuid,
  profile_details jsonb DEFAULT '[]'::jsonb,
  is_public boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CHECK (jsonb_array_length(profile_details) <= 6)
);

-- Index for quick lookups by favorite song if desired
CREATE INDEX IF NOT EXISTS idx_user_profile_favorite_song ON user_profile (favorite_song_id);

-- Trigger to keep updated_at fresh
CREATE OR REPLACE FUNCTION set_user_profile_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_user_profile_updated_at ON user_profile;
CREATE TRIGGER trg_set_user_profile_updated_at
BEFORE UPDATE ON user_profile
FOR EACH ROW
EXECUTE FUNCTION set_user_profile_updated_at();

-- Convenience view joining basic user info with profile
CREATE OR REPLACE VIEW user_profile_view AS
SELECT
  u.id                        AS user_id,
  u.display_name              AS display_name,
  u.headshot                  AS headshot,
  p.profile_intro             AS profile_intro,
  p.prompt_html               AS prompt_html,
  p.profile_title             AS profile_title,
  p.prompt_title              AS prompt_title,
  p.age                       AS age,
  p.profile_bg_url            AS profile_bg_url,
  p.profile_bg_mode           AS profile_bg_mode,
  p.favorite_song_id          AS favorite_song_id,
  p.profile_details           AS profile_details,
  p.is_public                 AS is_public,
  p.created_at                AS profile_created_at,
  p.updated_at                AS profile_updated_at
FROM user_profile p
JOIN users u ON u.id = p.user_id;

-- Note: favorite song metadata (title/artist/track url) can be joined separately
-- depending on the schema of your `user_favorite_song` table.
