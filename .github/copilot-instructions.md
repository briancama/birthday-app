# EventInfoPage & New Page Conventions (2026 Update)

## New Page/Component Rules

- All pages must extend BasePage (js/pages/base-page.js) for lifecycle, event handling, and UI updates.
- Use appState for all user/session/auth state and event-driven updates.
- Render UI via component classes or functions—no direct DOM manipulation or inline scripts.
- Move all custom styles to CSS files (no inline styles).
- Use EventTarget/event-driven architecture for component communication.
- Clean up all event listeners in cleanup().
- Document new shared patterns in copilot-instructions.md before implementation.

## Example: EventInfoPage

- See js/pages/event-info.js for BasePage inheritance, appState usage, and componentized event cards.
- All custom styles in css/components/event-info.css.
- event-info.html renders via EventInfoPage class, not inline HTML.

## Migration Guidance

- Refactor legacy pages to follow these conventions as features are updated.
- New features/components must follow this pattern for maintainability and consistency.

### Module Import/Export Consistency

For all shared modules (e.g., navigationController, appState, EventBus):

- Always use named exports in the module file.
- Always use named imports in consuming files/pages.
- Example:
  - In js/components/navigation.js:
    export { navigationController };
  - In HTML or JS:
    import { navigationController } from './js/components/navigation.js';
- Do not use default exports for shared modules.
- Ensure the export statement is present in the module file before importing.
- If you need a singleton, export the instance (not the class).

# Unified Code Design Pattern (2026 Update)

## AppState Singleton

All authentication, user, and session state is managed by `appState` (from js/app.js). All pages and components must use `appState.getCurrentUser()`, `appState.getUserId()`, and `appState.getSupabase()` for state access.

## Event-Driven Architecture

All state changes (user loaded, error, logout) are communicated via events. Use `appState.on(eventType, handler)` for subscriptions and always clean up listeners in `cleanup()`.

## BasePage Inheritance

All pages must extend `BasePage` (js/pages/base-page.js), which handles initialization, event subscriptions, and lifecycle. Override `onReady()` for page-specific logic.

## Component Communication

Use EventBus and custom events for all cross-component/page communication. Avoid direct parent-child references.

## Centralized Error Handling

Use `showError()` and `showSuccess()` from BasePage for all user-facing feedback. Do not implement custom error UIs in individual pages.

## UI State Updates

Use provided methods (`setPageTitle`, `updateMarqueeUsername`) for all page-level UI changes. Do not duplicate these in child pages.

## No Direct DOM Manipulation

All DOM updates must go through component/page render methods or APIs.

## Lifecycle Management

Always implement and call `cleanup()` in pages/components to remove event listeners and intervals.

### Global Component Update Policy (2026)

**Global Navigation & Mobile Menu:**

- Any changes to navigation markup, mobile menu treatment, or navigation logic must be applied to ALL pages and components that use navigation.
- Navigation markup and logic are defined in js/components/navigation.js and must be kept consistent across dashboard.html, challenges-submit.html, leaderboard.html, invitation.html, admin-approvals.html, event-info.html, and any new pages.
- When updating navigation or global components, always update all relevant HTML files and shared JS modules.
- Document the global update pattern in copilot-instructions.md before implementation.
- For mobile menu: default is closed, users must open via toggle, and markup/classes must match across all pages.

**Instructions for Contributors:**

- When making changes to navigation or global UI components, search for all usages and update them globally.
- Confirm consistency in markup, CSS, and JS logic for navigation and mobile menu.
- Add a note in copilot-instructions.md describing the update and affected files/components.

### Brispace Visitor Navigation Split (2026)

- Brispace visitor surfaces use a dedicated partial: `templates/partials/navigation-visitor.ejs`.
- This split currently applies to:
  - `templates/brispace.ejs`
  - `templates/friends.ejs`
  - `templates/user.ejs`
  - `templates/scoreboard.ejs`
- Keep `templates/partials/navigation.ejs` for participant/event app surfaces (dashboard/challenges/event-info/admin/cocktail pages).
- The visitor partial intentionally keeps visitor-first menu items with reduced participant-specific branching.
- If global navigation shell/markup changes (logo/header/toggle structure), update both partials to avoid drift unless the divergence is intentional.

### Account Center + Notification Badge (2026)

- The top-right `profile-nav-link` now routes to `/account` (Account Center) instead of directly to `/users/:username`.
- `/account` is the signed-in hub for notification inbox + account-facing surfaces (including the dashboard-style achievements section).
- Unread notification state is represented in navigation via `navData.unreadNotificationCount` and rendered as a small badge on the profile icon.
- Any changes to profile icon destination, unread badge markup, or unread count hydration must be applied to both:
  - `templates/partials/navigation-visitor.ejs`
  - `templates/partials/navigation.ejs`
