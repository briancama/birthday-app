-- DEV database only, after wallet_achievement_credits.sql. All fixtures roll back.
BEGIN;
DO $$
DECLARE
  v_player uuid := gen_random_uuid();
  v_empty uuid := gen_random_uuid();
  v_eligible uuid := gen_random_uuid();
  v_event uuid := gen_random_uuid();
  v_zero uuid := gen_random_uuid();
  v_new uuid := gen_random_uuid();
  v_result jsonb;
  v_action text := 'wtest_' || gen_random_uuid()::text;
BEGIN
  INSERT INTO public.users (id, username, display_name) VALUES
    (v_player, 'wtest_' || v_player::text, 'Wallet test'),
    (v_empty, 'wtest_' || v_empty::text, 'Empty wallet test');
  INSERT INTO public.achievements (id, key, name, points, is_visitor_eligible) VALUES
    (v_eligible, 'wtest_' || v_eligible::text, 'Eligible test', 3, true),
    (v_event, 'wtest_' || v_event::text, 'Event test', 20, false),
    (v_zero, 'wtest_' || v_zero::text, 'Zero test', 0, true),
    (v_new, 'wtest_' || v_new::text, 'New test', 2, true);
  INSERT INTO public.user_achievements (user_id, achievement_id) VALUES
    (v_player, v_eligible), (v_player, v_event), (v_player, v_zero);
  IF public.get_wallet_for(v_player) <> 0 OR EXISTS (
    SELECT 1 FROM public.wallet_achievement_activation WHERE player_id = v_player
  ) THEN RAISE EXCEPTION 'awards or reads activated wallet prematurely'; END IF;

  -- Conversion must not consume, or be blocked by, the global earn allowance.
  UPDATE public.wallet_settings SET max_earn_per_player_per_day = 1 WHERE id;
  v_result := public.activate_wallet_for(v_player);
  IF v_result->>'status' <> 'earned' OR (v_result->>'amount')::bigint <> 15000
     OR (v_result->>'balance')::bigint <> 15000
     OR NOT (v_result->>'activated_now')::boolean THEN
    RAISE EXCEPTION 'wrong first-open conversion: %', v_result;
  END IF;
  IF (SELECT count(*) FROM public.wallet_ledger WHERE player_id = v_player) <> 1
     OR EXISTS (SELECT 1 FROM public.wallet_ledger WHERE player_id = v_player
                AND (kind <> 'grant' OR ref_type <> 'achievement' OR ref_id <> v_eligible)) THEN
    RAISE EXCEPTION 'incorrect conversion ledger shape';
  END IF;
  v_result := public.activate_wallet_for(v_player);
  IF v_result->>'status' <> 'already_credited' OR (v_result->>'amount')::bigint <> 0
     OR (v_result->>'activated_now')::boolean THEN
    RAISE EXCEPTION 'activation replay paid twice: %', v_result;
  END IF;
  DELETE FROM public.user_achievements
  WHERE user_id = v_player AND achievement_id = v_eligible;
  INSERT INTO public.user_achievements (user_id, achievement_id) VALUES (v_player, v_eligible);
  IF public.get_wallet_for(v_player) <> 15000 THEN
    RAISE EXCEPTION 'deleted/re-awarded achievement paid twice';
  END IF;
  INSERT INTO public.user_achievements (user_id, achievement_id) VALUES (v_player, v_new);
  IF public.get_wallet_for(v_player) <> 25000 THEN
    RAISE EXCEPTION 'new achievement not credited by trigger';
  END IF;
  IF (SELECT sum(amount) FROM public.wallet_ledger WHERE player_id = v_player) <>
     public.get_wallet_for(v_player) THEN RAISE EXCEPTION 'ledger/balance mismatch'; END IF;
  IF (SELECT sum(a.points) FROM public.user_achievements ua
      JOIN public.achievements a ON a.id = ua.achievement_id
      WHERE ua.user_id = v_player AND a.is_visitor_eligible) <> 5 THEN
    RAISE EXCEPTION 'conversion modified achievement points';
  END IF;
  INSERT INTO public.earn_rules (action, amount) VALUES (v_action, 1);
  v_result := public.earn_chips_for(v_player, v_action);
  IF v_result->>'status' <> 'earned' THEN
    RAISE EXCEPTION 'achievement credits consumed daily earn allowance: %', v_result;
  END IF;
  v_result := public.earn_chips_for(v_player, v_action);
  IF v_result->>'status' <> 'global_cap' THEN
    RAISE EXCEPTION 'normal earning cap was bypassed: %', v_result;
  END IF;
  v_result := public.activate_wallet_for(v_empty);
  IF (v_result->>'amount')::bigint <> 0 OR (v_result->>'balance')::bigint <> 0 THEN
    RAISE EXCEPTION 'empty wallet received fabricated credits';
  END IF;
  INSERT INTO public.user_achievements (user_id, achievement_id) VALUES (v_empty, v_new);
  IF public.get_wallet_for(v_empty) <> 10000 THEN
    RAISE EXCEPTION 'empty activated wallet did not receive later award';
  END IF;
  IF has_function_privilege('authenticated', 'public.activate_wallet_for(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.activate_wallet()', 'EXECUTE')
     OR has_function_privilege('service_role',
       'public.wallet_sync_achievements_internal(uuid,boolean)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.activate_wallet()', 'EXECUTE') THEN
    RAISE EXCEPTION 'incorrect conversion RPC privileges';
  END IF;
  RAISE NOTICE 'Wallet achievement conversion checks passed';
END;
$$;
ROLLBACK;
