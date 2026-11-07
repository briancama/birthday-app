-- Apply after 2026_10_29_chips_wallet.sql. 1 bric = 100 integer units.
BEGIN;

INSERT INTO public.earn_rules (action, amount, daily_cap, lifetime_cap, active, description)
VALUES
  ('daily_checkin', 2000, 1, NULL, true, 'Daily check-in'),
  ('site_vote', 500, 3, NULL, true, 'Site vote'),
  ('wall_post', 2500, 1, NULL, true, 'Posted on a friend''s wall')
ON CONFLICT (action) DO UPDATE SET
  amount = EXCLUDED.amount,
  daily_cap = EXCLUDED.daily_cap,
  lifetime_cap = EXCLUDED.lifetime_cap,
  active = EXCLUDED.active,
  description = EXCLUDED.description;

UPDATE public.wallet_settings SET max_earn_per_player_per_day = 6000 WHERE id;
UPDATE public.earn_rules SET active = false WHERE action = 'propose_market_idea';

-- Preserve the existing serialized cap/idempotency implementation behind a
-- wrapper that verifies server-backed wall references before awarding.
DO $$
BEGIN
  IF to_regprocedure('public.wallet_earn_internal(uuid,text,uuid)') IS NULL THEN
    ALTER FUNCTION public.earn_chips_for(uuid, text, uuid) RENAME TO wallet_earn_internal;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.wallet_earn_internal(uuid, text, uuid)
FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.earn_chips_for(
  p_player uuid, p_action text, p_ref_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_player IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF p_action = 'wall_post' AND NOT EXISTS (
    SELECT 1 FROM public.profile_wall w
    WHERE w.id = p_ref_id AND w.author_user_id = p_player
      AND w.target_user_id <> p_player
  ) THEN
    RAISE EXCEPTION 'invalid_wall_post_reference' USING ERRCODE = '22023';
  END IF;
  IF p_action = 'site_vote' THEN
    RAISE EXCEPTION 'use_earn_site_vote_for' USING ERRCODE = '22023';
  END IF;
  RETURN public.wallet_earn_internal(p_player, p_action, p_ref_id);
END;
$$;

REVOKE ALL ON FUNCTION public.earn_chips_for(uuid, text, uuid)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.earn_chips_for(uuid, text, uuid) TO service_role;

CREATE TABLE IF NOT EXISTS public.site_vote_types (
  vote_type text PRIMARY KEY
);
INSERT INTO public.site_vote_types (vote_type) VALUES
  ('/images/site-awards_blink182.gif'), ('/images/site-awards_hackers.gif'),
  ('/images/site-awards_pikachu.gif'), ('/images/site-awards_christian.gif'),
  ('/images/site-awards_hanson.gif'), ('/images/site-awards_aaroncarter.gif'),
  ('/images/site-awards_angel.gif'), ('/images/site-awards_pug.gif'),
  ('/images/site-awards_predator.gif'), ('/images/site-awards_southpark.gif'),
  ('/images/site-awards_jackpot.gif'), ('/images/site-awards_olsen.gif'),
  ('/images/site-awards-bomb.gif'), ('/images/site-awards-bod.gif'),
  ('/images/site-awards-patriot.gif'), ('/images/site-awards-seinfeld.gif'),
  ('/images/site-awards-tweety.gif'), ('/images/site-awards-voyager.gif')
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS public.site_votes (
  voter_key text NOT NULL,
  vote_type text NOT NULL REFERENCES public.site_vote_types(vote_type),
  vote_day date NOT NULL,
  player_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (voter_key, vote_type, vote_day)
);
COMMENT ON TABLE public.site_votes IS
  'One vote per catalog type/person/configured calendar day; counts even when bric rewards are capped. Visitors are browser-cookie identities, not verified people.';
CREATE INDEX IF NOT EXISTS site_votes_type_day ON public.site_votes (vote_type, vote_day);
ALTER TABLE public.site_vote_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_votes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.site_vote_types, public.site_votes FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.site_vote_types, public.site_votes TO service_role;

CREATE OR REPLACE FUNCTION public.earn_site_vote_for(p_player uuid, p_vote_type text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_day date;
  v_ref uuid;
BEGIN
  IF p_player IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.site_vote_types WHERE vote_type = p_vote_type) THEN
    RAISE EXCEPTION 'invalid_vote_type' USING ERRCODE = '22023';
  END IF;
  SELECT (now() AT TIME ZONE s.day_boundary_tz)::date INTO STRICT v_day
  FROM public.wallet_settings s WHERE s.id;
  -- The same type/day always uses the same reference. The underlying wallet
  -- lock serializes duplicate detection and the aggregate three-vote cap.
  v_ref := md5('site_vote:' || p_vote_type || ':' || v_day::text)::uuid;
  RETURN public.wallet_earn_internal(p_player, 'site_vote', v_ref);
END;
$$;
REVOKE ALL ON FUNCTION public.earn_site_vote_for(uuid, text)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.earn_site_vote_for(uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.record_site_vote_for(
  p_vote_type text, p_player uuid DEFAULT NULL, p_visitor uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_day date;
  v_voter text;
  v_inserted int;
  v_reward jsonb;
BEGIN
  IF p_player IS NULL AND p_visitor IS NULL THEN
    RAISE EXCEPTION 'vote_identity_required' USING ERRCODE = '28000';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.site_vote_types WHERE vote_type = p_vote_type) THEN
    RAISE EXCEPTION 'invalid_vote_type' USING ERRCODE = '22023';
  END IF;
  SELECT (now() AT TIME ZONE s.day_boundary_tz)::date INTO STRICT v_day
  FROM public.wallet_settings s WHERE s.id;
  v_voter := CASE WHEN p_player IS NOT NULL THEN 'user:' || p_player::text
                 ELSE 'visitor:' || p_visitor::text END;
  INSERT INTO public.site_votes (voter_key, vote_type, vote_day, player_id)
  VALUES (v_voter, p_vote_type, v_day, p_player)
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  IF p_player IS NOT NULL THEN
    v_reward := public.earn_site_vote_for(p_player, p_vote_type);
  ELSE
    v_reward := jsonb_build_object(
      'status', CASE WHEN v_inserted = 1 THEN 'recorded' ELSE 'already_recorded' END,
      'action', 'site_vote', 'amount', 0
    );
  END IF;
  RETURN v_reward || jsonb_build_object('counted', v_inserted = 1);
END;
$$;
REVOKE ALL ON FUNCTION public.record_site_vote_for(text, uuid, uuid)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_site_vote_for(text, uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.wallet_reward_wall_post()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.author_user_id IS NOT NULL AND NEW.author_user_id <> NEW.target_user_id THEN
    PERFORM public.earn_chips_for(NEW.author_user_id, 'wall_post', NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.wallet_reward_wall_post()
FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS wallet_reward_wall_post ON public.profile_wall;
CREATE TRIGGER wallet_reward_wall_post
AFTER INSERT ON public.profile_wall
FOR EACH ROW EXECUTE FUNCTION public.wallet_reward_wall_post();

COMMIT;