- Keep server-side nav hydration in `server.js` aligned with badge rendering expectations.

### Notification Action Destinations (2026)

- Notification payloads should include a context-specific `url` whenever possible so both Account Center links and Web Push clicks land on the relevant surface.
- Use section anchors for profile-context notifications:
  - Wall post notifications should target the recipient profile wall (`#wall-entries`).
  - Top 8 notifications should target the actor profile Top 8 section (`#topn-display`).
- Use optional `action_label` in notification payload data for per-type CTA text in Account Center (fallback remains generic).
- Keep producer routes (`routes/api-users.js`) and Account rendering (`js/pages/account.js`) aligned so action labels and destinations stay consistent.

### Account Notification Center Grouping (2026)

- The Account Center notification feed is compact and grouped by notification type using `<details>` sections.
- The feed shows a rolling 7-day window of notifications (newest-first within each type group).
- Group summaries show unread/total counts and items remain newest-first within each group.
- Read behavior is group-open based: opening a type group marks unread notifications in that group as read.
- Notification cards are full-row clickable (mouse + keyboard) and should navigate to the contextual destination URL.
- The Account feed no longer uses an Unread/All toggle; recent history remains visible after read state changes.
- Keep this behavior aligned between `templates/account.ejs`, `css/components/account.css`, and `js/pages/account.js`.

### Brispace Achievement Leaderboard Scope (2026)

- `achievements.is_visitor_eligible` controls whether an achievement counts toward Brispace rank.
- Keep participant-only achievements (`all_assigned_completed`, `first_challenge`, `three_challenges`, `the_challenger`) excluded from Brispace ranking unless requirements change.
- No schema change is required in `user_achievements` for this split; filtering happens via the achievement catalog flag and leaderboard view.

### Slot-Based Media System (2026 Ads & GIFs)

**Purpose:** Keep ad/GIF catalog and placement logic out of `server.js`, and allow routes/templates to choose where media appears via slot plans.

**Behavior:**

- Media catalog lives in `js/utils/sidebar-media.js`.
- Catalog metadata is **area-based** (for sizing/placement) via `allowedAreas` such as `sidebar` or `main`.
- Catalog metadata is **not page-targeted**; routes decide slot layout per page.
- Slot selection is done by `buildMediaSlots({ req, isSignedIn, slotPlan })`.
- A slot can request any count (example: 2 sidebar ads) and supports route-level forced content.
- Selection is de-duplicated across the full page render so the same media item does not appear in multiple slots.

**Server Integration:**

- Routes pass a slot plan (for example `mainPromo` and `sidebar`) and receive:
  - `slots` (selected media by slot key)
  - `adKeys` (trackable ad IDs for completion logic)
  - `anyGifStepper` (whether `gif-stepper.js` is needed)
  - `test` (debug test pagination info)
- Keep route files focused on content/query logic; avoid embedding media-catalog arrays in `server.js`.

**Template Integration:**

- Shared slot rendering lives in `templates/partials/media-slot.ejs`.
- `templates/brispace.ejs` and `templates/scoreboard.ejs` each render:
  - one `mainPromo` slot in `myspace-main`
  - one `sidebar` slot configured for two ads
- `templates/friends.ejs` keeps the scam creative explicitly in the page layout (not via catalog metadata), and uses slot-based ads in the sidebar.

**Tracking + Achievement:**

- Click tracking uses media/ad IDs with localStorage key `sidebar-ads-clicked`.
- `ad_completionist` is triggered when all catalog ad keys in `adKeys` have been clicked.
- Tracking is initialized once per page and applies across all rendered slots.

**Global Update Policy:**

- Keep shared slot behavior aligned across `templates/brispace.ejs`, `templates/scoreboard.ejs`, and `templates/friends.ejs`.
- If slot rendering, catalog metadata, or selection behavior changes, verify no-duplicate behavior across all slots on a page.
- For ad additions/edits, update `js/utils/sidebar-media.js` catalog entries with `id`, `allowedAreas`, and any overlay/audio metadata.
- Ad creatives can optionally include `imageMaxWidth` (for example `"320px"`); when set, slot rendering constrains and centers the media block in the container.
- Catalog entries can include `pinUntil: "YYYY-MM-DD"` to be placed first in every matching slot (area/type/audience) through that date; after it, the entry is dropped from the catalog entirely (rotation and `adKeys`), so it never blocks `ad_completionist`.

### Walktober (2026)

October step-logging event at `/walktober` (Brispace layout, `theme-walktober` body class).

