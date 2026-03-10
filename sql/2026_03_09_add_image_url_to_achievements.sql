-- Migration: Add image_url column to achievements table
-- Created: 2026-03-09

ALTER TABLE achievements ADD COLUMN image_url TEXT;

-- Optionally, add a comment for documentation
COMMENT ON COLUMN achievements.image_url IS 'URL to achievement image for display in user profile and awards.';
