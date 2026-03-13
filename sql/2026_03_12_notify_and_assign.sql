-- Migration: notify_and_assign RPC
-- Creates a helper RPC that assigns the next available challenge to a target user
-- and inserts a notification for them. This is intentionally conservative and
-- should be reviewed for your exact schema and RLS needs before applying to
-- production.

-- Drop if exists (safe to re-run during deployments)
DROP FUNCTION IF EXISTS public.notify_and_assign(uuid, uuid);

CREATE OR REPLACE FUNCTION public.notify_and_assign(p_sender uuid, p_target uuid)
RETURNS TABLE(assignment_id uuid, challenge_id uuid) AS $$
DECLARE
  v_challenge_id uuid;
BEGIN
  -- Find a candidate challenge that the target does not already have active/completed
  SELECT c.id
    INTO v_challenge_id
  FROM challenges c
  WHERE NOT EXISTS (
    SELECT 1 FROM assignments a
    WHERE a.challenge_id = c.id
      AND a.user_id = p_target
      AND (a.active = true OR a.completed_at IS NOT NULL)
  )
  ORDER BY c.created_at NULLS LAST, c.id
  LIMIT 1;

  IF v_challenge_id IS NULL THEN
    RAISE EXCEPTION 'no_available_challenge';
  END IF;

  -- Insert an assignment for the target user
  INSERT INTO assignments (challenge_id, user_id, active, assigned_by, created_at, updated_at)
  VALUES (v_challenge_id, p_target, true, p_sender, now(), now())
  RETURNING id INTO assignment_id;

  challenge_id := v_challenge_id;

  -- Insert a simple notification record so the user can be alerted in-app
  -- Assumes a `notifications` table exists with (id, user_id, payload, read, created_at)
  INSERT INTO notifications (user_id, payload, read, created_at)
  VALUES (
    p_target,
    jsonb_build_object('type', 'challenge_assigned', 'from_user', p_sender::text, 'challenge_id', v_challenge_id::text),
    false,
    now()
  );

  RETURN NEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Note: Review this function before applying. It uses simple heuristics to find
-- an available challenge and inserts rows into `assignments` and `notifications`.
-- Adjust ordering, selection, and payload shape as required by your business rules.
