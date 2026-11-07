-- DEV database only, after wallet_vote_copy.sql. Fixtures and copy edits roll back.
BEGIN;
DO $$
DECLARE
  v_player uuid := gen_random_uuid();
  v_result jsonb;
  v_count int;
BEGIN
  INSERT INTO public.users (id, username, display_name)
  VALUES (v_player, 'wtest_' || v_player::text, 'Vote copy test');
  UPDATE public.site_vote_types SET transaction_memo = 'Pug appreciation fund'
  WHERE vote_type = '/images/site-awards_pug.gif';
  v_result := public.record_site_vote_for('/images/site-awards_pug.gif', v_player);
  IF v_result->>'status' <> 'earned' OR NOT EXISTS (
    SELECT 1 FROM public.wallet_ledger
    WHERE player_id = v_player AND memo = 'Pug appreciation fund' AND amount = 500
  ) THEN RAISE EXCEPTION 'custom vote copy not saved: %', v_result; END IF;
  UPDATE public.site_vote_types SET transaction_memo = 'New pug copy'
  WHERE vote_type = '/images/site-awards_pug.gif';
  v_result := public.record_site_vote_for('/images/site-awards_pug.gif', v_player);
  IF v_result->>'status' <> 'already_earned' OR NOT EXISTS (
    SELECT 1 FROM public.wallet_ledger
    WHERE player_id = v_player AND memo = 'Pug appreciation fund'
  ) THEN RAISE EXCEPTION 'replay changed historical copy'; END IF;
  v_result := public.record_site_vote_for('/images/site-awards_hanson.gif', v_player);
  IF v_result->>'status' <> 'earned' OR NOT EXISTS (
    SELECT 1 FROM public.wallet_ledger
    WHERE player_id = v_player AND memo = (
      SELECT transaction_memo FROM public.site_vote_types
      WHERE vote_type = '/images/site-awards_hanson.gif'
    )
  ) THEN RAISE EXCEPTION 'different vote type did not use own copy'; END IF;
  PERFORM public.record_site_vote_for('/images/site-awards_pikachu.gif', v_player);
  v_result := public.record_site_vote_for('/images/site-awards_predator.gif', v_player);
  SELECT count(*) INTO v_count FROM public.wallet_ledger WHERE player_id = v_player;
  IF v_result->>'status' <> 'daily_cap' OR v_count <> 3 THEN
    RAISE EXCEPTION 'copy integration changed reward cap';
  END IF;
  BEGIN
    UPDATE public.site_vote_types SET transaction_memo = ' '
    WHERE vote_type = '/images/site-awards_pug.gif';
    RAISE EXCEPTION 'blank copy accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  RAISE NOTICE 'Wallet vote copy checks passed';
END;
$$;
ROLLBACK;
