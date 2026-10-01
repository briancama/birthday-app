# On a Stick (Food Competition, Dec 2026)

## What it is

A standalone two-page home for the "On a Stick" food competition — **deliberately outside the app shell**: no navigation, no BasePage/appState, no geocities.css. Hand-built mobile-first scroll experience in the Hot Dog on a Stick palette (red `#e03a3e` / blue `#0076c0` / yellow `#fff200`).

Event: **Sat Dec 5, 2026 · 3:00 arrival / 3:30 judging · Nick & Lori's House, Kent, WA.**

## Pages

| Page | Purpose |
| --- | --- |
| `on-a-stick.html` (`/on-a-stick`) | Landing: corndog hero scroll scene → rules + categories (skewer scroll scene) → registration placeholder → Brispace outro |
| `on-a-stick-rubric.html` (`/on-a-stick-rubric`) | Scoring breakdown: weight cards per category + favorite-bonus math |

Served by the extensionless rewrite + static middleware — no routes in `server.js`.

## Key files

| File | Role |
| --- | --- |
| `css/on-a-stick.css` | Standalone stylesheet; all scene motion and tuning knobs (CSS custom properties) live here |
| `js/pages/on-a-stick.js` | Tiny rAF scroll handler feeding progress variables (`--food-shift`, `--reveal`, `--rules-p`); no app imports |
| `images/stick/` | Hand-drawn SVG art (corndog + stick layers, skewer + 3 pieces, check mark), favicon set, logo reference |

## Scroll scenes

Both scenes map scroll progress to CSS custom properties; **all motion/timing lives in the CSS** as tunable `clamp()` phase windows:

1. **Hero** — sticky stage on a 240svh runway; the corndog's food layer (`#corndog-food`) slides off leaving the stick while intro copy + event card fade in beside it.
2. **Rules skewer** — full-width sticky bar at the section top; the skewer rotates −90° to lie flat (traveling right so the tip stays on screen) while the RULES heading is pushed right by a flex spacer; the three pieces then slide off in sequence as the category cards scroll under the bar.

`prefers-reduced-motion` gets fully static layouts for both scenes.

## Scoring

Four categories: **Taste, Presentation, Craft, Stickiness** (draft weights ×11/×3/×3/×3 — under review). Stickiness is definition-based rather than a 5→1 ladder, anchored by the 1929 stick-food patent ([US1706491A](https://patents.google.com/patent/US1706491A/en)). Favorite-vote bonus (+3) matches the cocktail competition.

## Planned (not built)

- **Registration** — the yellow "Count Me In" section holds a placeholder slot; the flow will confirm attendance for a final headcount (tells entrants how many portions to prepare). Likely an `events` row + `event_rsvps` in the main app.
- **Judging** — reuses the recipe-competition machinery (see [recipes-and-cocktails.md](recipes-and-cocktails.md)). If weights/categories diverge from the cocktail defaults, do the per-competition `scoring_config` refactor first (weights are currently hardcoded in 2 SQL views + the judging client).
