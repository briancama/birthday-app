-- SQL function for atomic assignment updates
-- This replaces multiple round-trips with a single database operation

-- Drop the old function with exact signature to avoid conflicts
DROP FUNCTION IF EXISTS public.update_challenge_assignments(UUID, UUID[], UUID);
DROP FUNCTION IF EXISTS public.update_challenge_assignments(TEXT, UUID[], UUID);

CREATE OR REPLACE FUNCTION update_challenge_assignments(
  p_challenge_id TEXT,  -- Changed from UUID to TEXT to match schema
  p_user_ids UUID[],
  p_updated_by UUID
) RETURNS TABLE (
  operation TEXT,
  affected_user_id UUID,  -- Renamed to avoid conflict with table column
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

  -- Return deactivated users
  RETURN QUERY
  SELECT 'deactivated'::TEXT, a.user_id, true::BOOLEAN
  FROM assignments a
  WHERE a.challenge_id = p_challenge_id 
    AND a.active = false 
    AND a.updated_by = p_updated_by 
    AND a.updated_at > NOW() - INTERVAL '1 second';

  -- Upsert assignments (reactivate existing or create new)
  INSERT INTO assignments (user_id, challenge_id, active, assigned_at, updated_at, updated_by)
  SELECT 
    unnest(p_user_ids),
    p_challenge_id,
    true,
    NOW(),
    NOW(),
    p_updated_by
  ON CONFLICT (user_id, challenge_id) 
  DO UPDATE SET 
    active = true,
    assigned_at = NOW(),
    updated_at = NOW(),
    updated_by = p_updated_by;

  -- Return activated/created users  
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