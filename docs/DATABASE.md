# Database

Ground truth captured **2026-09-28** by introspecting the **dev** Supabase project's PostgREST OpenAPI endpoint (`GET {SUPABASE_URL}/rest/v1/` with the service-role key). Column lists below reflect the live database, not the `/sql` folder.

> **Known drift:** the `/sql` folder is an append-only history and is **incomplete** — some applied changes were never captured as files (e.g. `brispace_leaderboard`, the `notifications.payload` shape). Treat this doc as authoritative over `/sql`. Verify prod matches dev before relying on recent additions.

## Re-capturing the schema

```bash
# prints all tables/views/columns + RPCs from the live project in .env
node --input-type=module -e "
import fs from 'fs';
const env = Object.fromEntries(fs.readFileSync('.env','utf8').split('\n').filter(l=>l.includes('=')).map(l=>[l.slice(0,l.indexOf('=')), l.slice(l.indexOf('=')+1).trim()]));
const spec = await (await fetch(env.SUPABASE_URL+'/rest/v1/',{headers:{apikey:env.SUPABASE_SERVICE_ROLE,Authorization:'Bearer '+env.SUPABASE_SERVICE_ROLE}})).json();
console.log(JSON.stringify({tables:Object.keys(spec.definitions).sort(),rpcs:Object.keys(spec.paths).filter(p=>p.startsWith('/rpc/'))},null,2));"
```

## Tables by Domain

### Identity & Profiles

| Table                 | Key columns                                                                                                                                                                                                                                                                                               | Purpose                                                         |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `users`               | `id` PK, `username`, `display_name`, `firebase_uid`, `phone_number`, `isAdmin`, `headshot`, `user_type` (participant/visitor)                                                                                                                                                                             | Core identity; created/linked at `/auth/login`                  |
| `user_profile`        | `user_id` PK→users, `status`, `hometown`, `age`, `about_html`, `general_interest`, `fav_movie`, `fav_song`, `television`, `top_n` jsonb, `is_published`, `profile_gif_key`, `profile_bg_url`, `profile_bg_mode`, legacy: `profile_intro`, `prompt_html`, `profile_title`, `favorite_song_id`, `is_public` | Brispace profile data (flat columns since 2026-03-10 migration) |
| `profile_wall`        | `target_user_id`→users, `author_user_id`→users, `author_name`, `message`                                                                                                                                                                                                                                  | Wall posts                                                      |
| `user_favorite_songs` | `user_id` PK→users, `song_id`                                                                                                                                                                                                                                                                             | Favorite-song toggles                                           |

### Challenges & Scoring

| Table                    | Key columns                                                                                                                                                                                          | Purpose                                              |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `challenges`             | `id` **text** PK, `title`, `type`, `brian_mode`, `vs_user`→users, `home_only`, `success_metric`, submission workflow: `created_by`, `suggested_for`, `approval_status`, `approved_by`, `approved_at` | Challenge catalog + user submissions                 |
| `assignments`            | `user_id`→users, `challenge_id`→challenges, `assigned_at`, `triggered_at`, `completed_at`, `outcome`, `active`, `updated_at`, `updated_by`                                                           | Per-user challenge state (active cap, swap, trigger) |
| `competition_placements` | `user_id`→users, `event_id`→events, `place`, `points`                                                                                                                                                | Competition results                                  |
| `achievements`           | `key` unique, `name`, `points`, `image_url`, `is_visitor_eligible`, `metadata` jsonb                                                                                                                 | Achievement catalog                                  |
| `user_achievements`      | `user_id`→users, `achievement_id`→achievements, `awarded_at`, `details` jsonb                                                                                                                        | Awarded achievements                                 |

### Events & Engagement

| Table                | Key columns                                                                                     | Purpose                                                       |
| -------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `events`             | `title`, `date`, `time_start/end`, `time_label`, `location`, `directions_url`, `link_url/label` | Event schedule                                                |
| `event_rsvps`        | `event_id`→events, `user_id`→users, `status`                                                    | RSVPs                                                         |
| `guestbook`          | `name`, `message`, `user_id`→users (nullable for legacy)                                        | Event-info/invitation guestbook                               |
| `page_views`         | `page_name`, `view_count`                                                                       | View counters (`increment_page_views` RPC)                    |
| `notifications`      | `user_id`→users, `payload` **jsonb**, `read`, `created_at`                                      | In-app feed; payload carries type/title/body/url/action_label |
| `push_subscriptions` | `user_id`→users, `endpoint`, `keys` jsonb                                                       | Web Push registrations                                        |
| `app_settings`       | `setting_key`, `setting_value` jsonb                                                            | Feature flags (`event_started`, `challenges_enabled`)         |

