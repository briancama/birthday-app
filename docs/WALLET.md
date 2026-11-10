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

The embedded wallet now opens from a fixed bottom-right teal piggy-bank portal,
not the navigation button. Tucking it away leaves a Wallet edge tab.
`bric-wallet-tucked` in localStorage remembers this browser's preference.
It respects safe areas. The panel height uses `svh` so it doesn't resize
when mobile browser toolbars show or hide. The organic portal is a
documented Bric shape exception.

The portal is icon-only, with a smaller piggy bank, a slow CSS shape morph
and a subtle teal glow. Drag right at least 44px to tuck it away; the
piggy-bank edge tab restores it. A tuck control appears on keyboard focus.
Reduced motion disables morphing. Glow and ambient movement are explicit
embedded-portal exceptions, not styles for other Bric controls.
The piggy bank lives at the lower-right of the wallet's bottom decoration.
Six differently sized/rotated copies of the supplied illustrated coin sit beside
it; no new artwork is fabricated. Reward motion still clips at the bank's slot.

### Site earning rules

Apply `sql/2026_11_05_wallet_site_rewards.sql` after the original wallet migration
and `sql/profile_wall.sql`, before deploying the reward integrations. Do not
re-run the original wallet migration afterward: the new migration wraps its
cap/idempotency implementation with wall-reference validation. This migration
does not grant starting balances or change historical ledger entries.

Amounts use 100 units per bric:

- Daily check-in: 20 brics, once daily.
- Site award image or "Vote for Me!" label click: 5 brics per award image type
  once daily, at most three distinct types daily. Image and label share a type;
  repeat clicks still play vote audio but earn nothing. The existing
  unique-award achievement is unchanged. `POST /api/wallet/vote` accepts
  `voteType` (the catalog image path), not a client-selected action or amount.
  `earn_site_vote_for` validates the catalog type and derives a stable
  type/day reference using the configured timezone. The wallet lock prevents
  simultaneous repeats from earning twice; generic earn RPCs reject site votes.
  Re-run this updated migration if its earlier click-ID version was applied.
- Posting on another user's profile wall: 25 brics, once daily. Own-wall and
  event-wall posts do not qualify. An AFTER INSERT trigger awards in the same
  database transaction; a failed reward rolls back the post rather than
  leaving an uncredited qualifying post.
- Global cap: 60 brics daily, using `wallet_settings.day_boundary_tz`.

No ad-click rewards. The unused market-idea placeholder rule is disabled.

#### Editing vote transaction copy

Apply `sql/2026_11_05_wallet_vote_copy.sql` after the site-rewards migration.
In Supabase Table Editor, open `site_vote_types` and edit `transaction_memo`
on the row matching the award's image path (`vote_type`). Each of the 18
built-in vote images has its own starter description. Copy must be nonblank,
at most 160 characters, and renders as plain text in wallet history.
Only future credited votes use the new copy; capped votes and replays never
rewrite past transactions. Re-running the copy migration preserves your edits.
If you re-run the site-rewards migration, re-run the copy migration afterward
to restore the description-aware RPC. Actual ad clicks still earn nothing.

Vote totals live in `site_votes`: one row per catalog type/person/configured day,
including votes after the earning cap. `record_site_vote_for` counts and rewards
atomically; the unique key deduplicates simultaneous repeats. No totals are
displayed. Use `SELECT count(*) FROM public.site_votes` for the total, or group
by `vote_type` / `vote_day`. RLS exposes neither identities nor totals to clients.

Signed-in votes use the account UUID. Guests use a signed, httpOnly, year-long
`site_vote_visitor` cookie established on page load and earn no brics. Cookies
are browser identities, not verified people: clearing cookies or switching
browsers can count separately. Anonymous and signed-in identities intentionally
remain separate, so signing in after voting may count again. No IP addresses or
fingerprinting are stored. Historical untracked votes cannot be reconstructed.
Re-run the updated site-rewards migration to install tracking before deploying
this code; no database changes are applied by editing the file.

