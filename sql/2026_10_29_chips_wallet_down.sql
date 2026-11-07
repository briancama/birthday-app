-- ============================================================
-- Chips wallet: DEV ROLLBACK ONLY
--
-- Drops every wallet object and ALL ledger history. Never run on prod.
-- Leaves users.isadmin (pre-existing column) and its backfill in place.
-- Date: 2026-10-29
-- ============================================================

BEGIN;

DROP TRIGGER IF EXISTS wallet_credit_new_achievement ON public.user_achievements;
DROP FUNCTION IF EXISTS public.wallet_credit_new_achievement();
DROP FUNCTION IF EXISTS public.activate_wallet();
DROP FUNCTION IF EXISTS public.activate_wallet_for(uuid);
DROP FUNCTION IF EXISTS public.wallet_sync_achievements_internal(uuid, boolean);
DROP TABLE IF EXISTS public.wallet_achievement_activation;

DROP TRIGGER IF EXISTS wallet_reward_wall_post ON public.profile_wall;
DROP FUNCTION IF EXISTS public.wallet_reward_wall_post();
DROP FUNCTION IF EXISTS public.record_site_vote_for(text, uuid, uuid);
DROP FUNCTION IF EXISTS public.earn_site_vote_for(uuid, text);
DROP TABLE IF EXISTS public.site_votes;
DROP TABLE IF EXISTS public.site_vote_types;
DROP FUNCTION IF EXISTS public.wallet_earn_internal(uuid, text, uuid);

DROP FUNCTION IF EXISTS public.contest_leaderboard(uuid);
DROP FUNCTION IF EXISTS public.wallet_cash_at(uuid, timestamptz);
DROP FUNCTION IF EXISTS public.compute_positions_value(uuid, timestamptz);
DROP FUNCTION IF EXISTS public.grant_starting_chips(bigint, uuid);
DROP FUNCTION IF EXISTS public.admin_adjust(uuid, bigint, text, text, uuid);
DROP FUNCTION IF EXISTS public.earn_chips(text, uuid);
DROP FUNCTION IF EXISTS public.earn_chips_for(uuid, text, uuid);
DROP FUNCTION IF EXISTS public.get_ledger(int, bigint);
DROP FUNCTION IF EXISTS public.get_ledger_for(uuid, int, bigint);
DROP FUNCTION IF EXISTS public.get_wallet();
DROP FUNCTION IF EXISTS public.get_wallet_for(uuid);
DROP FUNCTION IF EXISTS public.wallet_apply(uuid, bigint, text, text, text, uuid, text);

DROP TABLE IF EXISTS public.contests;
DROP TABLE IF EXISTS public.wallet_settings;
DROP TABLE IF EXISTS public.earn_rules;
DROP TABLE IF EXISTS public.wallet_ledger;
DROP TABLE IF EXISTS public.wallets;

DROP FUNCTION IF EXISTS public.wallet_caller_is_admin();
DROP FUNCTION IF EXISTS public.current_player_id();

DROP TRIGGER IF EXISTS users_guard_isadmin ON public.users;
DROP FUNCTION IF EXISTS public.users_guard_isadmin();

COMMIT;
