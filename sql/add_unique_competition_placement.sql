-- Add unique constraint for one placement per user per event
ALTER TABLE competition_placements
ADD CONSTRAINT competition_placements_event_user_unique UNIQUE (event_id, user_id);
