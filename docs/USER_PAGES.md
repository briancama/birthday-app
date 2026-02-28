# User Pages / MySpace-style Profiles

This document describes the design, data model, implementation plan, and operational guidance for server-rendered user profile pages (a lightweight MySpace-style profile) for the Birthday App.

## Goals

- Provide a personalized, shareable profile page per user with:
  - display name and headshot
  - favorite audio track (playback control)
  - editable content area (WYSIWYG) for retro-styled text and simple markup
  - background image with `tile` or `cover` display modes
  - optional public/private sections
- Render pages server-side (Express + EJS) and optionally cache to disk so nginx serves static files.
- Allow an edit mode (enabled by a cookie/session) that shows inline edit controls for the page owner.

## Why server-rendered

- Familiar pattern for contributors with PHP/WordPress background.
- Keeps service_role/API keys on server (no secrets in client `js/config.js`).
- Easier to secure and personalize content based on authentication/session.

## Data model (recommended: separate `user_profile` table)

To avoid polluting the primary `users` table, create a separate `user_profile` table that stores profile-specific data used only for the MySpace-style pages. This keeps the core `users` row small and avoids adding many nullable columns.

Recommended columns for `user_profile`:

- `user_id UUID` — FK to `users(id)` (primary key or unique)
- `profile_intro TEXT` — short intro sentence (e.g., "Loves karaoke and tacos")
- `prompt_html TEXT` — sanitized HTML produced by the WYSIWYG editor (the user's blog/answer)
- `profile_title TEXT` — optional title of the profile page (shown in `#myspaceName`)
- `prompt_title TEXT` — the question/prompt the user answered (pre-generated or custom)
- `age INTEGER` — optional age display
- `profile_bg_url TEXT` — background image (Storage URL)
- `profile_bg_mode TEXT` — 'tile'|'cover' (default 'cover')
- `favorite_song_id UUID` — FK to existing `user_favorite_song` (do not duplicate song table)
- `profile_details JSONB` — array of up to 6 plain-text label/value objects for the details card
- `is_public BOOLEAN` — whether the profile page is public (default true)
- `created_at TIMESTAMP`, `updated_at TIMESTAMP`

`profile_details` shape (example):

```
[
  { "label": "Location", "value": "Pacific Beach, WA" },
  { "label": "Occupation", "value": "Cyber DJ" }
]
```

Constraints and decisions:

- Enforce a maximum of 6 detail items server-side (and ideally with a DB CHECK): `jsonb_array_length(profile_details) <= 6`.
- Store the chosen prompt (pre-generated or custom) in `prompt_title` and store an optional `profile_title` if the user wants a separate page title. When rendering, compute the visible title as `profile_title` if present, otherwise default to `display_name` + "'s BriSpace".
- Keep `prompt_html` sanitized (DOMPurify) before writing to DB.
- `favorite_song_id` should reference the existing `user_favorite_song` (or `favorite_songs`) table rather than storing raw URLs in the profile table.

### Example SQL migration (Postgres)

```sql
CREATE TABLE user_profile (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  profile_intro text,
  profile_html text,
  age integer,
  profile_bg_url text,
  profile_bg_mode text DEFAULT 'cover',
  favorite_song_id uuid REFERENCES user_favorite_song(id),
  profile_details jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CHECK (jsonb_array_length(profile_details) <= 6)
);

CREATE INDEX ON user_profile (favorite_song_id);
```

## WYSIWYG editor recommendations

- Quill (MIT) — lightweight, widely used, good for basic rich text (bold/italic/links/lists). Easy to sanitize and store HTML.
- TinyMCE (open-core) — feature-rich, familiar to editors.
- TipTap / ProseMirror — more modern and extensible, heavier to integrate.

Recommendation: start with Quill for a simple retro editor and add a small sanitizer (DOMPurify) on save.

## Template & rendering approach

- Use EJS (or your preferred template engine) to render `templates/user.ejs` on request.
- Server route: `GET /users/:username` or `/users/:id` — fetch user from Supabase using server-side client, render template with fields: `display_name`, `headshot`, `profile_title`, `prompt_title`, `prompt_html`, `profile_bg_url`, `profile_bg_mode`, `favorite_song_id`, `profile_details`, `is_public`.
- If the user has an `edit` cookie or a valid session, render the page with edit controls (WYSIWYG editor init, upload buttons).

## Caching strategy (deferred)

For now, we will not implement proxy or disk caching. Pages will be server-rendered on request so edit flows are immediately visible and we avoid cache invalidation complexity. Caching can be added later if performance requires it; the `Implementation checklist` below is the source of truth for when and how to introduce cache layers.

## Edit flow (client)

1. User signs in and has an `edit_profile` cookie/session flag.
2. Visiting their `/users/:id` shows edit controls: `Edit`, `Upload Background`, `Save`.
3. Save posts to server endpoint `/api/users/:id/profile` which updates Supabase and triggers regeneration (or returns success and lets server write new cached html).

## Security & sanitization

- Store only sanitized HTML in `profile_html` (use `DOMPurify` server-side or client-side before saving). Strip scripts, event handlers, and iframes unless explicitly allowed.
- Keep service_role keys on the server (env vars). Use server endpoint to call Supabase when admin-level actions are required.
- Protect any private content — NEVER write private content into a public static HTML file.

## Background image handling

- Allow users to provide a URL or upload to Supabase Storage.
- Save the storage URL to `profile_bg_url` and `profile_bg_mode` to control `background-size: cover` vs tiled.

## Edit cookie / auth

- For simple edit UX, set a short-lived `edit_profile` cookie when a user authenticates. The server checks session/cookie before rendering edit controls.
- For serious security, require server-side session auth (JWT or cookie verified by server) for `/api/users/:id/profile` update endpoints.

## Operational considerations

- Disk usage: estimate ~5–50KB per profile HTML; plan cleanup for inactive or deleted accounts.
- Concurrency: use atomic temp-file write + rename to prevent partial files.
- Backups: store user profile backups or rely on Supabase backups for data stored in DB or Storage.

## Implementation checklist (source of truth)

The checklist below is the single source of truth for implementation steps. Work through items in order, mark each complete in the repo TODOs, and open PRs that reference the checklist item being implemented.

- [ ] Add DB migration for `user_profile` table (see `sql/create_user_profile.sql`)
- [ ] Install server deps: `ejs` and `@supabase/supabase-js`
- [ ] Add `templates/user.ejs` starter template and `templates/partials/` for shared fragments (guestbook, event-details card)
- [ ] Add server route `GET /users/:id` that renders `user_profile_view` and injects `window.__USER_PROFILE` for client bootstrapping
- [ ] Add secure POST `/api/users/:id/profile` that updates Supabase and validates/sanitizes input
- [ ] Integrate Quill editor for edit mode and use `DOMPurify` before saving (client + server-side validation)
- [ ] Wire client components (guestbook, headshot upload, music player) to the server-rendered containers so they can hydrate without rewrites
- [ ] Add tests: rendering, save flow, DB migration, and permission checks
- [ ] Deploy prototype to staging and run manual QA for visual parity with `event-info.html`

Optional / later (deferred):

- [ ] Add regen endpoint or background worker to write static HTML to disk (atomic write) and nginx cache rules (only if needed for scale)
- [ ] Implement proxy_cache / purge hooks for high-traffic scenarios

Follow this order to avoid jumping ahead. Each code PR should:

1. Reference the checklist item(s) it implements.
2. Include unit or integration tests where feasible.
3. Document any schema changes in `/sql/` and run migrations in staging before production.

### Example nginx snippet

```
# Serve static pages if present, otherwise proxy to Node renderer
location /users/ {
  try_files $uri $uri/ @node_users;
}

location @node_users {
  proxy_pass http://127.0.0.1:8000;
  proxy_set_header Host $host;
  proxy_set_header X-Real-IP $remote_addr;
}
```

## Notes

- Start simple: server-rendered profile pages with optional disk cache. Add more features iteratively (fonts, animations, user uploads).
- Keep private/auth flows server-only and avoid writing private data to public html files.

--
Document created to guide implementation and future you. Add more specifics (fonts, sample CSS) as we prototype.