- Schema: `sql/2026_10_03_walktober.sql` — `walktober_seasons` (one row per year; dates, `edit_until`, `min_goal`, `closed_at`), `walktober_participants` (year + user + `daily_goal`), `walktober_entries` (one row per user per day), `walktober_totals` view. RLS on with no policies; all access goes through `routes/api-walktober.js` (service role + signed cookie).
- A row with `steps = 0` is a logged zero; no row means unlogged. Clearing a day deletes the row.
- Setting a goal = joining. The goal can change until the first entry exists, then it's locked (server-enforced, 409).
- Entries are editable for any season day up to "today" (server cap = UTC+14 date) until `edit_until` or until the season is closed.
- Goal progress % = total ÷ (goal × days in season); daily average shown = total ÷ days logged.
- Community lists and medal ranking include every walker (published or not); names only link to `/users/:username` when the profile is published.
- Sidebar crew box: Most steps Top 4 (medals for 1–3, "you" row appended if outside), then "Latest Big Stepper": the latest day with a leader, up to the viewer's local yesterday, switching over at 10am local (`LEADER_SWITCH_HOUR` in `js/pages/walktober.js`), capped at `ends_on`, hidden until a leader exists. Both link to the full leaderboard.
- Daily top walkers come from the `walktober_daily_leaders` view (`sql/2026_10_03_walktober_daily_leaders.sql`). Ties all get the day; days where everyone logged 0 have no leader. "Days on top" shows in Your numbers only when ≥ 1.
- `/walktober/leaderboard` (template `walktober-leaderboard.ejs`, page `js/pages/walktober-leaderboard.js`, API `GET /api/walktober/:year/leaderboard`) shows full Most steps + Goal progress boards for everyone who joined; unlogged walkers sit at the bottom of Most steps with no place.
- List row markup is shared via `js/components/walktober-lists.js`.
- Achievements are per-year keys: `walktober_<year>_gold|silver|bronze` (dense rank by total steps, ties share) and `walktober_<year>_goal_average` (total ≥ goal × days). Awarded only by the admin "Close Walktober" action (`POST /api/walktober/:year/close`), which is idempotent and sends `walktober_award` notifications.
- Exception: `walktober_<year>_streak_7` ("Count von Count", `sql/2026_10_04_walktober_streak_achievement.sql`) is checked on every step save. It needs 7 consecutive season days, each first logged on time (`created_at` < `step_date` + 2 days UTC, so next-day logging counts and backfills don't). The PUT response returns `achievement` when newly earned and the page emits `achievement:awarded` for the toast. It also adds a `walktober_award` inbox notification (no push). Next year needs a new achievement row.
- New year = new SQL file inserting a season row + the four achievement rows. No code change needed.
- Halloween gifs live in `images/walktober/`.
- `isAdminUser(userId)` lives in `js/utils/server-utils.js` for server-side admin checks.
- Initial data ships with the HTML: `renderWalktober` (server.js) calls `buildSeasonPayload` / `buildLeaderboardPayload` (exported from `routes/api-walktober.js`) and embeds the result as `<script type="application/json" id="walktoberData">` via `jsonForScript()`. Pages read it in the constructor and the template calls `page.render()` before `await page.init()`, so nothing waits on Firebase/auth. The GET APIs return the same shapes and are used only to refresh after edits.
- The server decides which sections are visible from the payload (no `hidden` flip on load). JS-filled slots start with `partials/walktober-loading.ejs`; `walktober.css` holds their space with `--wt-*-reserve` knobs (applied via `:has(> .wt-loading)`), and the calendar reserve follows `data-weeks`.
- Walktober templates don't include the Firebase `<script>` tags; they `preload` them and `firebaseAuth.init()` loads the SDK on demand. `firebaseAuth.init()` only runs once per page (cached promise).
- Hidden "David S Pumpkins" egg (`js/components/david-pumpkins.js`, achievement `david_pumpkins`, `sql/2026_10_04_add_david_pumpkins_achievement.sql`): any `[data-pumpkin-gif]` on `/walktober` plays a dance track on click (zombie = hero right gif, frank = calendar's first blank Tuesday, skull = crew box, werewolf = Your numbers). Signed-in progress lives in localStorage per user; once all four are found and a track ends, David rises (stays until clicked), his clip plays, and the achievement is awarded. Plays once per user. Placement/size knobs are `--wt-*` vars in `walktober.css`.

### Request Pipeline Performance (2026)

- `/css`, `/js`, `/images`, `/fonts`, `/audio`, `/songs` are served by `express.static` at the top of server.js, before dev auto-login and nav hydration. Images/fonts/audio/songs get `Cache-Control: max-age=1d` (`ASSET_CACHE_MAX_AGE`).
- Nav hydration (`res.locals.navData`) skips `/api`, `/auth`, `/notifications`, and any non-`.html` file path (`wantsNavData()`). Only page renders read `navData`.
- New asset folders must be added to the early static list, or every request for them pays the nav Supabase lookups.
- The project root is not served wholesale: only top-level `*.html` files plus `PUBLIC_ROOT_FILES` (`robots.txt`, `sw-notifications.js`) in server.js. New public root files must be added there or they 404.

---

### Rules for New Updates

- All new pages/components must follow the BasePage inheritance and event-driven pattern.
- Any new shared logic must be added to BasePage or a shared utility, not duplicated.
- All user/session/auth logic must go through appState.
- All error/success UI must use the centralized methods.
- All event listeners must be cleaned up in cleanup().
- Document any new shared patterns in copilot-instructions.md before implementation.

## Profile GIF Selection & Sidebar Stepper Reuse (2026)

- Profile pages support a curated user-selected GIF stored on `user_profile.profile_gif_key` and exposed via `user_profile_view`.
- Owners always see the profile GIF picker UI on their own profile, even when no GIF is selected.
- Non-owners see the selected profile GIF when one is set; if none is selected, no GIF block renders for non-owners.
- The clickable GIF stepper is no longer rendered on profile pages.
- GIF stepper markup is shared through a reusable sidebar partial and used as an optional component on homepage and friends sidebars.
- Keep GIF catalog keys stable across client/server/template usage to preserve saved user selections.

## Profile Background Picker (2026)

- User profile pages support owner-managed background selection using assets from `images/backgrounds`.
- The picker UI is owner-only and compact by default: a top-right `Pick Background` button opens a small floating panel.
- Background options are auto-discovered server-side from `images/backgrounds` and passed to `templates/user.ejs`; avoid hardcoding file lists in client JS.
- Saved values persist via `PATCH /api/users/:id/profile-fields` using `profile_bg_url` and `profile_bg_mode`.
- `profile_bg_url` must be an app-owned path under `/images/backgrounds/`; API allow-list validation enforces this.
- Profile background selections are tiled (`profile_bg_mode: 'tile'`) for this feature.

## Profile Theme Tokens From Backgrounds (2026)

- The selected `profile_bg_url` now drives a lightweight theme mode for profile pages (`body.has-profile-theme`) instead of only painting the page background.
- Theme visuals are tokenized with CSS custom properties: section background, section text, section border (2px), heading background/text, detail row background, and link colors.
- In themed mode, the white `myspace-layout` shell is removed so background personality remains visible on mobile and desktop.
- `myspace-section` surfaces receive `padding: 0.5rem` in themed mode to avoid edge-clipped content.
- Keep template and client token resolution logic aligned so persisted render and picker live preview match.
- Owner-only edit controls must be gated at template render time (not only CSS-hidden), and edit buttons should be in normal flow at section bottom-right rather than absolutely positioned.

## Headshot Upload & Event-Driven Avatar Updates (2026)

### Headshot Upload Pattern

- Headshot uploads are handled by HeadshotUpload (js/components/headshot-upload.js).
- On successful upload, a CustomEvent 'user:headshot-updated' is dispatched on window with `{ userId, headshotUrl }`.
- All avatar images use `data-headshot="user-{userId}"` for targeting.
- BasePage (js/pages/base-page.js) listens for 'user:headshot-updated' on window and updates all matching images.
- No child page/component should register its own headshot update listener; BasePage handles this globally.

### Comments Functionality (EventInfoPage)

- Comments are rendered in EventInfoPage (js/pages/event-info.js) using guestbook entries from Supabase.
- Each comment avatar uses `data-headshot="user-{userId}"` if user_id is present, or a fallback avatar otherwise.
- Avatar updates propagate automatically via the headshot event system.
- Comments are submitted via Guestbook component (js/components/guestbook.js), with error/success feedback using BasePage methods.
- Legacy comments (no user_id) use fallback avatars, newest user comments use headshot avatars.

### Migration Guidance

- When adding new avatar images, always use `data-headshot="user-{userId}"`.
- For new comment features, ensure avatars follow the same pattern for event-driven updates.
- Document any new event-driven avatar logic here before implementation.

# GitHub Copilot Instructions

## Project Overview

Birthday Challenge Zone - A retro GeoCities-style weekend event app with progressive challenge unlocking, Brian-mode competitions, and live scoreboards. Built with vanilla HTML/CSS/JS frontend and Supabase backend.

## Architecture Pattern

### Core Application State

- **Global State**: `js/app.js` exports singleton `appState` managing Supabase client, user auth, and state subscriptions
- **Page Classes**: Inherit from `BasePage` (`js/pages/base-page.js`) for consistent initialization and Supabase access
- **Components**: Functional classes like `ChallengeCard` and Web Components like `SiteNavigation`
- **Module System**: ES6 modules with absolute imports from workspace root

### Authentication Flow

Username-only auth (no passwords) stored in localStorage:

```javascript
// Check auth in any page
this.userId = appState.getUserId(); // from localStorage
this.currentUser = appState.getCurrentUser(); // loaded from Supabase
```

### Database Integration

- **Supabase Client**: Single instance via `appState.getSupabase()`
- **Environment Switching**: Automatic dev/prod config in `js/config.js` based on hostname
- **Key Tables**: users, challenges, assignments, competition_placements, cocktail_competitions, cocktail_entries, cocktail_votes
- **View**: scoreboard (aggregates points from assignments + competitions)
- **SQL Documentation Rule**: **CRITICAL** - All database schema changes, migrations, and RLS policies MUST be documented in `/sql/` folder before implementation. Every table creation, policy addition, or schema modification requires a corresponding SQL file for version control and environment replication.

## Development Conventions

### GeoCities Aesthetic Requirements

- **NO MODERN EMOJIS FOR DECORATION**: Emojis are acceptable in buttons/interactive elements for functional purposes, but avoid using them as decorative content elements. Prioritize retro gifs that can be found in our /images folder or use retro text emojis or ASCII art
- **CSS Variables**: All colors/spacing in `:root` of `css/geocities.css`
- **Retro Elements**: Marquees, flame dividers, rainbow text, construction gifs
- **File Structure**: `/css/`, `/js/`, `/images/` organization

### JavaScript Patterns

- **Component State**: Pass state objects to component methods, don't store in component instances
- **Event Handling**: Components use callback pattern - `setOnReveal()`, `setOnComplete()`
- **Loading States**: Use `setLoadingState(elementId, isLoading)` from BasePage
- **Error Handling**: Always include try/catch with user-friendly error display

### Challenge System Architecture

- **Progressive Unlock**: Users can only see/complete challenges in sequence
- **Brian Mode**: Special challenges tagged 'vs' or 'with' that auto-assign to 'brianc' user
- **Reveal Mechanic**: Titles show as "Challenge N" until clicked/completed
- **Competition vs Assigned**: Two different challenge types with different scoring

## Key Files & Their Roles

### Entry Points

- [`index.html`](index.html) - Login page with username-only auth
- [`dashboard.html`](dashboard.html) - Main user interface, loads `DashboardPage`
- [`leaderboard.html`](leaderboard.html) - Scoreboard display

### Core JavaScript

- [`js/app.js`](js/app.js) - Global state manager, Supabase client, user auth
- [`js/config.js`](js/config.js) - **GITIGNORED** Supabase credentials with env detection
- [`js/pages/base-page.js`](js/pages/base-page.js) - Base class for all pages with common utilities
- [`js/components/navigation.js`](js/components/navigation.js) - Web Component for site navigation

### Development Workflow

1. **Local Server**: Use Node.js Express server for reliability: `node server.js` (see docs/LOCAL_SERVER_SETUP.md).
2. **Config Setup**: Copy and modify `js/config.js` with your Supabase credentials
3. **Supabase Setup**: Run SQL from project docs to initialize database schema
4. **File Editing**: Use absolute paths from workspace root in all imports

## Brian Mode Challenge Pattern

When completing challenges marked with `brian_mode: 'vs'` or `brian_mode: 'with'`:

```javascript
// Auto-create assignment for brianc user with inverse outcome (vs) or same outcome (with)
const brianOutcome = brianMode === "vs" ? (outcome === "success" ? "failure" : "success") : outcome;
```

## Event System Architecture (Modern Implementation)

## Component Patterns & Lifecycle

### Two Component Architectures

1. **Functional Components**: (`ChallengeCard`) - EventTarget-based factories
   - Extend EventTarget for native event emission
   - Stateless - receive state objects via `create(state)` method
   - Event handling via `addEventListener('reveal', handler)`

2. **Web Components**: (`SiteNavigation`) - Custom elements extending HTMLElement
   - Use `connectedCallback()` for initialization
   - Subscribe to appState: `appState.on('user:loaded', handler)`
   - Clean up in `disconnectedCallback()` with stored cleanup functions

### Modern Component Lifecycle Pattern

```javascript
// Functional components (ChallengeCard) - EventTarget pattern
class ChallengeCard extends EventTarget {
  constructor() {
    super(); // EventTarget capabilities
    Object.assign(this, EventTarget.prototype);
    EventTarget.call(this);
  }
  addEventListeners(element, state) {
    element.addEventListener('click', () => {
      this.dispatchEvent(new CustomEvent('reveal', { detail: { assignmentId } }));
    });
  }
}

// Web components (SiteNavigation) - Modern event subscription
connectedCallback() -> setupEventListeners() -> render() -> store cleanup functions
setupEventListeners() -> appState.on('user:loaded', handler) -> store cleanup
disconnectedCallback() -> this.eventCleanup.forEach(cleanup => cleanup())
```

### State Management Rules

- **No Internal State**: Components don't store state, always receive it as parameters
- **Event System**: Modern EventTarget-based communication via `EventBus.instance`
- **AppState Events**: `appState.on('user:loaded', handler)` for user lifecycle
- **Component Events**: Direct event listeners on component instances
- **Global Events**: `EventBus.EVENTS.CHALLENGE.COMPLETE` for cross-component coordination
- **Legacy Support**: Old `.subscribe()` pattern still works with deprecation warnings

### Event Debugging

- **Development Tools**: `debugEvents()` in console shows event history
- **Event Logging**: All events logged in development environment
- **Error Boundaries**: Components emit error events for centralized handling

### Event Handling Best Practices

- **Immediate UI Feedback**: Disable buttons before async operations
- **Error Recovery**: Reset UI state on errors, allow retry
- **Global + Local Events**: Use both component events and EventBus as needed
- **Immediate UI Feedback**: Disable buttons, show "Processing..." before async operations
- **Error Recovery**: Reset button state on failure, allow retry
- **Event Cleanup**: All components track and clean up event listeners on destroy
- **Rich Context**: Events include DOM elements, original data, and action context

### Migration Status

- **Backward Compatibility**: Legacy callbacks still work but show deprecation warnings
- **Event + Callback**: During transition, both patterns work simultaneously
- **Modern Preferred**: New code should use event listeners exclusively

### Two Component Architectures

1. **Functional Components**: (`ChallengeCard`) - Class-based factories that create DOM elements
   - No inheritance from HTMLElement
   - Stateless - receive state objects via `create(state)` method
   - Event handling via callback pattern: `setOnReveal()`, `setOnComplete()`

2. **Web Components**: (`SiteNavigation`) - Custom elements extending HTMLElement
   - Use `connectedCallback()` for initialization
   - Subscribe to global state: `appState.subscribe()`
   - Clean up in `disconnectedCallback()`

### Component Lifecycle Pattern

```javascript
// Functional components (ChallengeCard)
const card = new ChallengeCard(assignment, index, options)
  .setOnReveal(callback)
  .setOnComplete(callback);
const element = card.create(state); // Pure function, no side effects

// Web components (SiteNavigation)
connectedCallback() -> render() -> addEventListeners() -> subscribe to appState
```

### State Management Rules

- **No Internal State**: Components don't store state, always receive it as parameters
- **Complete Re-renders**: Components replace entire innerHTML then re-attach listeners
- **State Objects**: Pass complete state objects to avoid prop drilling:
  ```javascript
  const state = { isCompleted, outcome, brianMode, isRevealed, canReveal, isLocked };
  ```

### Event Handling Patterns

- **Callback Registration**: Components accept callbacks during setup
- **Event Delegation**: Use `addEventListener` after each render
- **Cleanup**: Always remove listeners in disconnectedCallback or cleanup methods

## Component Communication

- **Global State**: `appState.subscribe(callback)` for cross-component communication
- **Parent-Child**: Pass callbacks down, call them up (no direct child->parent refs)
- **Sibling Communication**: Through shared parent state updates
- **Page Lifecycle**: Pages manage component state and coordinate updates

## Server Process (operations summary)

- Runtime: Node.js + Express serves static pages and API routes (routes live under `/routes`). The server uses EJS views for some pages and serves the client JS from `/js`.
- Auth flow: clients use the Firebase client SDK (phone OTP) to obtain an ID token which they POST to `/auth/login`. The server verifies the token with `firebase-admin` (requires a service account/credentials) and then looks up or creates a Supabase `users` row. On success the server sets a signed, `httpOnly` cookie `user_id` used for server-side gating of edit routes.
- Database: the server uses a Supabase client created with `SUPABASE_SERVICE_ROLE` (keep secret) to query tables and views (notably `user_profile_view` used by profile routes). All DB schema changes and view definitions must be stored in `/sql` and applied to the Supabase project.
- Deployment: the Node app is run via `systemd` (service unit) behind nginx (TLS via Certbot). Environment variables are loaded from an EnvironmentFile referenced by the systemd unit; values must be plain `KEY=VALUE` lines (no surrounding quotes). After changing env or unit files run `sudo systemctl daemon-reload && sudo systemctl restart birthday-app` and tail logs with `sudo journalctl -u birthday-app -f`.

Short checklist for operators

- Ensure the Droplet has the Firebase service account available to the service process (set `FIREBASE_SERVICE_ACCOUNT` with JSON or set `GOOGLE_APPLICATION_CREDENTIALS` to a secured path).
- Ensure `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE` are present in the EnvironmentFile used by systemd.
- Run `npm ci --omit=dev` as the service user (not root) before starting the service to install production deps.
- If `/auth/me` or profile routes return errors, inspect `journalctl -u birthday-app` for Supabase errors (missing views/tables) or Firebase token verification errors.

Operational to-dos (quick reference)

- Restart Node service after deploy: `sudo systemctl daemon-reload && sudo systemctl restart birthday-app`
- Add Firebase service account / env vars to the Droplet's EnvironmentFile
- Run `npm ci` as the `birthday` service user if adding packages

Add any additional deployment notes here so future contributors can resume operations quickly.

## Suggested Improvements

### 1. Event System Enhancement

Replace callback pattern with custom events for better decoupling and debugging.

**Current Callback Pattern Issues:**

```javascript
// Current: Tight coupling, hard to debug, single listener
const card = new ChallengeCard(assignment, index, options)
  .setOnReveal(callback)
  .setOnComplete(callback);
```

**Proposed Custom Event System:**

```javascript
// Enhanced: Decoupled, multiple listeners, better debugging
class ChallengeCard extends EventTarget {
  create(state) {
    const element = document.createElement("div");
    // ... render logic
    this.addEventListeners(element, state);
    return element;
  }

  addEventListeners(element, state) {
    if (canReveal) {
      element.addEventListener("click", () => {
        this.dispatchEvent(
          new CustomEvent("reveal", {
            detail: {
              assignmentId: this.assignment.id,
              challengeId: this.assignment.challenges.id,
              element: element,
            },
          })
        );
      });
    }

    element.querySelectorAll("button").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        this.dispatchEvent(
          new CustomEvent("complete", {
            detail: {
              assignmentId: this.assignment.id,
              challengeId: this.assignment.challenges.id,
              outcome: btn.dataset.outcome,
              brianMode: this.assignment.challenges.brian_mode,
              element: element,
              button: btn,
            },
          })
        );
      });
    });
  }
}

// Usage in dashboard:
const card = new ChallengeCard(assignment, index, options);
card.addEventListener("reveal", (e) => {
  const { assignmentId, element } = e.detail;
  this.revealedChallengeId = assignmentId;
  this.loadChallenges();
});

card.addEventListener("complete", async (e) => {
  const { assignmentId, challengeId, outcome, brianMode, button } = e.detail;
  button.disabled = true; // Immediate UI feedback
  try {
    await this.markChallengeComplete(assignmentId, challengeId, outcome, brianMode);
    this.revealedChallengeId = null;
    await Promise.all([this.loadChallenges(), this.loadPersonalStats()]);
  } catch (err) {
    button.disabled = false;
    this.showError("Failed to mark complete: " + err.message);
  }
});
```

**Event Error Handling & Debugging:**

```javascript
// Enhanced error handling with events
class DashboardPage extends BasePage {
  async onReady() {
    // Set up error boundaries for events
    this.addEventListener("error", this.handleComponentError.bind(this));

    // Challenge event listeners with error handling
    document.addEventListener("challenge:complete", async (e) => {
      const { assignmentId, challengeId, outcome, brianMode, button } = e.detail;

      try {
        button.disabled = true;
        button.textContent = "Processing...";

        await this.markChallengeComplete(assignmentId, challengeId, outcome, brianMode);

        // Success feedback
        this.dispatchEvent(
          new CustomEvent("challenge:completed-success", {
            detail: { assignmentId, outcome },
          })
        );
      } catch (error) {
        // Error feedback with recovery
        button.disabled = false;
        button.textContent = button.dataset.originalText || "RETRY";

        this.dispatchEvent(
          new CustomEvent("challenge:completed-error", {
            detail: { assignmentId, error: error.message },
          })
        );
      }
    });
  }

  handleComponentError(e) {
    console.error("Component Error:", e.detail);
    this.showError(`Something went wrong: ${e.detail.message}`);

    // Optional: Send to analytics/logging service
    // Analytics.track('component-error', e.detail);
  }
}

// Development event debugging
if (process.env.NODE_ENV === "development") {
  // Log all events for debugging
  document.addEventListener("*", (e) => {
    if (e.type.includes(":")) {
      console.log(`🎯 Event: ${e.type}`, e.detail);
    }
  });

  // Event listener audit
  window.debugEvents = () => {
    console.table(getEventListeners(document));
  };
}
```

**Migration Strategy from Callbacks:**

```javascript
// 1. Add EventTarget mixin to existing components
class ChallengeCard {
  constructor(assignment, index, options = {}) {
    // Add event capabilities
    Object.assign(this, EventTarget.prototype);
    EventTarget.call(this);

    // Keep existing callback properties for backward compatibility
    this.onReveal = null;
    this.onComplete = null;
  }

  // 2. Emit events AND call callbacks during transition
  addEventListeners(card, state) {
    if (!isCompleted && canReveal && !isRevealed) {
      card.addEventListener("click", () => {
        // New: Emit event
        this.dispatchEvent(
          new CustomEvent("reveal", {
            detail: { assignmentId: this.assignment.id },
          })
        );

        // Legacy: Still call callback for compatibility
        this.onReveal?.(this.assignment.id);
      });
    }
  }

  // 3. Gradually migrate pages to use events
  // Keep setOnReveal for backward compatibility but mark deprecated
  setOnReveal(callback) {
    console.warn('setOnReveal is deprecated, use addEventListener("reveal", handler)');
    this.onReveal = callback;
    return this;
  }
}
```

```javascript
// js/events/event-bus.js - Global event coordinator
class EventBus extends EventTarget {
  static instance = new EventBus();

  // Typed event dispatching with validation
  emit(eventType, detail) {
    console.log(`🎯 Event: ${eventType}`, detail);
    this.dispatchEvent(new CustomEvent(eventType, { detail }));
  }

  // Namespaced event types for organization
  static EVENTS = {
    CHALLENGE: {
      REVEAL: "challenge:reveal",
      COMPLETE: "challenge:complete",
      UPDATED: "challenge:updated",
    },
    USER: {
      LOADED: "user:loaded",
      STATS_UPDATED: "user:stats-updated",
    },
    NAVIGATION: {
      PAGE_CHANGE: "nav:page-change",
    },
  };
}

// Usage in components:
import { EventBus } from "../events/event-bus.js";

// In ChallengeCard:
this.dispatchEvent(new CustomEvent("complete", { detail, bubbles: true }));
// Or global: EventBus.instance.emit(EventBus.EVENTS.CHALLENGE.COMPLETE, detail);

// In DashboardPage:
EventBus.instance.addEventListener(EventBus.EVENTS.CHALLENGE.COMPLETE, (e) => {
  this.handleChallengeComplete(e.detail);
});
```

**Event-Driven State Updates:**

```javascript
// AppState becomes event-driven
class AppState extends EventTarget {
  async loadUserProfile() {
    try {
      const userData = await this.supabase.from('users')...;
      this.currentUser = userData;

      // Emit instead of direct subscriber calls
      this.dispatchEvent(new CustomEvent('user:loaded', {
        detail: this.currentUser
      }));
    } catch (error) {
      this.dispatchEvent(new CustomEvent('user:error', {
        detail: { error, action: 'loadProfile' }
      }));
    }
  }
}

// Components listen directly to AppState
// js/components/navigation.js
connectedCallback() {
  appState.addEventListener('user:loaded', (e) => {
    this.setCurrentUser(e.detail);
  });

  appState.addEventListener('user:error', (e) => {
    console.error('User error:', e.detail.error);
    if (e.detail.action === 'loadProfile') {
      this.showAuthError();
    }
  });
}
```

### 2. State Normalization

Introduce state shape validation and normalization:

```javascript
// Add to BasePage or utility
validateComponentState(state, requiredKeys) {
  return requiredKeys.every(key => state.hasOwnProperty(key));
}
```

### 3. Component Registry

Create component factory for consistent initialization:

```javascript
// js/components/registry.js
export const createComponent = (type, props, options) => {
  const constructors = { ChallengeCard, SiteNavigation };
  return new constructors[type](props, options);
};
```

### 4. Lifecycle Management

Add proper cleanup tracking in BasePage:

```javascript
addComponent(component) {
  this.components = this.components || [];
  this.components.push(component);
}
cleanup() {
  this.components?.forEach(c => c.cleanup?.());
}
```

## CSS Architecture

- **Layer System**: `@layer reset, base, containers, components, utilities`
- **Utility Classes**: `.rainbow-text`, `.construction-gif`, `.flame-divider`
- **Component CSS**: Separate files in `css/components/` for reusable components
- **Responsive**: Mobile-first with hamburger navigation

## Common Gotchas

- Always use absolute file paths in tools - workspace is `/Users/brian.cama/Projects/birthday-app/`
- `js/config.js` is gitignored - create from examples in README
- Components re-render completely - re-attach event listeners after innerHTML changes
- Brian mode logic: 'vs' = inverse outcome, 'with' = same outcome for brianc user
- Progressive challenge reveal: only current incomplete challenge can be revealed
