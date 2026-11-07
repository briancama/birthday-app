-- Apply after 2026_11_05_wallet_site_rewards.sql.
-- Edit transaction_memo in Supabase's site_vote_types table for future credits.
BEGIN;

ALTER TABLE public.site_vote_types ADD COLUMN IF NOT EXISTS transaction_memo text;

UPDATE public.site_vote_types AS t
SET transaction_memo = copy.memo
FROM (VALUES
  ('/images/site-awards_blink182.gif', 'Voted: Blink-182 rules'),
  ('/images/site-awards_hackers.gif', 'Voted: ZER0 H4CKERS HERE'),
  ('/images/site-awards_pikachu.gif', 'Voted: Pikachu and Robin love this site'),
  ('/images/site-awards_christian.gif', 'Voted: Praise be to my site'),
  ('/images/site-awards_hanson.gif', 'Voted: MmmmVote'),
  ('/images/site-awards_aaroncarter.gif', 'Voted: My site is in heaven with AC'),
  ('/images/site-awards_angel.gif', 'Voted: Angels love deers and my site'),
  ('/images/site-awards_pug.gif', 'Voted: A pugs favorite site'),
  ('/images/site-awards_predator.gif', 'Voted: You sonofabitch'),
  ('/images/site-awards_southpark.gif', 'Voted: Oh my god you love my site, you bastard'),
  ('/images/site-awards_jackpot.gif', 'Voted: This sites hit the jackpot'),
  ('/images/site-awards_olsen.gif', 'Voted: Give me votes, V O T E S'),
  ('/images/site-awards-bomb.gif', 'Voted: Da Bomb 2000'),
  ('/images/site-awards-bod.gif', 'Voted: This site is platinum'),
  ('/images/site-awards-patriot.gif', 'Voted: I am a patriot'),
  ('/images/site-awards-seinfeld.gif', 'Voted: Even Seinfeld loves my site'),
  ('/images/site-awards-tweety.gif', 'Voted: I tawt I taw a voting cat'),
  ('/images/site-awards-voyager.gif', 'Voted: Ranked 2,300,204th in the galaxy')
) AS copy(vote_type, memo)
WHERE t.vote_type = copy.vote_type AND t.transaction_memo IS NULL;

UPDATE public.site_vote_types SET transaction_memo = 'Site vote'
WHERE transaction_memo IS NULL;
ALTER TABLE public.site_vote_types
  ALTER COLUMN transaction_memo SET DEFAULT 'Site vote',
  ALTER COLUMN transaction_memo SET NOT NULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.site_vote_types'::regclass
      AND conname = 'site_vote_types_transaction_memo_check'
  ) THEN
    ALTER TABLE public.site_vote_types ADD CONSTRAINT site_vote_types_transaction_memo_check
      CHECK (length(btrim(transaction_memo)) BETWEEN 1 AND 160);
  END IF;
END;
$$;
COMMENT ON COLUMN public.site_vote_types.transaction_memo IS
  'Editable wallet description for future credited votes. Existing ledger descriptions are preserved.';

CREATE OR REPLACE FUNCTION public.earn_site_vote_for(p_player uuid, p_vote_type text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_day date;
  v_ref uuid;
  v_memo text;
  v_reward jsonb;
BEGIN
  IF p_player IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  SELECT transaction_memo INTO v_memo FROM public.site_vote_types WHERE vote_type = p_vote_type;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid_vote_type' USING ERRCODE = '22023';
  END IF;
  SELECT (now() AT TIME ZONE s.day_boundary_tz)::date INTO STRICT v_day
  FROM public.wallet_settings s WHERE s.id;
  v_ref := md5('site_vote:' || p_vote_type || ':' || v_day::text)::uuid;
  v_reward := public.wallet_earn_internal(p_player, 'site_vote', v_ref);
  -- The new credit and its description commit together; replays never rewrite history.
  IF v_reward->>'status' = 'earned' THEN
    UPDATE public.wallet_ledger SET memo = v_memo
    WHERE idempotency_key = format('earn:site_vote:%s:ref:%s', p_player, v_ref);
  END IF;
  RETURN v_reward;
END;
$$;
REVOKE ALL ON FUNCTION public.earn_site_vote_for(uuid, text)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.earn_site_vote_for(uuid, text) TO service_role;

COMMIT;
