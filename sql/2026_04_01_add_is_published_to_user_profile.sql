-- 2026_04_01_add_is_published_to_user_profile.sql
-- Adds is_published boolean column to user_profile for profile publishing toggle
ALTER TABLE user_profile ADD COLUMN is_published boolean NOT NULL DEFAULT false;

-- Optionally, add a comment for clarity
COMMENT ON COLUMN user_profile.is_published IS 'Whether the user profile is publicly visible';
