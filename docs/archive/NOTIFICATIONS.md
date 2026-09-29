NOTIFICATIONS - Setup Notes

Overview

- This document describes the standard Web Push setup used in this app:
  - client service worker (`sw-notifications.js`)
  - client-side subscription management (`js/services/notification-service.js`)
  - server routes (`routes/notifications.js`)
  - shared delivery helper (`js/utils/notification-delivery.js`)
  - DB tables (`sql/2026_03_09_add_push_subscriptions.sql`)

Firebase Admin

- Firebase is not the push transport for this implementation.
- The app uses standard browser Web Push with VAPID + the `web-push` npm package.
- Firebase can still exist elsewhere in the app for authentication/runtime concerns, but it is not the browser notification delivery channel.

VAPID keys (web push)

- Generate VAPID keys with the web-push package:

```bash
npx web-push generate-vapid-keys
```

- Store public and private keys as env vars:
  - VAPID_PUBLIC_KEY
  - VAPID_PRIVATE_KEY
- Store a contact email for VAPID identification:
  - VAPID_EMAIL
- Serve the public key to clients so they can register subscriptions.

Server considerations

- The server route `routes/notifications.js` uses `requireSignedUser(req)` to get the signed user_id cookie and `getSupabase()` for DB access.
- Notification persistence + optional Web Push delivery are centralized in `js/utils/notification-delivery.js`.
- `POST /notifications/send` is restricted to the signed-in user's own notification testing path and is mainly for verification/self-testing.
- Delivery failures for stale endpoints should be cleaned up automatically on `404`/`410` push responses.
- Add proper RLS policies in Supabase to prevent unauthorized access (see TODO in SQL).

Client & Service Worker

- Register `sw-notifications.js` from the client and use the `init()` helper in `js/services/notification-service.js`.
- When the SW receives a push, it shows a notification; clicking the notification attempts to focus or open a window to `notification.data.url`.
- `pushsubscriptionchange` should re-subscribe using `/notifications/config` and persist the refreshed subscription back to `/notifications/subscribe`.
- Client-side push flow logging is available through `js/services/notification-service.js` for manual verification.

Verification flow

1. Sign in with a test user.
2. Enable notifications from the UI toggle.
3. Confirm a row appears in `push_subscriptions` for that user.
4. Use the browser-console helper in `test-notification-service.js`:
   - `testNotificationSubscription()`
   - `testNotificationInbox()`
5. Trigger a social event or self-test via `POST /notifications/send` and confirm:
   - a `notifications` row is written
   - push delivery summary is logged server-side
   - a browser notification appears
6. Click the notification and confirm the expected page opens.

Remaining TODOs

- Add RLS policies to the SQL migration.
- Optionally move the push enable/disable control into Account Center for a cleaner navigation experience.
