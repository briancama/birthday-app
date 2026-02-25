-- Add user_id column to guestbook table for event-info page user linking
ALTER TABLE guestbook ADD COLUMN user_id uuid REFERENCES users(id);
-- Existing comments will have user_id as NULL
