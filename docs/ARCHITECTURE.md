# Architecture

## Stack

| Layer    | Technology                                                                      |
| -------- | ------------------------------------------------------------------------------- |
| Server   | Node.js + Express 5 (`server.js`), EJS views in `templates/`                    |
| Client   | Vanilla ES modules (`js/`), no build step, no framework                         |
| Database | Supabase (Postgres + PostgREST + RLS), separate dev/prod projects               |
| Auth     | Firebase phone OTP (client SDK) + `firebase-admin` verification (server)        |
| Push     | Standard Web Push (VAPID) via `web-push` — Firebase is _not_ the push transport |
| Styling  | Hand-crafted GeoCities-era CSS (`css/geocities.css` + `css/components/`)        |

## Rendering Model (hybrid)

Three kinds of user-facing surfaces, all served by the one Express process:

1. **Server-rendered EJS pages** — most pages: `/` (Brispace home), `/friends`, `/account`, `/recipes...`, `/users/:identifier`, `/dashboard`, `/scoreboard`, `/leaderboard`, `/challenges`, `/event-info`, `/challenges-submit`, `/admin`, `/admin-approvals`, `/cocktail-judging`. Routes also intercept the `.html` variants (e.g. `/dashboard.html` renders EJS — the root `dashboard.html` file is legacy).
2. **Static HTML pages** — served by the static middleware + extensionless rewrite: `index.html` (login), `register.html`, `invitation.html`, `hub.html`, `ytmnd.html`, `cocktail-rubric.html` (explicit `sendFile`), `hello.html`.
3. **JSON APIs** — `/auth`, `/api`, `/notifications`, mounted from `routes/`.

Middleware order in `server.js` matters:

```
express.json → challenge-state locals → cookieParser(COOKIE_SECRET)
→ dev auto-login (non-prod only) → navData middleware → extensionless .html rewrite
→ page routes → routers (/users, /api, /auth, /notifications) → express.static
```

### navData middleware

Every request resolves the signed `user_id` cookie (UUID **or** username) to a `users` row, then loads in parallel: push-subscription presence, `event_started` + `challenges_enabled` app settings, and unread notification count (7-day window). Result goes to `res.locals.navData` (+ XSS-safe `navDataJson`) for the navigation partials. Admin = username `brianc` or `admin` (hardcoded).

## Auth Flow

1. Client (`js/pages/login.js` + `js/services/firebase-auth.js`) does Firebase phone OTP, gets an ID token.
2. `POST /auth/login { idToken }` — server verifies with `firebase-admin` (`routes/auth.js`).
3. Server finds or creates a `users` row: lookup by `firebase_uid`, fallback link by `phone_number`, else insert new `visitor` user with generated "Brian Fan" display name.
4. Server sets signed httpOnly cookie `user_id` (2 days, `sameSite: lax`, `secure` in prod) and returns redirect hints (`needsOnboarding`, `userType`, `username`).
5. Client `appState.init()` → `GET /auth/me` for profile hydration.
6. Server-side gating uses `requireSignedUser(req)` from `js/utils/server-utils.js`.

Dev shortcut: auto-login middleware sets the cookie without OTP — see [GETTING-STARTED.md](GETTING-STARTED.md).

## Database Access

- **Server**: `getSupabase()` (`js/utils/server-utils.js`) creates a client with `SUPABASE_SERVICE_ROLE` — bypasses RLS; keep server-only.
- **Client**: `appState.getSupabase()` uses the publishable/anon key from `js/config.js` — subject to RLS.
- Atomic/sensitive operations use Postgres RPCs (e.g. `rpc_award_achievement_by_key`, `update_challenge_assignments`) — see [DATABASE.md](DATABASE.md).

## Client Patterns

- **`appState`** (`js/app.js`) — singleton for Supabase client, current user, auth state. All user/session access goes through `appState.getCurrentUser()` / `getUserId()` / `getSupabase()`. Emits events (`user:loaded`, `user:error`).
- **`BasePage`** (`js/pages/base-page.js`) — every page class extends it: lifecycle (`init` → `onReady` → `cleanup`), centralized `showError()`/`showSuccess()`, global `user:headshot-updated` listener that updates all `[data-headshot="user-{id}"]` images.
- **`EventBus`** (`js/events/event-bus.js`) — global EventTarget with namespaced event constants (`EventBus.EVENTS.CHALLENGE.COMPLETE` etc.) for cross-component coordination.
- **Components** (`js/components/`) — two styles: EventTarget-based functional components (e.g. `challenge-card.js`, dispatch `CustomEvent`s) and Web Components (e.g. `navigation.js` extends HTMLElement). Components are stateless: state passed in, full re-render, listeners re-attached.
- **Services** (`js/services/`) — `auth-manager`, `firebase-auth`, `achievement-service` (event-driven awarding), `assignment-service` (optimistic locking via RPC), `challenge-loader`, `notification-service`.

## Server Utilities

| Module                              | Provides                                                                                                      |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `js/utils/server-utils.js`          | `getSupabase()`, `requireSignedUser()`, `ensureFirebaseAdmin()`, `createSanitizer()` (DOMPurify + jsdom)      |
| `js/utils/notification-delivery.js` | `createAndDeliverNotification()` — persists notification + attempts web push                                  |
| `js/utils/sidebar-media.js`         | Media catalog + `buildMediaSlots()` for ad/GIF slots (see [features/media-slots.md](features/media-slots.md)) |
| `js/utils/challenge-state.js`       | Shared reveal/lock state logic, used by both client and EJS SSR                                               |

## Navigation Partials

Two navigation partials that must be kept in sync structurally:

- `templates/partials/navigation.ejs` — participant/event surfaces (dashboard, challenges, event-info, admin, cocktail pages)
- `templates/partials/navigation-visitor.ejs` — Brispace visitor surfaces (`/`, `/friends`, `/users/:id`, `/scoreboard`)

Profile icon routes to `/account`; unread notification badge renders from `navData.unreadNotificationCount`.

## Supabase Edge Functions

- `supabase/functions/validate-firebase-token` — Firebase ID token validation (Deno edge alternative to the Express path).
