-- ============================================================
-- Chips wallet: play-money ledger shared by every client
--
-- SCALE: 1 chip = 100 units. Every amount/balance column and every
--        function argument is a bigint count of UNITS (integer math only).
--        Display chips as units / 100.
--
-- The ledger (wallet_ledger) is the source of truth. wallets.balance is a
-- cached running total, updated in the same transaction as each ledger
-- insert by wallet_apply(). Clients never write balances: RLS gives players
-- read-only access to their own rows and all writes go through
-- security definer functions.
--
-- "Player" = public.users.id (our own uuid, never the Firebase uid).
-- Callers are identified by a server-minted Supabase JWT whose sub is
-- users.id (see GET /auth/supabase-token). The EJS server calls the
-- service_role-only *_for(p_player) variants instead.
--
-- Contract docs: docs/WALLET.md. Dev rollback:
-- sql/2026_10_29_chips_wallet_down.sql.
-- Contest scores are read straight from the ledger; no snapshots or jobs.
-- Date: 2026-10-29
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- Admin flag: users.isadmin (from sql/add_isAdmin_column.sql)
-- ------------------------------------------------------------
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS isadmin boolean NOT NULL DEFAULT false;

UPDATE public.users SET isadmin = true WHERE lower(username) IN ('brianc', 'admin');

-- users has had an open UPDATE policy (sql/users_headshot_rls.sql), so make
-- sure only the service role or a direct DB session can change isadmin.
CREATE OR REPLACE FUNCTION public.users_guard_isadmin()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role text := coalesce(auth.jwt() ->> 'role', '');
BEGIN
  IF v_role IN ('anon', 'authenticated')
     AND (TG_OP = 'INSERT' AND NEW.isadmin
          OR TG_OP = 'UPDATE' AND NEW.isadmin IS DISTINCT FROM OLD.isadmin) THEN
    RAISE EXCEPTION 'isadmin can only be changed by the server' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS users_guard_isadmin ON public.users;
CREATE TRIGGER users_guard_isadmin
  BEFORE INSERT OR UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.users_guard_isadmin();

