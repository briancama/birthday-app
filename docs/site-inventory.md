# Site Inventory — Birthday Challenge Zone

Generated: **2026-09-29** by scanning root HTML files and `templates/*.ejs` for stylesheet links, script tags, module imports, and EJS partial includes. Machine-readable version: [site-inventory.json](site-inventory.json) (same data, per-page `css` / `pageScripts` / `components` / `partials` / `otherScripts`).

For what each page _does_, see [API.md](API.md) (route table) and the [feature docs](README.md#feature-docs).

## Server-rendered templates (primary surfaces)

| Template                   | Page JS                    | Components                                            | Partials                                                             |
| -------------------------- | -------------------------- | ----------------------------------------------------- | -------------------------------------------------------------------- |
| brispace.ejs (`/`)         | pages/brispace.js          | login-signup, gif-stepper                             | navigation-visitor, user-display, media-slot                         |
| friends.ejs                | pages/brispace.js          | login-signup, DialogChain, dialog-chains, gif-stepper | navigation-visitor, sidebar-scam-container, user-display, media-slot |
| scoreboard.ejs             | pages/brispace.js          | login-signup, gif-stepper                             | navigation-visitor, media-slot                                       |
| account.ejs                | pages/account.js           | —                                                     | navigation-visitor                                                   |
| user.ejs (`/users/:id`)    | pages/user-profile.js      | bottom-menu (+ Quill & DOMPurify CDN)                 | navigation-visitor                                                   |
| dashboard.ejs              | pages/dashboard.js         | bottom-menu                                           | navigation, challenge-list                                           |
| challenges.ejs             | pages/challenges.js        | bottom-menu                                           | navigation, challenge-list                                           |
| challenges-submit.ejs      | pages/challenges-submit.js | bottom-menu                                           | navigation                                                           |
| event-info.ejs             | pages/event-info.js        | gif-stepper, bottom-menu                              | navigation                                                           |
| leaderboard.ejs            | pages/leaderboard.js       | bottom-menu                                           | navigation                                                           |
| cocktail-judging.ejs       | pages/cocktail-judging.js  | bottom-menu                                           | navigation                                                           |
| admin.ejs                  | pages/admin.js             | login-signup                                          | navigation                                                           |
| admin-approvals.ejs        | pages/admin-approvals.js   | contest-placement-form/table                          | navigation                                                           |
| recipe.ejs (`/recipes...`) | — (inline)                 | —                                                     | —                                                                    |

Navigation split: Brispace visitor surfaces use `partials/navigation-visitor.ejs`; participant/event surfaces use `partials/navigation.ejs`.

## Static HTML pages

| Page                                                                                                                                                               | Page JS           | Notes                                                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| index.html                                                                                                                                                         | pages/login.js    | Login (Firebase OTP)                                                                                                                                                   |
| register.html                                                                                                                                                      | pages/register.js | Onboarding                                                                                                                                                             |
| invitation.html                                                                                                                                                    | — (inline)        | Invitation + guestbook + view counter                                                                                                                                  |
| hub.html                                                                                                                                                           | — (inline)        | Realtime hub                                                                                                                                                           |
| ytmnd.html                                                                                                                                                         | base-page.js      | Easter egg page                                                                                                                                                        |
| cocktail-rubric.html                                                                                                                                               | —                 | Served via explicit route                                                                                                                                              |
| hello.html                                                                                                                                                         | —                 | Bare test page                                                                                                                                                         |
| dashboard.html, challenges.html, challenges-submit.html, event-info.html, leaderboard.html, cocktail-judging.html, admin-approvals.html, cocktail-leaderboard.html | (legacy)          | **Shadowed by EJS routes** in `server.js` — the `.html` URLs render templates, not these files. Candidates for deletion after verifying nothing links to them directly |

## Shared CSS

`css/geocities.css` is loaded everywhere (variables + retro base). Per-feature styles in `css/components/` (navigation, myspace, brispace-home, submissions, forms, leaderboard, achievements, account, user-profile, event-card, character-select, contest-placements, login-signup, secret-player, hub, brispace-leaderboard) plus root-level `css/recipe.css`, `css/rubric.css`, `css/invitation.css`.

## Regenerating

Run `npm run inventory` (`scripts/generate-site-inventory.js`) — rewrites [site-inventory.json](site-inventory.json) and bumps the date above. It scans for `href="*.css"`, `src="*.js"`, ES `import`s, `components/*.js` references, and `include('partials/...')`. Review the tables in this file manually if pages/templates were added or removed.
