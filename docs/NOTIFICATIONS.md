NOTIFICATIONS - Setup Notes

Overview

- This document describes the minimal setup to support push notifications in this app:
  - client service worker (`sw-notifications.js`)
  - client-side subscription management (`js/services/notification-service.js`)
  - server routes (`routes/notifications.js`)
  - DB tables (`sql/2026_03_09_add_push_subscriptions.sql`)

Firebase Admin (optional) & Server-side credentials

1. If you plan to use Firebase Admin SDK to send notifications:
   - In Firebase Console -> Project Settings -> Service Accounts -> Generate new private key.
   - Save the JSON file contents.

2. Provide credentials to the Node server:
   - Option A: Set `FIREBASE_SERVICE_ACCOUNT` environment variable to the JSON string.
     Example (bash):
     export FIREBASE_SERVICE_ACCOUNT="$(cat /path/to/service-account.json)"
   - Option B: Set `GOOGLE_APPLICATION_CREDENTIALS` to the JSON file path (then ensure server-utils uses it).
   - Also set `FIREBASE_PROJECT_ID` if needed.

3. Restart the Node server after setting env vars.

VAPID keys (web push)

- If you use web-push (not Firebase), generate VAPID keys (e.g., via web-push npm lib).
- Store public and private keys as env vars:
  - VAPID_PUBLIC_KEY
  - VAPID_PRIVATE_KEY
- Serve the public key to clients so they can register subscriptions.

Server considerations

- The server route `routes/notifications.js` uses `requireSignedUser(req)` to get the signed user_id cookie and `getSupabase()` for DB access.
- Implement a secure sending mechanism (rate limits, auth checks) before enabling any public "send" endpoint.
- Add proper RLS policies in Supabase to prevent unauthorized access (see TODO in SQL).

Client & Service Worker

- Register `sw-notifications.js` from the client and use the `init()` helper in `js/services/notification-service.js`.
- When the SW receives a push, it shows a notification; clicking the notification attempts to focus or open a window to `notification.data.url`.

Next steps (implementation TODOs)

- Implement server-side push delivery using Firebase Admin or the web-push library.
- Add RLS policies to the SQL migration.
- Wire VAPID keys and secure the /notifications/send endpoint.
