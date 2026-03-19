-- Migration: Add home_only to challenges and triggered_at to assignments
-- Date: 2026-03-17

-- Add home_only flag to challenges
-- Indicates the challenge must be completed at the house (shown as a house icon in hub)
ALTER TABLE public.challenges
ADD COLUMN IF NOT EXISTS home_only boolean NOT NULL DEFAULT false;

-- Add triggered_at to assignments
-- NULL = dormant (not yet triggered), NOT NULL = actively running
ALTER TABLE public.assignments
ADD COLUMN IF NOT EXISTS triggered_at timestamp with time zone NULL;

-- Index for efficient active challenge count queries (used for 2-challenge cap)
CREATE INDEX IF NOT EXISTS idx_assignments_triggered_completed
  ON public.assignments (user_id, triggered_at, completed_at)
  WHERE triggered_at IS NOT NULL AND completed_at IS NULL;
