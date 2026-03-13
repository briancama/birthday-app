# Site Inventory — Birthday Challenge Zone

Generated: 2026-03-12

Summary: This document maps top-level HTML pages, server templates, and the primary components and styles each page uses. Use this as a reference when planning refactors or extracting shared components.

---

## Pages (overview)

- index.html — Login page
  - CSS: css/geocities.css
  - Scripts: Firebase phone auth SDK
  - Notes: lightweight entry; minimal JS.

- dashboard.html — Main app dashboard
  - CSS: css/geocities.css; css/components/navigation.css; css/components/submissions.css; css/components/event-card.css; css/components/achievements.css
  - Page JS: js/pages/dashboard.js
  - Components used: navigation, challenge-card, cocktail-entry-modal, user-events-section

- event-info.html — Event details / MySpace-style profile
  - CSS: css/geocities.css; navigation.css; leaderboard.css; forms.css; myspace.css; myspace-comments.css; event-card.css; submissions.css
  - Page JS: js/pages/event-info.js
  - Components used: guestbook, myspace-comment-card, event-card, cocktail-entry-modal, ytmnd-easter-egg

- challenges-submit.html — Challenge submission workshop
  - CSS: css/geocities.css; navigation.css; leaderboard.css; submissions.css; forms.css
  - Components used: submission, gif-stepper, navigation

- leaderboard.html — Scoreboard view
  - CSS: css/geocities.css; navigation.css; leaderboard.css; forms.css
  - Page JS: js/pages/leaderboard.js (imported by an inline module script)
  - Components used: navigation

- admin-approvals.html — Admin approval tools
  - CSS: css/geocities.css; navigation.css; forms.css; submissions.css; contest-placements.css
  - Page JS: (imports initNavigation from js/components/navigation.js)
  - Components used: navigation, contest-placement-table, contest-placement-form

- cocktail-judging.html — Cocktail competition judge UI
  - CSS: css/geocities.css; navigation.css; submissions.css
  - Components used: navigation, cocktail-entry-modal

- register.html — Registration / onboarding
  - CSS: css/geocities.css; forms.css
  - Notes: standalone registration flow using Firebase SDK

- invitation.html — Static invitation / cocktail promotion
  - CSS: css/geocities.css; forms.css; invitation.css
  - Notes: includes guestbook styles; invitation-specific layout

- templates/user.ejs — Server-side user profile template
  - CSS: /css/geocities.css; /css/components/navigation.css
  - Notes: EJS template used by server routes for user pages.

---

## Components index (primary JS components)

See `js/components/` for source files. Primary components include:

- navigation.js — central site navigation + mobile menu
- challenge-card.js — challenge display / reveal card (dashboard)
- event-card.js — event/listing cards
- guestbook.js / myspace-comment-card.js — comments and guestbook UI
- cocktail-entry-modal.js — cocktail entry / judging modal
- headshot-upload.js — avatar upload and headshot event integration
- bottom-menu.js / music-player.js / mute-button.js — mobile UI + audio controls
- gif-stepper.js / submission.js — submission helpers and UIs
- contest-placement-\*.js — admin placement UI

(Full list available in docs/site-inventory.json)

---

## Quick observations / refactor candidates

- Navigation markup repeats across many HTML files; consider extracting a single `navigation.html` fragment and loading it via a small client-side include or converting to a web component.
- CSS duplication: many pages include the same `navigation.css` and `forms.css` — audit `css/components/` for duplicate rules and consolidate variables into `css/geocities.css`.
- Shared modals (cocktail entry, guestbook) appear on multiple pages — extract into a shared component module and initialize from `js/app.js` or `BasePage` to avoid per-page duplication.
- Challenge rendering (`challenge-card.js`) is a prime candidate for extraction and test coverage when refactoring dashboard flows.

---

## Next steps I can take (pick one)

- Produce a JSON inventory with per-page, per-line references (expanded) for deeper auditing.
- Create a small web-component wrapper for navigation and a minimal patch to replace repeated nav markup on 2 pages.
- Run a CSS duplicate rule scan and propose consolidated variables.

If you want me to proceed with any of the above, say which one and whether to operate in read-only proposal mode or to apply small patches automatically.
