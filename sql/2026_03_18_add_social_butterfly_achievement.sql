-- Add "Social Butterfly" achievement: awarded when a challenger has triggered
-- challenges for (total participants - 3) or more distinct players.
-- The threshold is computed dynamically inside the RPC so it adjusts automatically
-- to the participant count without needing a config change.

BEGIN;

INSERT INTO achievements (key, name, description, points, metadata)
VALUES (
  'the_challenger',
  'The Challenger',
  'A new challenger has appeared! At least for someone else.',
  3,
  '{"trigger":"challenge:threshold"}'::jsonb
)
ON CONFLICT (key) DO NOTHING;

-- RPC: check and award social_butterfly achievement for a given challenger.
-- Counts distinct users they have triggered challenges for (via updated_by),
-- compares against (total participants - 3), and awards if threshold is met.
CREATE OR REPLACE FUNCTION public.rpc_award_on_challenge_threshold(p_user_id uuid)
RETURNS TABLE(awarded boolean, achievement_id uuid, challenged_count integer, threshold integer) AS $$
DECLARE
  v_challenged  integer;
  v_participants integer;
  v_threshold   integer;
BEGIN
  -- Count distinct players this user has challenged (triggered, not themselves)
  SELECT COUNT(DISTINCT user_id)
  INTO v_challenged
  FROM assignments
  WHERE updated_by = p_user_id
    AND triggered_at IS NOT NULL
    AND user_id != p_user_id;

  -- Count total participants
  SELECT COUNT(*)
  INTO v_participants
  FROM users
  WHERE user_type = 'participant';

  -- Threshold = participants - 3, minimum 1
  v_threshold := GREATEST(1, v_participants - 3);

  IF v_challenged >= v_threshold THEN
    PERFORM * FROM rpc_award_achievement_by_key(
      p_user_id,
      'the_challenger',
      jsonb_build_object('challenged_count', v_challenged, 'threshold', v_threshold)
    );

    RETURN QUERY
      SELECT
        (SELECT EXISTS (
          SELECT 1 FROM user_achievements ua
          JOIN achievements a ON ua.achievement_id = a.id
          WHERE ua.user_id = p_user_id AND a.key = 'the_challenger'
        ))                                              AS awarded,
        (SELECT id FROM achievements WHERE key = 'the_challenger') AS achievement_id,
        v_challenged,
        v_threshold;
    RETURN;
  END IF;

  RETURN QUERY SELECT false, NULL::uuid, v_challenged, v_threshold;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;
