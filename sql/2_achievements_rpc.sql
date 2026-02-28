-- RPCs for awarding achievements atomically
BEGIN;

-- Generic RPC: award achievement by key if not already awarded
CREATE OR REPLACE FUNCTION public.rpc_award_achievement_by_key(p_user_id uuid, p_key text, p_details jsonb DEFAULT '{}'::jsonb)
RETURNS TABLE(awarded boolean, achievement_id uuid) AS $$
DECLARE
  v_ach RECORD;
BEGIN
  SELECT id, key INTO v_ach FROM achievements WHERE key = p_key LIMIT 1;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::uuid;
    RETURN;
  END IF;

  -- Try to insert; if already exists, do nothing
  BEGIN
    INSERT INTO user_achievements (user_id, achievement_id, details)
    VALUES (p_user_id, v_ach.id, p_details);
    RETURN QUERY SELECT true, v_ach.id;
    RETURN;
  EXCEPTION WHEN unique_violation THEN
    -- Already awarded
    RETURN QUERY SELECT false, v_ach.id;
    RETURN;
  END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Award when a user has at least N comment-like entries (prefers `comments` table, falls back to `guestbook`)
CREATE OR REPLACE FUNCTION public.rpc_award_on_comment_threshold(p_user_id uuid, p_threshold integer DEFAULT 3)
RETURNS TABLE(awarded boolean, achievement_id uuid, comment_count integer) AS $$
DECLARE
  v_count integer;
  v_comments_table text := NULL;
BEGIN
  -- Prefer counting from `comments` table if it exists (some deployments use `comments`)
  IF to_regclass('public.comments') IS NOT NULL THEN
    v_comments_table := 'comments';
    EXECUTE format('SELECT COUNT(*) FROM %I WHERE user_id = $1', v_comments_table) INTO v_count USING p_user_id;
  ELSE
    -- Fallback to legacy `guestbook` table
    v_comments_table := 'guestbook';
    SELECT COUNT(*) INTO v_count FROM guestbook WHERE user_id = p_user_id;
  END IF;

  IF v_count >= p_threshold THEN
    PERFORM * FROM rpc_award_achievement_by_key(p_user_id, 'three_comments', jsonb_build_object('count', v_count));
    -- Return whether awarded via reading user_achievements
    RETURN QUERY
      SELECT
        (SELECT EXISTS (SELECT 1 FROM user_achievements ua JOIN achievements a ON ua.achievement_id = a.id WHERE ua.user_id = p_user_id AND a.key = 'three_comments')) AS awarded,
        (SELECT id FROM achievements WHERE key = 'three_comments') AS achievement_id,
        v_count;
    RETURN;
  END IF;
  RETURN QUERY SELECT false, NULL::uuid, v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Award when a user has completed all active assigned challenges
CREATE OR REPLACE FUNCTION public.rpc_award_when_all_assigned_completed(p_user_id uuid)
RETURNS TABLE(awarded boolean, achievement_id uuid, total_assigned integer, total_completed integer) AS $$
DECLARE
  v_total integer;
  v_completed integer;
BEGIN
  SELECT COUNT(*) INTO v_total FROM assignments WHERE user_id = p_user_id AND active = true;
  IF v_total = 0 THEN
    RETURN QUERY SELECT false, NULL::uuid, 0, 0;
    RETURN;
  END IF;

  SELECT COUNT(*) INTO v_completed FROM assignments WHERE user_id = p_user_id AND active = true AND outcome = 'success';

  IF v_total > 0 AND v_total = v_completed THEN
    PERFORM * FROM rpc_award_achievement_by_key(p_user_id, 'all_assigned_completed', jsonb_build_object('total_assigned', v_total));
    RETURN QUERY
      SELECT
        (SELECT EXISTS (SELECT 1 FROM user_achievements ua JOIN achievements a ON ua.achievement_id = a.id WHERE ua.user_id = p_user_id AND a.key = 'all_assigned_completed')) AS awarded,
        (SELECT id FROM achievements WHERE key = 'all_assigned_completed') AS achievement_id,
        v_total,
        v_completed;
    RETURN;
  END IF;

  RETURN QUERY SELECT false, NULL::uuid, v_total, v_completed;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Seed threshold achievements if missing
INSERT INTO achievements (key, name, description, points, metadata)
VALUES
  ('three_comments', 'Triple Signer', 'Leave 3 guestbook comments', 2, '{"trigger":"guestbook:count","threshold":3}')
  ON CONFLICT (key) DO NOTHING;

INSERT INTO achievements (key, name, description, points, metadata)
VALUES
  ('all_assigned_completed', 'Completionist', 'Complete all assigned challenges', 10, '{"trigger":"assignments:all_completed"}')
  ON CONFLICT (key) DO NOTHING;

COMMIT;
