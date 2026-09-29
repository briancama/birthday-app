# Recipes & Cocktail Competitions

## What it is

A retro AllRecipes-style recipe section (`/recipes`) plus judged cocktail/recipe competitions with scoring, favorites, and comments. Built in two phases that currently **coexist**:

- **Phase 1 (legacy)** — entries live directly in `cocktail_entries`, tied to a `cocktail_competitions` row (entries gained full recipe fields over time).
- **Phase 2** — standalone `recipes` table; competitions link recipes via `recipe_competition_entries`.

## How it works

### Recipe pages

- `/recipes` — homepage: recent recipes, top-rated, competitions gallery, categories sidebar (`recipe_categories`).
- `/recipes/all` — full listing; `/recipes/:slug` — detail page rendered from `recipe_detail_view` (author, competition rank/medal, average score, judgments count) plus `recipe_comments` (signed-in users or `guest_name`).
- Old `/recipe...` paths 301-redirect to `/recipes...`.

### Entry & judging flow

1. Participants submit entries through the cocktail entry modal (`js/components/cocktail-entry-modal.js`, launched from event-info) — name, ingredients, steps, prep/cook time, image, category.
2. While `voting_open` on the competition, judges score entries at `/cocktail-judging`: **taste, presentation, workmanship, creativity** + notes (rubric reference at `/cocktail-rubric`).
3. Judges can mark favorites (`js/components/favorite-button.js`).
4. **No self-judging** — enforced by RLS (`sql/2026_03_20_no_self_judging.sql`).
5. Rankings come from `cocktail_leaderboard` (avg technical score + favorite votes → `final_score`) and `recipe_detail_view.competition_rank`.

## Key files

| File                                                             | Role                                     |
| ---------------------------------------------------------------- | ---------------------------------------- |
| `templates/recipe.ejs` + `css/recipe.css`                        | All recipe pages (home/all/detail modes) |
| `js/pages/cocktail-judging.js`, `templates/cocktail-judging.ejs` | Judging UI                               |
| `js/pages/cocktail-leaderboard.js`                               | Legacy rankings page                     |
| `js/components/cocktail-entry-modal.js`                          | Entry submission/editing                 |
| `cocktail-rubric.html`, `css/rubric.css`                         | Scoring rubric                           |
| `server.js` (recipes routes)                                     | SSR queries and slot plans               |

## Data

Phase 1: `cocktail_competitions`, `cocktail_entries`, `cocktail_judgments`, `cocktail_favorites`, view `cocktail_leaderboard`.
Phase 2: `recipes`, `recipe_competitions`, `recipe_competition_entries`, `recipe_competition_judgments`, `recipe_competition_favorites`, `recipe_comments`, `recipe_categories`, view `recipe_detail_view`. See [../DATABASE.md](../DATABASE.md).

## Gotchas

- Entry ordering uses `sql/2026_03_20_add_cocktail_entry_order.sql`.
- Judging is gated by the `event_started` feature flag.
- When adding recipe features, check whether both phase-1 and phase-2 tables need the change.
