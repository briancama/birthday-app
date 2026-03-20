-- Fix: preserve assigned_at on assignment reactivation
-- Previously the upsert always stamped assigned_at = NOW(), which scrambled
-- trigger order any time a challenge's assignments were edited in the admin panel.
-- This patch updates only the ON CONFLICT clause to keep the original timestamp.

CREATE OR REPLACE FUNCTION update_challenge_assignments(
  p_challenge_id TEXT,
  p_user_ids UUID[],
  p_updated_by UUID
) RETURNS TABLE (
  operation TEXT,
  affected_user_id UUID,
  success BOOLEAN
)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
BEGIN
  -- Deactivate assignments not in the new list
  UPDATE assignments
  SET active = false, updated_at = NOW(), updated_by = p_updated_by
  WHERE challenge_id = p_challenge_id
    AND active = true
    AND user_id != ALL(p_user_ids);

  RETURN QUERY
  SELECT 'deactivated'::TEXT, a.user_id, true::BOOLEAN
  FROM assignments a
  WHERE a.challenge_id = p_challenge_id
    AND a.active = false
    AND a.updated_by = p_updated_by
    AND a.updated_at > NOW() - INTERVAL '1 second';

  -- Upsert: NEW — only set assigned_at on first insert, never overwrite on reactivation
  INSERT INTO assignments (user_id, challenge_id, active, assigned_at, updated_at, updated_by)
  SELECT unnest(p_user_ids), p_challenge_id, true, NOW(), NOW(), p_updated_by
  ON CONFLICT (user_id, challenge_id)
  DO UPDATE SET
    active      = true,
    assigned_at = COALESCE(assignments.assigned_at, NOW()),  -- preserve original
    updated_at  = NOW(),
    updated_by  = p_updated_by;

  RETURN QUERY
  SELECT
    CASE WHEN a.assigned_at = a.updated_at THEN 'created' ELSE 'reactivated' END::TEXT,
    a.user_id,
    true::BOOLEAN
  FROM assignments a
  WHERE a.challenge_id = p_challenge_id
    AND a.active = true
    AND a.user_id = ANY(p_user_ids)
    AND a.updated_by = p_updated_by
    AND a.updated_at > NOW() - INTERVAL '1 second';
END;
$$;