Existing Postgres wallet locks serialize concurrent rewards and enforce caps.
Credited vote/wall responses emit `wallet:earned` on window; the shared
wallet listens with its cleanup signal and refreshes balance/history and plays
the coin animation only for confirmed credits. Wall responses include
`walletReward` only if that specific entry earned a ledger row.

Coin drops use three predecoded `audio/coin_drop_*.wav` variations, randomly
chosen without consecutive repeats. Sound requests are throttled to one per
500 ms without suppressing credited balance updates or coin animations.
Playback starts with the animation, preserves mute/reduced-motion and the
shared audio engine's late-play protection, and never interrupts vote audio.

### Achievement conversion

Apply `sql/2026_11_05_wallet_achievement_credits.sql` after the original wallet,
achievement catalog, and `is_visitor_eligible` migrations, before deploying the
wallet-open integration. It is rerunnable and grants nothing at migration time.

The first explicit wallet open calls `POST /api/wallet/activate` (service RPC
`activate_wallet_for(p_player)`). Future authenticated clients can call
`activate_wallet()` using their own JWT. Passive page loads, wallet balance
reads, and navigation hydration never activate conversion.

Each earned achievement with `is_visitor_eligible = true` and positive points
credits **50 brics per point = 5,000 integer units**. Existing awards are
backfilled on open; after activation an AFTER INSERT trigger on
`user_achievements` credits later awards in the award transaction. A failure
rolls back the award rather than silently losing its credit.
`show_on_profile` does not affect eligibility: BriSpace rank eligibility is the
only filter. Original achievement points, awards, and leaderboard rank stay
unchanged.

Credits use `kind = 'grant'`, `ref_type = 'achievement'`, and the catalog UUID
as `ref_id`. They do not consume or obey daily earning caps. The idempotency key
is `achievement:<player UUID>:<catalog UUID>`; repeated opens, simultaneous
opens, and deleting/re-awarding an achievement cannot pay twice.
`wallet_achievement_activation` records activation; its rows are not exposed to
browser roles. Activation and award triggers share a per-player advisory
transaction lock before wallet writes, preventing first-open/award races.

The wallet shows the confirmed first-open credit and plays one coin effect,
then refreshes history. Local `achievement:awarded` events refresh the wallet;
awards made elsewhere appear on the next wallet opening. Every opening also
reconciles eligible uncredited awards. Catalog point changes do not retroactively
adjust already-credited awards, and credits are not revoked if an award is deleted.

