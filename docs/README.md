# Docs Index

Birthday Challenge Zone ("Brispace") — a retro GeoCities-style event app: progressive challenge unlocking, MySpace-style user profiles, competitions, achievements, and live scoreboards. Vanilla HTML/CSS/JS frontend, Node.js/Express + EJS server, Supabase (Postgres) backend, Firebase phone-OTP auth.

Last full docs refresh: **2026-09-28**.

## Doc Map

| Doc                                                                                 | What it covers                                                                       |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| [GETTING-STARTED.md](GETTING-STARTED.md)                                            | Local setup, env vars, `js/config.js`, dev auto-login, test helpers                  |
| [ARCHITECTURE.md](ARCHITECTURE.md)                                                  | Express/EJS/static hybrid, auth flow, appState/BasePage/EventBus patterns            |
| [API.md](API.md)                                                                    | Every server route: pages, auth, users API, notifications API                        |
| [DATABASE.md](DATABASE.md)                                                          | Ground-truth schema (tables, views, RPCs), `/sql` folder conventions and known drift |
| [DEPLOYMENT.md](DEPLOYMENT.md)                                                      | Production: DigitalOcean droplet, systemd, nginx, TLS, env vars, ops commands        |
| [DEVELOPMENT-GUIDELINES.md](DEVELOPMENT-GUIDELINES.md)                              | Code standards, GeoCities aesthetic rules, feature flags                             |
| [site-inventory.md](site-inventory.md) / [site-inventory.json](site-inventory.json) | Page → script/CSS dependency map (JSON is machine-parseable)                         |

## Feature Docs

| Feature                                                                          | Doc                                                                          |
| -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Challenges (progressive unlock, trigger/swap, Brian mode, submissions/approvals) | [features/challenges.md](features/challenges.md)                             |
| Scoring, leaderboards & achievements                                             | [features/scoring-and-achievements.md](features/scoring-and-achievements.md) |
| Recipes & cocktail competitions (judging, favorites, comments)                   | [features/recipes-and-cocktails.md](features/recipes-and-cocktails.md)       |
| On a Stick food competition (standalone landing + rubric pages)                  | [features/on-a-stick.md](features/on-a-stick.md)                             |
| Notifications (web push + Account Center feed)                                   | [features/notifications.md](features/notifications.md)                       |
| User profiles / Brispace (wall, Top 8, themes, backgrounds, GIFs, headshots)     | [features/profiles.md](features/profiles.md)                                 |
| Sidebar media & ads (slot system)                                                | [features/media-slots.md](features/media-slots.md)                           |
| Easter eggs (YTMND, scam simulator, secret tracks, goblin king)                  | [features/easter-eggs.md](features/easter-eggs.md)                           |
| Audio & music (SFX, music player, mute)                                          | [features/audio.md](features/audio.md)                                       |

## Other References

- `.github/copilot-instructions.md` — AI-agent conventions and implementation patterns (overlaps intentionally with these docs).
- [archive/](archive/) — historical one-off implementation notes and superseded setup guides. Do not follow these; see [archive/README.md](archive/README.md).
- `/sql/` — SQL migration history (append-only; see [DATABASE.md](DATABASE.md) for caveats about drift).
