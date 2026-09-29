# Sidebar Media & Ads (Slot System)

## What it is

A catalog + slot system for placing retro ad creatives and interactive GIF steppers on server-rendered pages, keeping placement logic out of `server.js` and enabling the `ad_completionist` achievement.

## How it works

- **Catalog** — `js/utils/sidebar-media.js` holds all media entries with `id`, `allowedAreas` (`sidebar` | `main` — sizing/placement metadata, _not_ page targeting), and optional overlay/audio metadata. Ad creatives may set `imageMaxWidth` (e.g. `"320px"`) to constrain and center the block.
- **Slot plans** — routes decide layout per page and call `buildMediaSlots({ req, isSignedIn, slotPlan })`, receiving:
  - `slots` — selected media keyed by slot (e.g. `mainPromo`, `sidebar`)
  - `adKeys` — trackable ad IDs for completion logic
  - `anyGifStepper` — whether `gif-stepper.js` must be loaded
  - `test` — debug pagination info
- Slots can request any count (e.g. 2 sidebar ads) and support route-level forced content. Selection is **de-duplicated across the full page render**.
- **Rendering** — shared partial `templates/partials/media-slot.ejs`. `brispace.ejs` and `scoreboard.ejs` each render one `mainPromo` slot + one 2-ad sidebar slot; `friends.ejs` uses slot-based sidebar ads but keeps its scam creative hardcoded in the layout.
- **Tracking** — ad clicks recorded in localStorage key `sidebar-ads-clicked`; clicking every ID in `adKeys` triggers `ad_completionist`. Tracking initializes once per page across all slots.

## GIF steppers

Interactive click-to-advance GIFs (`js/components/gif-stepper.js`) with optional retro SFX; shared sidebar partial used on homepage and friends sidebars (no longer on profile pages — profiles use the curated profile-GIF picker instead). Completing all steppers awards `gif_master`.

## Update policy

Keep slot behavior aligned across `brispace.ejs`, `scoreboard.ejs`, `friends.ejs`; verify no-duplicate behavior across a page's slots after any catalog/selection change. New ads = new catalog entry in `sidebar-media.js`.
