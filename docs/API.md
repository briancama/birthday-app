# API & Route Reference

All routes are served by the single Express app in `server.js`. "Cookie" in the Auth column means the route requires the signed `user_id` cookie (set by `/auth/login` or dev auto-login).

## Page Routes (EJS, `server.js`)

Each route also matches its `.html` variant (e.g. `/dashboard` and `/dashboard.html`).

| Route                                         | Template                          | Notes                                                               |
| --------------------------------------------- | --------------------------------- | ------------------------------------------------------------------- |
| `GET /`                                       | `brispace.ejs`                    | Brispace homepage: latest published users, media slots, GIF stepper |
| `GET /friends`                                | `friends.ejs`                     | All published users directory                                       |
| `GET /account`                                | `account.ejs`                     | Account Center (redirects if not signed in)                         |
| `GET /recipes`                                | `recipe.ejs`                      | Recipe home: recent, top-rated, competitions, categories            |
| `GET /recipes/all`                            | `recipe.ejs`                      | All recipes listing                                                 |
| `GET /recipes/:slug`                          | `recipe.ejs`                      | Recipe detail: ranking, reviews, comments                           |
| `GET /recipe`, `/recipe/all`, `/recipe/:slug` | —                                 | 301 redirects to `/recipes...` equivalents                          |
| `GET /dashboard`                              | `dashboard.ejs`                   | Participant dashboard                                               |
| `GET /leaderboard`                            | `leaderboard.ejs`                 | Dual-tab leaderboard (Event / Brispace)                             |
| `GET /scoreboard`                             | `scoreboard.ejs`                  | Server-rendered scoreboard with media slots                         |
| `GET /challenges`                             | `challenges.ejs`                  | Challenge list                                                      |
| `GET /challenges-submit`                      | `challenges-submit.ejs`           | Challenge submission workshop                                       |
| `GET /event-info`                             | `event-info.ejs`                  | Event schedule, guestbook, music player                             |
| `GET /admin`                                  | `admin.ejs`                       | Admin dashboard                                                     |
| `GET /admin-approvals`                        | `admin-approvals.ejs`             | Submission approval board                                           |
| `GET /cocktail-judging`                       | `cocktail-judging.ejs`            | Competition judging UI                                              |
| `GET /cocktail-rubric`                        | `cocktail-rubric.html` (sendFile) | Judging rubric reference                                            |
| `GET /users/:identifier`                      | `user.ejs` (`routes/users.js`)    | User profile by username or UUID; owner-edit gating server-side     |

## Static Pages (no EJS route)

Served by static middleware + extensionless rewrite: `index.html` (login), `register.html` (onboarding), `invitation.html`, `hub.html`, `ytmnd.html`, `hello.html`.

## Auth — `routes/auth.js`, mounted at `/auth`

| Method & Path       | Auth                      | Purpose                                                                                                                                                                                                                                                            |
| ------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `POST /auth/login`  | Firebase ID token in body | Verify token; find/create `users` row (lookup `firebase_uid` → link by `phone_number` → create visitor); set signed cookie; returns `{ ok, userId, needsOnboarding, userType, username, redirect }`. Non-prod: accepts `devUserId`/`dev` body params for dev login |
| `POST /auth/logout` | —                         | Clear session cookie                                                                                                                                                                                                                                               |
| `GET /auth/me`      | Cookie                    | Current user profile                                                                                                                                                                                                                                               |

## Users API — `routes/api-users.js`, mounted at `/api`

All routes require the signed cookie; most also enforce that the actor matches or has permission.

| Method & Path                               | Purpose                                                                                                                                                                           |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/users/:id/challenge`             | Trigger a dormant challenge for user `:id` (2-active cap); creates notification; social-butterfly achievement hook                                                                |
| `POST /api/assignments/:id/swap`            | Swap an active assignment to dormant, activate next in queue                                                                                                                      |
| `GET /api/users/active-challenge-counts`    | Active vs total incomplete counts per user                                                                                                                                        |
| `POST /api/users/:id/profile`               | Save custom profile HTML (sanitized)                                                                                                                                              |
| `POST /api/users/:id/register`              | Onboarding: set `display_name` + unique `username` slug                                                                                                                           |
| `PATCH /api/users/:id/identity`             | Update username/display_name (username only during setup)                                                                                                                         |
| `PATCH /api/users/:id/profile-fields`       | Update profile fields: status, hometown, age, favs, `about_html`, `is_published`, `profile_gif_key`, `profile_bg_url` (allow-listed to `/images/backgrounds/`), `profile_bg_mode` |
| `PATCH /api/users/:id/top-n`                | Bulk replace Top 8                                                                                                                                                                |
| `POST /api/users/:id/top-n/add`             | Add one user to Top 8                                                                                                                                                             |
| `DELETE /api/users/:id/top-n/:targetUserId` | Remove from Top 8                                                                                                                                                                 |
| `GET /api/users/:id/wall`                   | List wall posts                                                                                                                                                                   |
| `POST /api/users/:id/wall`                  | Post to wall (wall-post achievements + notification)                                                                                                                              |
| `DELETE /api/users/:id/wall/:entryId`       | Delete wall entry (owner or author)                                                                                                                                               |

## Notifications API — `routes/notifications.js`, mounted at `/notifications`

| Method & Path                     | Auth   | Purpose                               |
| --------------------------------- | ------ | ------------------------------------- |
| `GET /notifications/config`       | —      | VAPID public key + enabled flag       |
| `GET /notifications/users`        | Cookie | Unread notifications for current user |
| `POST /notifications/subscribe`   | Cookie | Store a web-push subscription         |
| `POST /notifications/unsubscribe` | Cookie | Remove a subscription                 |
| `POST /notifications/send`        | Cookie | Self-test push delivery               |
| `GET /notifications/list`         | Cookie | Recent notifications (feed)           |
| `POST /notifications/mark-read`   | Cookie | Mark notification(s) read             |

## Conventions

- API errors: JSON `{ error }` with 401 (no cookie), 403 (not permitted), 4xx/5xx as appropriate.
- All user-generated HTML passes through the DOMPurify sanitizer from `createSanitizer()`.
- Notification creation goes through `createAndDeliverNotification()` (`js/utils/notification-delivery.js`) — never insert into `notifications` directly from routes.
- Notification payloads should carry a context `url` (and optional `action_label`) so Account Center links and push clicks land on the right surface.