### Recipes & Cocktails

Phase 1 (legacy, competition-embedded) and Phase 2 (standalone recipes) coexist:

| Table                                                 | Purpose                                                                                |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `cocktail_competitions` / `recipe_competitions`       | Competition metadata (`voting_open`, `voting_closed_at`)                               |
| `cocktail_entries`                                    | Phase-1 entries (now with full recipe fields: ingredients[], steps[], slug, category…) |
| `recipes`                                             | Phase-2 standalone recipes                                                             |
| `recipe_competition_entries`                          | Junction: competition ↔ recipe                                                         |
| `cocktail_judgments` / `recipe_competition_judgments` | Per-judge scores: taste, presentation, workmanship, creativity + notes                 |
| `cocktail_favorites` / `recipe_competition_favorites` | Judge favorites                                                                        |
| `recipe_comments`                                     | Recipe discussion (user or guest_name)                                                 |
| `recipe_categories`                                   | Category catalog (slug PK, tagline, gif_url, sort_order)                               |

### Competition Platform (2026-10, per-competition judging)

New-model competitions define their own category set (count/labels/weights); a competition with `competition_categories` rows is scored from the normalized tables below. Legacy competitions keep the frozen fixed-column judgments. `recipe_competitions` gained `slug`, `theme`, `favorite_bonus`, `event_id`. See `sql/2026_10_01_competition_platform.sql`.

| Table                         | Purpose                                                                            |
| ----------------------------- | ---------------------------------------------------------------------------------- |
| `competition_categories`      | Per-competition judging categories: key, label, weight, sort_order                 |
| `competition_judgments`       | Judgment header, UNIQUE(entry_id, judge_user_id); self-judging blocked via trigger |
| `competition_judgment_scores` | One score row (1–5) per category per judgment                                      |
| `competition_registrations`   | role `entrant`/`judge`, status `active`/`withdrawn` (soft withdraw), dish title    |

## Views

| View                                 | Purpose                                                                                             |
| ------------------------------------ | --------------------------------------------------------------------------------------------------- |
| `scoreboard`                         | Event leaderboard: assigned + competition + achievement points → `total_points`                     |
| `scoreboard_old`                     | Pre-achievements version (legacy, still present)                                                    |
| `site_leaderboard`                   | Brispace ranking: visitor-eligible achievement points; published profiles only (2026-10)            |
| `brispace_leaderboard`               | Site ranking variant with `headshot` (SSR scoreboard); published profiles only (2026-10)            |
| `cocktail_leaderboard`               | Competition ranking: avg technical score + favorites → `final_score`                                |
| `recipe_detail_view`                 | Unified recipe detail: author, competition rank/medal, avg score (legacy + new-model scoring)       |
| `competition_leaderboard_view`       | New-model ranking: avg per-judge SUM(score×weight) + favorites×`favorite_bonus`; withdrawn excluded |
| `competition_category_averages_view` | Per-entry per-category averages for results pages                                                   |
| `user_profile_view`                  | `users` ⋈ `user_profile` for profile rendering                                                      |

## RPC Functions

| RPC                                      | Purpose                                                |
| ---------------------------------------- | ------------------------------------------------------ |
| `rpc_award_achievement_by_key`           | Atomic idempotent achievement award                    |
| `rpc_award_on_challenge_threshold`       | Award when completed-challenge count crosses threshold |
| `rpc_award_on_comment_threshold`         | Award on wall-post/comment thresholds                  |
| `rpc_award_when_all_assigned_completed`  | "All assigned completed" award                         |
| `update_challenge_assignments`           | Transactional assignment updates (optimistic locking)  |
| `get_app_setting` / `update_app_setting` | Feature-flag access                                    |
| `increment_page_views`                   | Atomic page-view counter                               |

## `/sql` Folder Conventions

- New migrations: dated filenames `YYYY_MM_DD_description.sql`; older undated files predate the convention.
- **Every schema change must get a `/sql` file** before being applied (see `.github/copilot-instructions.md`), applied to **both** dev and prod projects via the Supabase SQL editor.
- There is no migration runner or applied-migrations tracking yet; order and completeness are manual. A baseline + runner workflow is a planned improvement.

## Dev Data Tooling

- `npm run seed` — idempotent local fixtures (`scripts/seed-dev.js`); does not touch the achievements catalog.
- `npm run db:pull` — anonymized prod → dev content copy (`scripts/db-pull.js`): scrubs `users.phone_number`/`users.firebase_uid`, skips `push_subscriptions`, dry-run by default, refuses if the target URL equals prod. See [GETTING-STARTED.md](GETTING-STARTED.md#dev-data).
