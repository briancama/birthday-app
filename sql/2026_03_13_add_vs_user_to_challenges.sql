-- Add vs_user column to challenges table for user-vs-user challenge support
-- When a challenge has vs_user set, the primary assignee sees the challenge.
-- On completion, the vs_user gets an auto-created assignment with the inverted outcome,
-- mirroring the existing Brian-mode 'vs' pattern.
-- Date: 2026-03-13

ALTER TABLE challenges
  ADD COLUMN IF NOT EXISTS vs_user UUID NULL REFERENCES users(id);

-- Allow admins to update the new column (existing admin UPDATE policy on challenges
-- covers the full row, so no additional policy is required).
-- Verify by checking: SELECT * FROM pg_policies WHERE tablename = 'challenges';
