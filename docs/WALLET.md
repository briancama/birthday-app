# Chips Wallet

A play-money wallet that every client shares: the EJS site today, and the
prediction market (different frontend) later. **All money logic lives in
Postgres functions.** Clients only call them. No real money.

SQL: [`sql/2026_10_29_chips_wallet.sql`](../sql/2026_10_29_chips_wallet.sql),
dev-only rollback [`sql/2026_10_29_chips_wallet_down.sql`](../sql/2026_10_29_chips_wallet_down.sql).

## Chip scale

**1 chip = 100 units.** Every amount, balance, and RPC argument/result is a
`bigint` count of **units**. Show chips as `units / 100`. Never use floats.

## Rules

1. `wallet_ledger` is the source of truth. `wallets.balance` is a cached total
   updated in the same transaction as each ledger insert.
2. Clients never write balances. RLS lets a player `SELECT` only their own
   wallet and ledger rows. There are no insert/update/delete
   policies. Every write goes through a `security definer` function.
3. Every ledger write has a unique idempotency key. Replaying a key returns the
   original `balance_after` and does nothing else, including when two calls race.
4. Balances can never go below 0 (`insufficient_funds`, SQLSTATE `WL001`).
5. Wallets belong to `users.id` (our uuid), never the Firebase uid. One
   persistent wallet per player, created on the first ledger write.

## Who is calling

| Caller                              | How it's identified                                                                                                                                      | Uses                                                    |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Browser / SPA (future market)       | Supabase JWT minted by Express: `GET /auth/supabase-token` (cookie-gated) → `{ access_token, expires_at }`, `sub = users.id`, `role = authenticated`, 1h | Player RPCs below, with `Authorization: Bearer <token>` |
| EJS server (`routes/api-wallet.js`) | Service role + the signed `user_id` cookie                                                                                                               | `*_for(p_player)` variants                              |
| SQL editor                          | Direct DB session (no JWT)                                                                                                                               | Admin functions                                         |

