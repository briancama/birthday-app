-- Migration: Add user_type column to users table
-- 'participant' = pre-seeded/invited event guest with challenge assignments
-- 'visitor'     = open registrant (phone-verified but not on the guest list)

BEGIN;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS user_type text NOT NULL DEFAULT 'visitor'
  CHECK (user_type IN ('participant', 'visitor'));

-- Backfill: any user who already has at least one assignment is a participant
UPDATE public.users u
SET user_type = 'participant'
WHERE EXISTS (
  SELECT 1 FROM public.assignments a WHERE a.user_id = u.id
);

-- Also treat any user who was pre-seeded with a username as a participant
-- (covers users who have a username but no assignments yet, e.g. Brian)
UPDATE public.users u
SET user_type = 'participant'
WHERE u.username IS NOT NULL
  AND u.username != '';

COMMIT;
