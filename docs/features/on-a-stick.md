# On a Stick (Food Competition, Dec 2026)

## What it is

A standalone two-page home for the "On a Stick" food competition — **deliberately outside the app shell**: no navigation, no BasePage/appState, no geocities.css. Hand-built mobile-first scroll experience in the Hot Dog on a Stick palette (red `#e03a3e` / blue `#0076c0` / yellow `#fff200`).

Event: **Sat Dec 5, 2026 · 3:00 arrival / 3:30 judging · Nick & Lori's House, Kent, WA.**

## Pages

| Page                                            | Purpose                                                                                                                   |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `on-a-stick.html` (`/on-a-stick`)               | Landing: corndog hero scroll scene → rules + categories (skewer scroll scene) → registration placeholder → Brispace outro |
| `on-a-stick-rubric.html` (`/on-a-stick-rubric`) | Scoring breakdown: weight cards per category + favorite-bonus math                                                        |

Served by the extensionless rewrite + static middleware — no routes in `server.js`.

## Key files

| File                     | Role                                                                                                         |
| ------------------------ | ------------------------------------------------------------------------------------------------------------ |
| `css/on-a-stick.css`     | Standalone stylesheet; all scene motion and tuning knobs (CSS custom properties) live here                   |
| `js/pages/on-a-stick.js` | Tiny rAF scroll handler feeding progress variables (`--food-shift`, `--reveal`, `--rules-p`); no app imports |
| `images/stick/`          | Hand-drawn SVG art (corndog + stick layers, skewer + 3 pieces, check mark), favicon set, logo reference      |

## Scroll scenes

Both scenes map scroll progress to CSS custom properties; **all motion/timing lives in the CSS** as tunable `clamp()` phase windows:

1. **Hero** — sticky stage on a 240svh runway; the corndog's food layer (`#corndog-food`) slides off leaving the stick while intro copy + event card fade in beside it.
2. **Rules skewer** — full-width sticky bar at the section top; the skewer rotates −90° to lie flat (traveling right so the tip stays on screen) while the RULES heading is pushed right by a flex spacer; the three pieces then slide off in sequence as the category cards scroll under the bar.

`prefers-reduced-motion` gets fully static layouts for both scenes.

## Scoring

Four categories: **Taste, Presentation, Craft, Stickiness** (weights ×11/×3/×3/×3), seeded as `competition_categories` rows via `sql/2026_10_01_seed_on_a_stick_competition.sql`. Stickiness is definition-based rather than a 5→1 ladder, anchored by the 1929 stick-food patent ([US1706491A](https://patents.google.com/patent/US1706491A/en)). Favorite-vote bonus (+3) matches the cocktail competition.

## Registration & judging (built 2026-10)

- **Registration** — two CTAs (hero + "Are You Coming?" section) open a modal step-walker (`js/pages/on-a-stick-register.js`): phone OTP via the shared `firebaseAuth` service → `/auth/login` (visitor auto-provisioning, no Brispace onboarding) → name + role pick → confirmed/manage. The name is required for auto-provisioned accounts and applied to `users.display_name` **only** when the username is a `visitor_*` placeholder — existing Brispace names are never overwritten. All writes (register, switch role, withdraw) happen in the modal; the page only swaps CTA labels/status text (no layout shift). Async waits show the geometric skewer loader (`.stick-loader`, timing via `--loader-*` CSS knobs). Registering auto-RSVPs `going` on the linked `events` row. Withdraw is soft — the entry is hidden from judging/leaderboard and restored on re-register.
- **Secret entries** — recipes entered in a competition are hidden from AFewRecipes (homepage, All Recipes, filters, detail pages) until the day after `event_date`; authors still see their own via the detail page and My Recipes. The competition API and `/competitions/:slug/results` hide entries before competition day unless `voting_open` is true.
- **Guest list** — `/on-a-stick/guest-list` (server route in `server.js`, `templates/on-a-stick-guest-list.ejs`): totals (all/entrants/judges) over a name + role table of active registrations. Public, display names only.
- **Judging** — the reusable platform pages: `/competitions/on-a-stick/judge` (auth-gated, data-driven categories, `theme-on-a-stick` skin) and `/competitions/on-a-stick/results`. Judging opens by flipping `recipe_competitions.voting_open` day-of. Entries also surface on AFewRecipes with rank/medal via `recipe_detail_view`.
