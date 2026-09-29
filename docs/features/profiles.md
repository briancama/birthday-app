# User Profiles (Brispace)

## What it is

MySpace-style user profile pages at `/users/:identifier` (username or UUID), server-rendered from `user_profile_view`. Owners edit everything inline; visitors see published profiles listed on the homepage and `/friends`.

## How it works

### Profile content

- **Identity** — username, display name, headshot (`users` table).
- **Details** — status, hometown, age, fav movie/song, general interest, television, sanitized `about_html` (3000-char limit) (`user_profile`).
- **Social** — wall posts (`profile_wall`), Top 8 (`user_profile.top_n` jsonb), achievements, favorite songs.
- **Publishing** — `is_published` controls appearance on Brispace home (latest 4) and `/friends`.

### Owner-only inline editing

Edit controls are **gated at template render time** (not just CSS-hidden), sit in normal flow at section bottom-right, and save via `PATCH /api/users/:id/profile-fields` (see [../API.md](../API.md)).

### Customization

- **Background picker** — owner-only floating panel; options auto-discovered server-side from `images/backgrounds/` (no hardcoded lists in client JS). Persists `profile_bg_url` (allow-listed to `/images/backgrounds/`) + `profile_bg_mode: 'tile'`.
- **Theme tokens** — the selected background drives `body.has-profile-theme` with CSS custom properties (section bg/text/border, heading bg/text, detail-row bg, link colors), mapped from the background filename (stars, sunset, matrix, paper, bubblegum…). Template and client token resolution must stay aligned so persisted render matches picker live preview. Themed mode removes the white layout shell and pads `myspace-section` by 0.5rem.
- **Profile GIF** — curated catalog key stored in `profile_gif_key`; owners always see the picker, non-owners only see a selected GIF. Catalog keys must stay stable across client/server/templates.

### Wall & Top 8

- Wall: post/delete via `/api/users/:id/wall...`; posting notifies the recipient and feeds `wall_posts_1/3/5` achievements.
- Top 8: bulk replace, add, remove endpoints; entries normalized (UUID or username); filling all 8 awards `top_8_complete`.

### Headshots

`js/components/headshot-upload.js` uploads then dispatches `user:headshot-updated` on `window` with `{ userId, headshotUrl }`. `BasePage` (only) listens globally and updates every `img[data-headshot="user-{userId}"]`. Always use that attribute for avatar images; never register per-page headshot listeners.

## Key files

| File                                                          | Role                                                               |
| ------------------------------------------------------------- | ------------------------------------------------------------------ |
| `routes/users.js`                                             | Profile SSR route (theme tokens, background options, owner gating) |
| `templates/user.ejs`, `css/components/*`                      | Profile markup/styles                                              |
| `js/pages/user-profile.js`                                    | Client-side editing behaviors                                      |
| `js/components/headshot-upload.js`, `myspace-comment-card.js` | Upload + wall cards                                                |
| `js/constants/profile-themes.json`                            | Theme token definitions                                            |
| `routes/api-users.js`                                         | All profile mutation endpoints                                     |

## Data

`users`, `user_profile` (incl. legacy columns from earlier iterations), `user_profile_view`, `profile_wall`, `user_favorite_songs`. See [../DATABASE.md](../DATABASE.md).