The portal is a nearly circular teal rim with restrained morphing and glow.
Inside is the actual light Bric wallet surface, cropped around its lower-right
piggy bank. Clicking expands this same
portal into a native modal showing balance, check-in and paginated history;
there is no separate pretend scene or Windows-style wallet dialog. Close,
Escape or a backdrop click collapses it and restores trigger focus.
Clicking the tucked edge tab slides the circle back out before opening the
wallet; dragging the tab left at least 44px restores only the closed circle.
Short or cancelled drags leave the tab tucked. Reduced motion skips the slide.
Clipped controls are inert and hidden from assistive technology. Expansion takes 320ms;
reduced motion makes it immediate. This embedded light treatment does not
change BriSpace or decide the future full site's theme.
The expanded teal boundary stays circular, with black filling the space around
the separate white double-ruled wallet box. The collapsed portal is 112px.
On open, its circle grows from the resting piggy-bank circle's measured center,
only far enough to cover the wallet's farthest corner. The box stays fixed in
viewport position and size during opening and closing. The teal rim, black
interior and wallet's circular clip animate together in both directions, with
no stagger that could cover the glow or snap the wallet shut. Closing retains
the modal layout until the shrink completes, then restores the resting crop.
On small screens the circle can extend beyond the viewport, while the wallet
controls remain fitted to the screen.
An inert prediction-market screenshot (`images/BRIC/fake_prediction_screenshot.png`)
sits immediately to the wallet's left, at native pixel size with its original
aspect ratio and aligned to the wallet's bottom edge.
It can extend offscreen without shifting the wallet or enlarging
the portal. Only portions inside both the viewport and the animated circle are
visible. `--wallet-market-preview-gap` controls the gap. It is decorative preview
art, not an interactive market; its clip opens/closes with the wallet.
The header shows the supplied white `images/BRIC/bric_logo.svg` in a black
square before "Wallet". The bottom illustration has no top divider.
The balance readout uses the supplied black
`images/BRIC/bric_symbol_sm.svg` instead of spelling out brics (accessible
alternative: "brics"). The summary shows the latest ledger delta and the exact
total transaction count returned by the player-filtered API (not the loaded
page count). Recent activity reserves four rows and scrolls independently;
"Load more" lives inside that scroll region. Fewer actual transactions show
an empty area rather than invented entries.
A bottom fade and "More activity below" arrow appear only while loaded content
remains below the current scroll position. Scrolling, loading and size changes
refresh the cue; it disappears at the bottom or when all content fits.
Overflowing transaction titles gently scroll back and forth with pauses at
each end; fitting titles remain still. Hover pauses the title. CSS container
units calculate travel from the available title width, with no JavaScript
measurement. Reduced motion and browsers without container sizing use static
ellipsis.
Balance and Recent Activity each use a black double-ruled box on
white, with a white-backed heading notch. The balance summary has a dashed
divider. Bottom coins use deliberately uneven spacing, heights and rotations.
Daily check-in is a large centered white button with black double rules, not a
labeled section. Its text shows progress, completion ("Checked in today"),
caps/pauses or retry errors; no check-in status paragraph is shown. Completed
check-ins disable the button. `GET /api/wallet` includes `checkedInToday`,
read from the player's latest `earn` / `daily_checkin` ledger entry and compared
using `wallet_settings.day_boundary_tz`, independently of history pagination.
The component fetches on initialization and every wallet opening, so reloads
and returning after a day boundary restore the correct button state without
awarding anything or replaying animation. Loading/state errors keep check-in
disabled until a successful refresh; Postgres still enforces earning limits.
Newly confirmed credits still
play the coin drop and sound; capped/replayed responses do not. Wallet-loading
errors remain separate from check-in feedback.

The wallet includes a provisional illustrated reward preview: one coin drops
into a stationary piggy bank with black trails on white after a confirmed
check-in credit. Reduced motion skips the effect. On localhost with `?walletPreview=1` only,
"Preview coin drop" replays it without any request or balance change.
The supplied dark-background SVGs render directly, preserving their
black-and-white fills; the source files remain unchanged.
`--wallet-drop-duration` in `wallet.css` controls the drop (650ms initially).
Resize the pig and its entire drop effect with `--wallet-bank-height` on
`.wallet-reward` (68px by default). Pig dimensions, coin/trails, slot alignment
and drop travel share that scale; do not resize the bank element independently.

Signed-in users see the wallet portal on every shared-navigation page
(`templates/partials/wallet-nav-button.ejs`, included by both nav partials).
It opens `js/components/wallet-panel.js` (balance, recent activity with
"Load more", daily check-in). Styles: `css/components/wallet.css`. The button
is hidden if the balance can't be read (for example, before the SQL is applied).

## Testing

`node --test tests/dev/wallet-api.test.js` checks player-filtered transaction
counts, pagination, empty wallets and explicit count errors without database writes.
`node --test tests/dev/wallet-audio.test.js tests/dev/wallet-api.test.js` also
checks activation identity/errors, confirmed credit feedback, replay behavior,
queued refreshes, coin variation/throttling and audio preferences.

`tests/dev/wallet-achievements.sql` checks first-open backfill, new-award
triggering, duplicate/re-award protection, cap independence, unchanged points,
ledger totals, empty wallets and RPC permissions. Run in the **dev** SQL editor
after the conversion migration; fixtures and temporary settings roll back.

`npm run verify:wallet` (`tests/dev/verify-wallet.js`) runs against the **dev**
project only. It creates throwaway `wtest_*` users and deletes them afterwards.
It covers idempotent and concurrent replay, insufficient funds, 20 parallel
debits on one wallet, per-action, lifetime, global, and ref caps, RLS with
minted JWTs, and leaderboard gain/rank/0-baseline math.
With the conversion migration installed it also checks concurrent wallet opens
racing an award, automatic later credits, re-award protection and JWT activation.
Needs `SUPABASE_JWT_SECRET` in `.env`.