`current_player_id()` maps the JWT `sub` to `users.id` (null if missing or unknown).
Token signing needs `SUPABASE_JWT_SECRET` (the project's legacy HS256 JWT secret).

## Player RPCs (`authenticated`)

| RPC                                                       | Returns                                                                              | Notes                                                                 |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| `get_wallet()`                                            | `bigint` balance (0 if no wallet yet)                                                | Raises `not_authenticated` (28000) without a valid JWT                |
| `get_ledger(p_limit int = 50, p_before_id bigint = null)` | rows `id, amount, balance_after, kind, ref_type, ref_id, memo, created_at`           | Newest first. Limit 1–200. Next page: `p_before_id` = last row's `id` |
| `earn_chips(p_action text, p_ref_id uuid = null)`         | `jsonb { status, action, amount, balance }`                                          | Caps never raise. `amount` is 0 unless `status = 'earned'`            |
| `contest_leaderboard(p_contest_id uuid)`                  | rows `player_id, username, display_name, start_net_worth, end_net_worth, gain, rank` | See Contests                                                          |
| `current_player_id()`                                     | `uuid`                                                                               |                                                                       |

`earn_chips` statuses: `earned`, `already_earned` (that `p_ref_id` already paid),
`daily_cap` (per-action), `lifetime_cap` (per-action), `global_cap`
(`wallet_settings.max_earn_per_player_per_day`), `inactive`, `unknown_action`.

Earn rules (`earn_rules`): `amount` in units; `daily_cap` / `lifetime_cap` count
earn **events** for that action; the global cap is in **units** across all
earns. "Today" is the calendar day in `wallet_settings.day_boundary_tz`. The
wallet row is locked while counting, so concurrent earns can't slip past a cap.
The seeded rules (`daily_checkin`, `propose_market_idea`) and the 50-chip daily
max are **placeholders**.

## Server-only RPCs (`service_role`)

| RPC                                               | Notes                               |
| ------------------------------------------------- | ----------------------------------- |
| `get_wallet_for(p_player)`                        | Same as `get_wallet` for any player |
| `get_ledger_for(p_player, p_limit, p_before_id)`  | Same as `get_ledger`                |
| `earn_chips_for(p_player, p_action, p_ref_id)`    | Same as `earn_chips`                |
| `grant_starting_chips(p_amount, p_player = null)` | See Admin                           |

## Admin

Admin = service role, a direct DB session, or a JWT caller whose `users.isadmin`
is true. A trigger stops anon/authenticated sessions from changing `isadmin`.
Express admin routes are still gated with `isAdminUser()`.

| RPC                                                                       | Returns               | Notes                                                                                                                         |
| ------------------------------------------------------------------------- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `admin_adjust(p_player, p_amount, p_memo, p_idem = null, p_actor = null)` | new balance           | Always a `kind='adjustment'` ledger row (`ref_type='admin'`, `ref_id` = admin). Memo required. Pass `p_idem` for safe retries |
| `grant_starting_chips(p_amount, p_player = null)`                         | players newly granted | Key `grant:{player}`, so once per player ever. Null = every user. **Not run or scheduled yet**                                |

Express: `POST /api/wallet/adjust { userId, amount (units), memo, idempotencyKey? }` (admins).

## Ledger `kind` values

Enforced by a CHECK constraint; adding one is a deliberate migration.

| kind         | Sign | Used for                                   |
| ------------ | ---- | ------------------------------------------ |
| `grant`      | +    | Starting chips                             |
| `stipend`    | +    | Recurring allowance (not built yet)        |
| `earn`       | +    | `earn_chips`; `ref_type` = the earn action |
| `trade_buy`  | −    | Market: buying shares                      |
| `trade_sell` | +    | Market: selling shares                     |
| `payout`     | +    | Market: resolved position payout           |
| `refund`     | +    | Market: cancelled market refund            |
| `adjustment` | ±    | `admin_adjust` only                        |

`ref_type` / `ref_id` are free for the market (e.g. `ref_type = 'trade'`, `ref_id` = trade id).

## Idempotency keys

| Writer                 | Key                                                                                         |
| ---------------------- | ------------------------------------------------------------------------------------------- |
| `earn_chips`           | `earn:{action}:{player}:{YYYY-MM-DD}:{n}` (n = that day's count + 1)                        |
| `earn_chips` with ref  | `earn:{action}:{player}:ref:{ref_id}` (the same ref never pays twice)                       |
| `grant_starting_chips` | `grant:{player}`                                                                            |
| `admin_adjust`         | `p_idem` if given (Express sends `adjust:{idempotencyKey}`), else `adjust:{random uuid}`    |
| Market (future)        | Suggested: `trade:{trade_id}`, `payout:{market_id}:{player}`, `refund:{market_id}:{player}` |

Keys are global (unique across all players), so always include something unique to the operation.

## Contests

A contest (`contests`) is only a scoring window over the persistent economy.
Score = **absolute gain** = end net worth − start net worth. Earned chips count;
no ledger kinds are subtracted.

- Net worth = cash + `compute_positions_value()`. Cash at any moment is read
  straight from the ledger (`balance_after` of the last row at or before it).
- Start = net worth at `starts_at` (0 if the player had no ledger rows yet).
- End = live net worth while the contest is running, else net worth at `ends_at`.
- Players = every wallet holder. Empty before the contest starts.
- Nothing to schedule or snapshot: create a `contests` row and read
  `contest_leaderboard`.

**Market hook:** `compute_positions_value(p_player, p_at)` returns 0. When the
market exists, replace its body and the leaderboard picks it up. If past
position values can't be recomputed then, add net-worth snapshots at contest
start/end at that point.

## Site UI

Signed-in users see a chips button in the nav on every page
(`templates/partials/wallet-nav-button.ejs`, included by both nav partials).
It opens `js/components/wallet-panel.js` (balance, recent activity with
"Load more", daily check-in). Styles: `css/components/wallet.css`. The button
is hidden if the balance can't be read (for example, before the SQL is applied).

## Testing

`npm run verify:wallet` (`tests/dev/verify-wallet.js`) runs against the **dev**
project only. It creates throwaway `wtest_*` users and deletes them afterwards.
It covers idempotent and concurrent replay, insufficient funds, 20 parallel
debits on one wallet, per-action, lifetime, global, and ref caps, RLS with
minted JWTs, and leaderboard gain/rank/0-baseline math.
Needs `SUPABASE_JWT_SECRET` in `.env`.
