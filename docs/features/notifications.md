# Notifications

## What it is

Two delivery channels sharing one data source:

1. **In-app feed** — Account Center (`/account`) shows a grouped notification inbox; the nav profile icon shows an unread badge.
2. **Web Push** — standard browser push with VAPID via the `web-push` package (Firebase is _not_ the push transport).

## How it works

### Creation & delivery

- All producers call `createAndDeliverNotification()` (`js/utils/notification-delivery.js`): persists a row in `notifications` (jsonb `payload`), then attempts push delivery to every `push_subscriptions` row for the user. Stale endpoints (404/410) are cleaned up.
- Payloads carry `type`, `title`, `body`, a **context-specific `url`** (e.g. wall posts → recipient profile `#wall-entries`, Top 8 → actor profile `#topn-display`), and optional `action_label` for per-type CTA text in Account Center.
- Producers include wall posts, challenge triggers, Top 8 additions (`routes/api-users.js`).

### Account Center feed

- Rolling **7-day window**, grouped by type in `<details>` sections, newest-first within groups (`js/pages/account.js`, `templates/account.ejs`, `css/components/account.css`).
- Group summaries show unread/total counts; **opening a group marks its unread items read**. No Unread/All toggle — history stays visible.
- Cards are full-row clickable (mouse + keyboard) and navigate to the payload `url`.

### Nav badge

Server nav middleware (`server.js`) counts unread notifications in the 7-day window → `navData.unreadNotificationCount` → badge on the profile icon in both navigation partials.

### Push subscription lifecycle

1. Client `js/services/notification-service.js` registers `sw-notifications.js` and fetches `GET /notifications/config` (VAPID public key).
2. `POST /notifications/subscribe` stores the subscription; `POST /notifications/unsubscribe` removes it.
3. Service worker shows notifications on push; clicks focus/open `notification.data.url`; `pushsubscriptionchange` re-subscribes.
4. `POST /notifications/send` = self-test; Account Center has an admin push-test form.

### Setup

```bash
npx web-push generate-vapid-keys
```

Set `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_EMAIL` server-side; the public key is also in `js/config.js` per environment.

## Verification

1. Sign in, enable notifications, confirm a `push_subscriptions` row.
2. Console helpers in `test-notification-service.js`: `testNotificationSubscription()`, `testNotificationInbox()`.
3. Trigger a social event or `POST /notifications/send`; confirm DB row + browser notification + click destination.

## Data & endpoints

Tables: `notifications`, `push_subscriptions`. Endpoints: see [../API.md](../API.md#notifications-api--routesnotificationsjs-mounted-at-notifications).

## Open TODOs (carried from original notes)

- Confirm/tighten RLS policies on `notifications` and `push_subscriptions`.
