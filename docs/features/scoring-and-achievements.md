# Scoring, Leaderboards & Achievements

## What it is

Two ranking systems plus an achievement catalog that feeds points into both:

1. **Event leaderboard** (`scoreboard` view) — participants: assigned-challenge points + competition placements + achievement points.
2. **Brispace leaderboard** (`site_leaderboard` / `brispace_leaderboard` views) — all users (visitors included), ranked by **visitor-eligible** achievement points only.

## How it works

### Scoring

- Assigned challenge success = 5 points; competition placements carry custom points (`competition_placements`).
- Achievement points come from the `achievements` catalog and are summed per user.
- `achievements.is_visitor_eligible` controls whether an achievement counts toward Brispace rank. Participant-only achievements (`all_assigned_completed`, `first_challenge`, `three_challenges`, `the_challenger`) are excluded from Brispace ranking.

### Leaderboard UI

- `/leaderboard` (`js/pages/leaderboard.js`) — dual-tab (Event / Brispace), medals for top 3, manual refresh, auto-refresh on achievement events.
- `/scoreboard` — server-rendered variant with media slots.

### Achievements

- Catalog rows in `achievements` (key, points, `image_url`, `metadata`, `is_visitor_eligible`); awards in `user_achievements`.
- Awarding is **atomic and idempotent** via Postgres RPCs: `rpc_award_achievement_by_key`, `rpc_award_on_challenge_threshold`, `rpc_award_on_comment_threshold`, `rpc_award_when_all_assigned_completed`.
- Client side, `js/services/achievement-service.js` listens to EventBus events (challenge complete, submissions, GIF completion, social actions…) and calls the RPCs; server routes award directly for server-observed actions (e.g. wall posts).
- Displayed in Account Center (gallery) and on profiles.

### Achievement catalog (by category)

| Category    | Keys                                                                                                                            |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Challenges  | `first_challenge`, `three_challenges`, `all_assigned_completed`, `the_challenger`                                               |
| Submissions | `one_submission_created`, `three_submissions_created`                                                                           |
| Social      | `social_butterfly`, `wall_posts_1/3/5`, `top_8_complete`, `jukebox_hero` (favorite a song)                                      |
| Exploration | `site_popularity` (10 site-award clicks), `gif_master`, `secret_tracks` (3 hidden tracks), `ad_completionist` (all catalog ads) |
| Easter eggs | `h4x0r` (scam flow), `goblin_king`, `ytmnd`, `forgot_phone`                                                                     |

(Seed/definition SQL lives in `/sql/*achievement*.sql`; live catalog is authoritative.)

## Key files

| File                                                                                | Role                  |
| ----------------------------------------------------------------------------------- | --------------------- |
| `js/services/achievement-service.js`                                                | Event-driven awarding |
| `js/pages/leaderboard.js`, `templates/scoreboard.ejs`                               | Leaderboard UIs       |
| `js/pages/account.js`                                                               | Achievement gallery   |
| `sql/1_create_achievements_and_user_achievements.sql`, `sql/2_achievements_rpc.sql` | Original schema/RPCs  |
| `test-achievement-service.js`                                                       | Console test helpers  |

## Data

`achievements`, `user_achievements`, `competition_placements`; views `scoreboard`, `site_leaderboard`, `brispace_leaderboard` (`scoreboard_old` is legacy). See [../DATABASE.md](../DATABASE.md).
