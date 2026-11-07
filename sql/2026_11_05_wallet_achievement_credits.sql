-- Apply after the wallet and achievement catalog/visitor-eligibility migrations.
-- 100 units = 1 bric; 1 eligible achievement point = 50 brics (5,000 units).
BEGIN;

CREATE TABLE IF NOT EXISTS public.wallet_achievement_activation (
  player_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  activated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.wallet_achievement_activation ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.wallet_achievement_activation FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.wallet_achievement_activation TO service_role;

CREATE OR REPLACE FUNCTION public.wallet_sync_achievements_internal(
  p_player uuid, p_activate boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_award record;
  v_key text;
  v_amount bigint := 0;
  v_balance bigint;
  v_activated int := 0;
BEGIN
  IF p_player IS NULL OR NOT EXISTS (SELECT 1 FROM public.users WHERE id = p_player) THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  -- Acquired before wallet locks by both activation and award inserts. An award
  -- racing the first open is either backfilled or credited by its own trigger.
  PERFORM pg_advisory_xact_lock(hashtextextended('wallet-achievements:' || p_player::text, 0));
  IF p_activate THEN
    INSERT INTO public.wallet_achievement_activation (player_id) VALUES (p_player)
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_activated = ROW_COUNT;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.wallet_achievement_activation WHERE player_id = p_player
  ) THEN
    RETURN jsonb_build_object('status', 'not_activated', 'amount', 0);
  END IF;

  FOR v_award IN
    SELECT a.id, a.name, a.points
    FROM public.user_achievements ua
    JOIN public.achievements a ON a.id = ua.achievement_id
    WHERE ua.user_id = p_player AND a.is_visitor_eligible AND a.points > 0
    ORDER BY a.id
  LOOP
    -- Key by catalog achievement, not the award row, so delete/re-award cannot pay twice.
    v_key := 'achievement:' || p_player::text || ':' || v_award.id::text;
    IF NOT EXISTS (SELECT 1 FROM public.wallet_ledger WHERE idempotency_key = v_key) THEN
      PERFORM public.wallet_apply(
        p_player, v_award.points::bigint * 5000, 'grant', v_key,
        'achievement', v_award.id, 'Achievement: ' || v_award.name
      );
      v_amount := v_amount + v_award.points::bigint * 5000;
    END IF;
  END LOOP;
  v_balance := public.get_wallet_for(p_player);
  RETURN jsonb_build_object(
    'status', CASE WHEN v_amount > 0 THEN 'earned' ELSE 'already_credited' END,
    'action', 'achievement', 'amount', v_amount, 'balance', v_balance,
    'activated_now', v_activated = 1
  );
END;
$$;
REVOKE ALL ON FUNCTION public.wallet_sync_achievements_internal(uuid, boolean)
FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.activate_wallet_for(p_player uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.wallet_sync_achievements_internal(p_player, true);
$$;
REVOKE ALL ON FUNCTION public.activate_wallet_for(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.activate_wallet_for(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.activate_wallet()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.activate_wallet_for(public.current_player_id());
$$;
REVOKE ALL ON FUNCTION public.activate_wallet() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.activate_wallet() TO authenticated;

CREATE OR REPLACE FUNCTION public.wallet_credit_new_achievement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.wallet_sync_achievements_internal(NEW.user_id, false);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.wallet_credit_new_achievement()
FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS wallet_credit_new_achievement ON public.user_achievements;
CREATE TRIGGER wallet_credit_new_achievement
AFTER INSERT ON public.user_achievements
FOR EACH ROW EXECUTE FUNCTION public.wallet_credit_new_achievement();

COMMIT;