-- ------------------------------------------------------------
-- Tables
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.wallets (
  player_id  uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE RESTRICT,
  balance    bigint NOT NULL DEFAULT 0 CHECK (balance >= 0),  -- units (1 chip = 100)
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.wallet_ledger (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  player_id       uuid NOT NULL REFERENCES public.wallets(player_id) ON DELETE RESTRICT,
  amount          bigint NOT NULL CHECK (amount <> 0),          -- signed units
  balance_after   bigint NOT NULL CHECK (balance_after >= 0),   -- units
  -- New kinds must be added by a deliberate migration.
  kind            text NOT NULL CONSTRAINT wallet_ledger_kind_chk CHECK (kind IN (
                    'grant', 'stipend', 'earn', 'trade_buy', 'trade_sell',
                    'payout', 'refund', 'adjustment')),
  ref_type        text,   -- earn: the earn_rules.action; admin: 'admin'; market: e.g. 'trade'/'market'
  ref_id          uuid,
  idempotency_key text NOT NULL CONSTRAINT wallet_ledger_idempotency_key_key UNIQUE,
  memo            text,
  created_at      timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT wallet_ledger_amount_sign_chk CHECK (
    (kind IN ('grant', 'stipend', 'earn', 'trade_sell', 'payout', 'refund') AND amount > 0)
    OR (kind = 'trade_buy' AND amount < 0)
    OR kind = 'adjustment'
  )
);

CREATE INDEX IF NOT EXISTS wallet_ledger_player_created_idx
  ON public.wallet_ledger (player_id, created_at DESC);
CREATE INDEX IF NOT EXISTS wallet_ledger_player_id_idx
  ON public.wallet_ledger (player_id, id DESC);

CREATE TABLE IF NOT EXISTS public.earn_rules (
  action       text PRIMARY KEY,
  amount       bigint NOT NULL CHECK (amount > 0),   -- units
  daily_cap    int CHECK (daily_cap > 0),            -- earn events per day, null = none
  lifetime_cap int CHECK (lifetime_cap > 0),         -- earn events ever, null = none
  active       boolean NOT NULL DEFAULT true,
  description  text                                  -- shown as the ledger memo
);

CREATE TABLE IF NOT EXISTS public.wallet_settings (
  id                          boolean PRIMARY KEY DEFAULT true CHECK (id),  -- single row
  max_earn_per_player_per_day bigint CHECK (max_earn_per_player_per_day > 0),  -- units, null = none
  day_boundary_tz             text NOT NULL DEFAULT 'UTC'
);

CREATE TABLE IF NOT EXISTS public.contests (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name      text NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at   timestamptz NOT NULL,
  CHECK (ends_at > starts_at)
);

-- ------------------------------------------------------------
-- Seeds (PLACEHOLDER amounts; tune before launch)
-- ------------------------------------------------------------
INSERT INTO public.wallet_settings (id, max_earn_per_player_per_day, day_boundary_tz)
VALUES (true, 5000, 'UTC')   -- PLACEHOLDER: 50 chips/day
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.earn_rules (action, amount, daily_cap, lifetime_cap, description) VALUES
  ('daily_checkin',       1000, 1, NULL, 'Daily check-in'),        -- PLACEHOLDER: 10 chips
  ('propose_market_idea', 2500, 3, 20,   'Proposed a market idea')  -- PLACEHOLDER: 25 chips
ON CONFLICT (action) DO NOTHING;

-- ------------------------------------------------------------
-- RLS + table privileges
-- ------------------------------------------------------------
ALTER TABLE public.wallets             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_ledger       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.earn_rules          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_settings     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contests            ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.wallets, public.wallet_ledger, public.earn_rules, public.wallet_settings,
  public.contests FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.wallets, public.wallet_ledger, public.earn_rules, public.wallet_settings,
  public.contests TO authenticated;

-- ------------------------------------------------------------
-- Caller identity
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_player_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_sub text := auth.jwt() ->> 'sub';
  v_id uuid;
BEGIN
  IF v_sub IS NULL
     OR v_sub !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RETURN NULL;
  END IF;
  SELECT u.id INTO v_id FROM public.users u WHERE u.id = v_sub::uuid;
  RETURN v_id;
END;
$$;

-- True for the service role, direct DB sessions (e.g. the SQL editor), and
-- signed-in players with users.isadmin.
CREATE OR REPLACE FUNCTION public.wallet_caller_is_admin()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role text := coalesce(auth.jwt() ->> 'role', '');
BEGIN
  IF v_role = 'service_role' OR auth.jwt() IS NULL THEN
    RETURN true;
  END IF;
  IF v_role <> 'authenticated' THEN
    RETURN false;
  END IF;
  RETURN EXISTS (SELECT 1 FROM public.users u WHERE u.id = public.current_player_id() AND u.isadmin);
END;
$$;

DROP POLICY IF EXISTS wallets_select_own ON public.wallets;
DROP POLICY IF EXISTS wallet_ledger_select_own ON public.wallet_ledger;
DROP POLICY IF EXISTS earn_rules_select_all ON public.earn_rules;
DROP POLICY IF EXISTS wallet_settings_select_all ON public.wallet_settings;
DROP POLICY IF EXISTS contests_select_all ON public.contests;
CREATE POLICY wallets_select_own ON public.wallets
  FOR SELECT TO authenticated USING (player_id = (SELECT public.current_player_id()));
CREATE POLICY wallet_ledger_select_own ON public.wallet_ledger
  FOR SELECT TO authenticated USING (player_id = (SELECT public.current_player_id()));
CREATE POLICY earn_rules_select_all ON public.earn_rules
  FOR SELECT TO authenticated USING (true);
CREATE POLICY wallet_settings_select_all ON public.wallet_settings
  FOR SELECT TO authenticated USING (true);
CREATE POLICY contests_select_all ON public.contests
  FOR SELECT TO authenticated USING (true);

-- ------------------------------------------------------------
-- wallet_apply: the only code path that writes balances (internal)
-- Returns the new balance. Replaying an idempotency key returns the
-- stored balance_after and changes nothing. Raises SQLSTATE WL001
-- ('insufficient_funds') if the balance would go below 0.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.wallet_apply(
  p_player   uuid,
  p_amount   bigint,
  p_kind     text,
  p_idem     text,
  p_ref_type text DEFAULT NULL,
  p_ref_id   uuid DEFAULT NULL,
  p_memo     text DEFAULT NULL
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_existing bigint;
  v_balance  bigint;
  v_new      bigint;
BEGIN
  IF p_player IS NULL THEN
    RAISE EXCEPTION 'player_required' USING ERRCODE = '22023';
  END IF;
  IF p_idem IS NULL OR length(btrim(p_idem)) = 0 THEN
    RAISE EXCEPTION 'idempotency_key_required' USING ERRCODE = '22023';
  END IF;
  IF p_amount IS NULL OR p_amount = 0 THEN
    RAISE EXCEPTION 'amount_must_be_nonzero' USING ERRCODE = '22023';
  END IF;

  -- 1. Replay
  SELECT l.balance_after INTO v_existing FROM public.wallet_ledger l WHERE l.idempotency_key = p_idem;
  IF FOUND THEN
    RETURN v_existing;
  END IF;

  -- 2. Lazily create the wallet
  INSERT INTO public.wallets (player_id) VALUES (p_player) ON CONFLICT (player_id) DO NOTHING;

  -- 3. Serialize writes per player
  SELECT w.balance INTO v_balance FROM public.wallets w WHERE w.player_id = p_player FOR UPDATE;

  -- A same-key call may have committed while we waited for the lock
  SELECT l.balance_after INTO v_existing FROM public.wallet_ledger l WHERE l.idempotency_key = p_idem;
  IF FOUND THEN
    RETURN v_existing;
  END IF;

  -- 4. Overdraft check
  v_new := v_balance + p_amount;
  IF v_new < 0 THEN
    RAISE EXCEPTION 'insufficient_funds'
      USING ERRCODE = 'WL001',
            DETAIL = format('balance %s, amount %s', v_balance, p_amount);
  END IF;

  -- 5. Ledger row, then cached balance
  BEGIN
    INSERT INTO public.wallet_ledger
      (player_id, amount, balance_after, kind, ref_type, ref_id, idempotency_key, memo)
    VALUES
      (p_player, p_amount, v_new, p_kind, p_ref_type, p_ref_id, p_idem, p_memo);
  EXCEPTION WHEN unique_violation THEN
    -- Concurrent duplicate key (e.g. same key on another player's wallet)
    SELECT l.balance_after INTO v_existing FROM public.wallet_ledger l WHERE l.idempotency_key = p_idem;
    RETURN v_existing;
  END;

  UPDATE public.wallets SET balance = v_new, updated_at = now() WHERE player_id = p_player;
  RETURN v_new;
END;
$$;

-- ------------------------------------------------------------
-- Reads
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_wallet_for(p_player uuid)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT coalesce((SELECT w.balance FROM public.wallets w WHERE w.player_id = p_player), 0)::bigint;
$$;

CREATE OR REPLACE FUNCTION public.get_wallet()
RETURNS bigint
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_player uuid := public.current_player_id();
BEGIN
  IF v_player IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  RETURN public.get_wallet_for(v_player);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_ledger_for(
  p_player    uuid,
  p_limit     int DEFAULT 50,
  p_before_id bigint DEFAULT NULL
)
RETURNS TABLE (
  id            bigint,
  amount        bigint,
  balance_after bigint,
  kind          text,
  ref_type      text,
  ref_id        uuid,
  memo          text,
  created_at    timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT l.id, l.amount, l.balance_after, l.kind, l.ref_type, l.ref_id, l.memo, l.created_at
  FROM public.wallet_ledger l
  WHERE l.player_id = p_player
    AND (p_before_id IS NULL OR l.id < p_before_id)
  ORDER BY l.id DESC
  LIMIT least(greatest(coalesce(p_limit, 50), 1), 200);
$$;

CREATE OR REPLACE FUNCTION public.get_ledger(p_limit int DEFAULT 50, p_before_id bigint DEFAULT NULL)
RETURNS TABLE (
  id            bigint,
  amount        bigint,
  balance_after bigint,
  kind          text,
  ref_type      text,
  ref_id        uuid,
  memo          text,
  created_at    timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_player uuid := public.current_player_id();
BEGIN
  IF v_player IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;
  RETURN QUERY SELECT * FROM public.get_ledger_for(v_player, p_limit, p_before_id);
END;
$$;

-- ------------------------------------------------------------
-- Earning
-- Returns jsonb { status, action, amount, balance }.
-- status: earned | already_earned | daily_cap | lifetime_cap | global_cap
--         | inactive | unknown_action
-- Caps never raise; amount is 0 unless status = 'earned'.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.earn_chips_for(
  p_player uuid,
  p_action text,
  p_ref_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  r              public.earn_rules%ROWTYPE;
  v_max          bigint;
  v_tz           text;
  v_day          date;
  v_day_start    timestamptz;
  v_day_end      timestamptz;
  v_action_today int;
  v_action_ever  int;
  v_earned_today bigint;
  v_key          text;
  v_balance      bigint;
BEGIN
  IF p_player IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO r FROM public.earn_rules WHERE action = p_action;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'unknown_action', 'action', p_action, 'amount', 0,
                              'balance', public.get_wallet_for(p_player));
  END IF;
  IF NOT r.active THEN
    RETURN jsonb_build_object('status', 'inactive', 'action', p_action, 'amount', 0,
                              'balance', public.get_wallet_for(p_player));
  END IF;

  SELECT s.max_earn_per_player_per_day, s.day_boundary_tz INTO v_max, v_tz
  FROM public.wallet_settings s WHERE s.id;
  v_tz := coalesce(v_tz, 'UTC');
  v_day := (now() AT TIME ZONE v_tz)::date;
  v_day_start := v_day::timestamp AT TIME ZONE v_tz;
  v_day_end := (v_day + 1)::timestamp AT TIME ZONE v_tz;

  -- Lock the wallet so counting + key numbering are serialized per player
  INSERT INTO public.wallets (player_id) VALUES (p_player) ON CONFLICT (player_id) DO NOTHING;
  SELECT w.balance INTO v_balance FROM public.wallets w WHERE w.player_id = p_player FOR UPDATE;

  IF p_ref_id IS NOT NULL THEN
    v_key := format('earn:%s:%s:ref:%s', p_action, p_player, p_ref_id);
    IF EXISTS (SELECT 1 FROM public.wallet_ledger l WHERE l.idempotency_key = v_key) THEN
      RETURN jsonb_build_object('status', 'already_earned', 'action', p_action, 'amount', 0,
                                'balance', v_balance);
    END IF;
  END IF;

  SELECT
    count(*) FILTER (WHERE l.ref_type = p_action AND l.created_at >= v_day_start AND l.created_at < v_day_end),
    count(*) FILTER (WHERE l.ref_type = p_action),
    coalesce(sum(l.amount) FILTER (WHERE l.created_at >= v_day_start AND l.created_at < v_day_end), 0)
  INTO v_action_today, v_action_ever, v_earned_today
  FROM public.wallet_ledger l
  WHERE l.player_id = p_player AND l.kind = 'earn';

  IF r.daily_cap IS NOT NULL AND v_action_today >= r.daily_cap THEN
    RETURN jsonb_build_object('status', 'daily_cap', 'action', p_action, 'amount', 0, 'balance', v_balance);
  END IF;
  IF r.lifetime_cap IS NOT NULL AND v_action_ever >= r.lifetime_cap THEN
    RETURN jsonb_build_object('status', 'lifetime_cap', 'action', p_action, 'amount', 0, 'balance', v_balance);
  END IF;
  IF v_max IS NOT NULL AND v_earned_today + r.amount > v_max THEN
    RETURN jsonb_build_object('status', 'global_cap', 'action', p_action, 'amount', 0, 'balance', v_balance);
  END IF;

  IF v_key IS NULL THEN
    v_key := format('earn:%s:%s:%s:%s', p_action, p_player, v_day, v_action_today + 1);
    -- Only possible if day_boundary_tz changed mid-day
    IF EXISTS (SELECT 1 FROM public.wallet_ledger l WHERE l.idempotency_key = v_key) THEN
      RETURN jsonb_build_object('status', 'already_earned', 'action', p_action, 'amount', 0,
                                'balance', v_balance);
    END IF;
  END IF;

  v_balance := public.wallet_apply(p_player, r.amount, 'earn', v_key, p_action, p_ref_id,
                                   coalesce(r.description, p_action));
  RETURN jsonb_build_object('status', 'earned', 'action', p_action, 'amount', r.amount,
                            'balance', v_balance);
END;
$$;

CREATE OR REPLACE FUNCTION public.earn_chips(p_action text, p_ref_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN public.earn_chips_for(public.current_player_id(), p_action, p_ref_id);
END;
$$;

-- ------------------------------------------------------------
-- Admin
-- ------------------------------------------------------------
-- Always writes a kind='adjustment' ledger row. Pass p_idem to make
-- retries safe; otherwise every call is a new adjustment. p_actor (the
-- admin's users.id) is only used for service-role calls; signed-in
-- admins are recorded as themselves.
CREATE OR REPLACE FUNCTION public.admin_adjust(
  p_player uuid,
  p_amount bigint,
  p_memo   text,
  p_idem   text DEFAULT NULL,
  p_actor  uuid DEFAULT NULL
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := public.current_player_id();
BEGIN
  IF NOT public.wallet_caller_is_admin() THEN
    RAISE EXCEPTION 'admin_only' USING ERRCODE = '42501';
  END IF;
  IF p_memo IS NULL OR length(btrim(p_memo)) = 0 THEN
    RAISE EXCEPTION 'memo_required' USING ERRCODE = '22023';
  END IF;
  IF v_actor IS NULL THEN
    v_actor := p_actor;
  END IF;
  RETURN public.wallet_apply(p_player, p_amount, 'adjustment',
                             coalesce(p_idem, 'adjust:' || gen_random_uuid()),
                             'admin', v_actor, p_memo);
END;
$$;

-- Starting chips. Idempotent per player (key grant:{player}).
-- p_player = null grants every user; pass one id to grant a new signup.
-- Returns how many players received a new grant.
-- NOT RUN OR SCHEDULED YET: wallets start at 0 until the market launches.
CREATE OR REPLACE FUNCTION public.grant_starting_chips(p_amount bigint, p_player uuid DEFAULT NULL)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user  record;
  v_count int := 0;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'amount_must_be_positive' USING ERRCODE = '22023';
  END IF;
  FOR v_user IN
    SELECT u.id FROM public.users u
    WHERE (p_player IS NULL OR u.id = p_player)
      AND NOT EXISTS (SELECT 1 FROM public.wallet_ledger l WHERE l.idempotency_key = 'grant:' || u.id)
  LOOP
    PERFORM public.wallet_apply(v_user.id, p_amount, 'grant', 'grant:' || v_user.id,
                                NULL, NULL, 'Starting chips');
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

-- ------------------------------------------------------------
-- Net worth + contests (measuring layer only)
-- ------------------------------------------------------------
-- MARKET HOOK: value of a player's open positions at p_at, in units.
-- Returns 0 until the prediction market exists; replace the body then.
-- If past position values can't be recomputed then, contests will need
-- net-worth snapshots at starts_at/ends_at (removed for now; cash alone is exact).
CREATE OR REPLACE FUNCTION public.compute_positions_value(p_player uuid, p_at timestamptz DEFAULT now())
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT 0::bigint;
$$;

-- Cash at any past moment, read from the ledger (exact, not the cached balance)
CREATE OR REPLACE FUNCTION public.wallet_cash_at(p_player uuid, p_at timestamptz)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT coalesce((
    SELECT l.balance_after FROM public.wallet_ledger l
    WHERE l.player_id = p_player AND l.created_at <= p_at
    ORDER BY l.id DESC
    LIMIT 1
  ), 0)::bigint;
$$;

-- Net worth = cash (from the ledger) + compute_positions_value().
-- Score = end net worth - start net worth (absolute gain; earned chips count).
-- start = net worth at starts_at (0 if the player had no ledger rows yet).
-- end   = live net worth while the contest is running, else net worth at ends_at.
-- Players = every wallet holder. Empty before the contest starts.
CREATE OR REPLACE FUNCTION public.contest_leaderboard(p_contest_id uuid)
RETURNS TABLE (
  player_id       uuid,
  username        text,
  display_name    text,
  start_net_worth bigint,
  end_net_worth   bigint,
  gain            bigint,
  rank            bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH c AS (
    SELECT * FROM public.contests WHERE id = p_contest_id AND starts_at <= now()
  ),
  scores AS (
    SELECT
      w.player_id,
      u.username::text AS username,
      u.display_name::text AS display_name,
      public.wallet_cash_at(w.player_id, c.starts_at)
        + public.compute_positions_value(w.player_id, c.starts_at) AS start_nw,
      CASE
        WHEN now() < c.ends_at
          THEN w.balance + public.compute_positions_value(w.player_id, now())
        ELSE public.wallet_cash_at(w.player_id, c.ends_at)
          + public.compute_positions_value(w.player_id, c.ends_at)
      END AS end_nw
    FROM c
    CROSS JOIN public.wallets w
    JOIN public.users u ON u.id = w.player_id
  )
  SELECT player_id, username, display_name, start_nw, end_nw, end_nw - start_nw,
         rank() OVER (ORDER BY end_nw - start_nw DESC)
  FROM scores
  ORDER BY 7, username;
$$;

-- ------------------------------------------------------------
-- Function privileges (Supabase grants EXECUTE to anon/authenticated by default)
-- ------------------------------------------------------------
REVOKE ALL ON FUNCTION
  public.users_guard_isadmin(),
  public.current_player_id(),
  public.wallet_caller_is_admin(),
  public.wallet_apply(uuid, bigint, text, text, text, uuid, text),
  public.get_wallet_for(uuid),
  public.get_wallet(),
  public.get_ledger_for(uuid, int, bigint),
  public.get_ledger(int, bigint),
  public.earn_chips_for(uuid, text, uuid),
  public.earn_chips(text, uuid),
  public.admin_adjust(uuid, bigint, text, text, uuid),
  public.grant_starting_chips(bigint, uuid),
  public.compute_positions_value(uuid, timestamptz),
  public.wallet_cash_at(uuid, timestamptz),
  public.contest_leaderboard(uuid)
FROM PUBLIC, anon, authenticated, service_role;

-- Player RPCs (JWT callers)
GRANT EXECUTE ON FUNCTION
  public.current_player_id(),
  public.get_wallet(),
  public.get_ledger(int, bigint),
  public.earn_chips(text, uuid),
  public.admin_adjust(uuid, bigint, text, text, uuid),
  public.contest_leaderboard(uuid)
TO authenticated;

-- Server-side (EJS app with the service role)
GRANT EXECUTE ON FUNCTION
  public.get_wallet_for(uuid),
  public.get_ledger_for(uuid, int, bigint),
  public.earn_chips_for(uuid, text, uuid),
  public.admin_adjust(uuid, bigint, text, text, uuid),
  public.grant_starting_chips(bigint, uuid),
  public.contest_leaderboard(uuid)
TO service_role;
-- wallet_apply, wallet_cash_at, compute_positions_value and
-- wallet_caller_is_admin stay internal (owner only).

COMMIT;
