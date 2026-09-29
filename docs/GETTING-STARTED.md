# Getting Started (Local Development)

## Prerequisites

- Node.js 20+ (production runs Node 20 LTS)
- Access to the **dev** Supabase project and **dev** Firebase project (see below — the app has separate dev/prod backends)

## Setup

```bash
git clone <repo-url> birthday-app
cd birthday-app
npm install
cp .env.example .env            # fill in dev Supabase/Firebase values
cp js/config.example.js js/config.js   # fill in publishable client keys
npm run dev                     # node --watch; or: npm start
# → http://localhost:8000
```

The Express server serves everything: EJS pages, static HTML pages, JS/CSS/images, and all API routes. There is no build step.

## Configuration

There are **two config surfaces** — server env vars and a client config module.

### 1. Server: `.env` (gitignored)

Copy [.env.example](../.env.example) and fill in values. Loaded automatically via `dotenv` when `NODE_ENV !== "production"` (see top of `server.js`).

| Variable                                                       | Required       | Purpose                                                        |
| -------------------------------------------------------------- | -------------- | -------------------------------------------------------------- |
| `SUPABASE_URL`                                                 | yes            | Supabase project URL (use the **dev** project locally)         |
| `SUPABASE_SERVICE_ROLE`                                        | yes            | Service-role key — server only, never expose to browser        |
| `COOKIE_SECRET`                                                | yes            | Secret for Express signed cookies (any string in dev)          |
| `FIREBASE_SERVICE_ACCOUNT` or `GOOGLE_APPLICATION_CREDENTIALS` | for real login | Firebase admin credentials (JSON string, or path to JSON file) |
| `FIREBASE_PROJECT_ID`                                          | fallback       | Used if no service account is provided                         |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_EMAIL`       | for push       | Web Push keys (`npx web-push generate-vapid-keys`)             |
| `PORT`                                                         | no             | Defaults to `8000`                                             |
| `NODE_ENV`                                                     | no             | Unset/`development` locally; `production` on the droplet       |
| `DEV_LOCAL_USER_ID`                                            | no             | Default user id for dev auto-login (below)                     |
| `DEV_DISABLE_AUTOLOGIN`                                        | no             | Set to disable dev auto-login                                  |
| `DEV_SIMULATE_LIVE`                                            | no             | Set `1` to simulate production cookie behavior locally         |

### 2. Client: `js/config.js` (gitignored)

Copy `js/config.example.js` to `js/config.js`. It's an ES module exporting `SUPABASE_CONFIG`, `FIREBASE_CONFIG`, `APP_CONFIG`, and `VAPID_PUBLIC_KEY`, and it switches **dev vs prod automatically by hostname** (`localhost`/`127.0.0.1` → dev project keys, anything else → prod keys). Only publishable/anon keys belong here.

> Dev and prod are fully separate Supabase and Firebase projects. Local development talks to the dev backends; the deployed site talks to prod. Schema changes must be applied to both (see [DATABASE.md](DATABASE.md)).

## Dev Auto-Login (skip phone OTP locally)

Real login requires Firebase phone OTP, which is painful locally. When `NODE_ENV !== "production"` the server auto-sets a signed `user_id` cookie so pages behave as logged-in (middleware in `server.js`):

- Default identity: `DEV_LOCAL_USER_ID` env var, or the literal `local-dev-user`.
- **Switch users anytime**: visit any page with `?devUserId=<uuid-or-username>` — it overrides an existing session cookie immediately (no cookie clearing needed).
- A non-httpOnly `user_id_dev_readable` cookie is also set for UI debugging.
- Opt out with `DEV_DISABLE_AUTOLOGIN=1` (e.g., to test the real login flow).
- The cookie value may be a UUID **or a username** — server nav middleware resolves both.

## Dev Data

Two ways to get usable data into the dev Supabase project:

- **`npm run seed`** — idempotent fixtures: users `brianc` (admin), `alice`, `bob`, `visitor1`, three challenges, assignments, one event. Then visit `http://localhost:8000/dashboard?devUserId=alice`. Refuses to run against the prod URL.
- **`npm run db:pull`** — copies real production content into the dev project with auth identifiers scrubbed (`phone_number` nulled, `firebase_uid` replaced), so prod data is browsable locally as any user via `?devUserId=`. Requires `PROD_SUPABASE_URL`/`PROD_SUPABASE_SERVICE_ROLE` in `.env`. Dry run by default; pass `--yes` to write: `npm run db:pull -- --yes`. Push subscriptions are never copied. **Replaces existing dev data.**

## Console Test Helpers

Loadable browser-console helpers at repo root:

| File                           | Helpers                                                     |
| ------------------------------ | ----------------------------------------------------------- |
| `test-achievement-service.js`  | Achievement awarding/testing                                |
| `test-assignment-service.js`   | Assignment service operations                               |
| `test-notification-service.js` | `testNotificationSubscription()`, `testNotificationInbox()` |

## npm Scripts

| Script              | Purpose                                                           |
| ------------------- | ----------------------------------------------------------------- |
| `npm start`         | Run the server                                                    |
| `npm run dev`       | Run with auto-restart on file changes (`node --watch`)            |
| `npm run seed`      | Idempotent dev fixtures (see Dev Data above)                      |
| `npm run db:pull`   | Anonymized prod → dev content sync (dry run; `-- --yes` to write) |
| `npm run inventory` | Regenerate `docs/site-inventory.json`                             |
| `npm run lint:ejs`  | Lint all EJS templates (`ejslint`)                                |

## Troubleshooting

- **404s on pages** — extensionless single-segment URLs are rewritten to `.html`, but most pages are EJS routes in `server.js`; check the route table in [API.md](API.md).
- **DB errors (missing view/table)** — your dev Supabase project is missing schema; see [DATABASE.md](DATABASE.md).
- **Login fails locally** — you usually don't need it; use dev auto-login. For real OTP testing you need the dev Firebase project's test phone numbers.
