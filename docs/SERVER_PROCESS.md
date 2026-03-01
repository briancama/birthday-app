Server Process & Deployment Notes

Overview

- Runtime: Node.js + Express serving static assets and API routes.
- Reverse proxy: Nginx handles TLS (Certbot) and proxies to the local Express process.
- Process manager: systemd runs the app as `birthday-app` service; env vars come from an EnvironmentFile referenced in the unit.

Auth Flow

1. Client obtains an ID token using Firebase client SDK (phone OTP flow).
2. Client POSTs `{ idToken }` to `/auth/login` on the server.
3. Server verifies the ID token with `firebase-admin` (requires a service account).
4. Server finds or creates the Supabase `users` row and sets a signed `user_id` httpOnly cookie.
5. Client uses `appState.init()` which calls `/auth/me` to get server-side profile data.

Key env vars

- `SUPABASE_URL` – your Supabase URL
- `SUPABASE_SERVICE_ROLE` – server-only service role key (keep secret)
- `COOKIE_SECRET` – secret used for Express signed cookies
- `FIREBASE_SERVICE_ACCOUNT` or `GOOGLE_APPLICATION_CREDENTIALS` – Firebase admin credentials

Common Commands

# As service user (replace path/user as needed)

sudo -iu birthday bash -lc 'cd /var/www/birthday-app && npm ci --omit=dev'

# Reload systemd and restart the app

sudo systemctl daemon-reload
sudo systemctl restart birthday-app
sudo journalctl -u birthday-app -f

# Quick HTTP tests (use cookie jar if testing auth cookie)

curl -I https://birthday.briancama.com/
curl -v -c cookies.txt -X POST https://birthday.briancama.com/auth/login -H "Content-Type: application/json" -d '{"idToken":"<TOKEN>"}'
curl -v -b cookies.txt https://birthday.briancama.com/auth/me

Debug checklist

- If Firebase token verification fails: verify the service account is accessible and that the project in the service account matches the ID tokens being issued by your Firebase client.
- If Supabase queries fail (missing view/table): run the SQL in `/sql` on your Supabase project to ensure views and tables exist.
- If cookies are missing in browser: check nginx proxy settings, cookie domain/path, `Secure` flag (HTTPS required), and `SameSite` behavior.

Pending items (when you return)

- Restart the Node service after final deploys
- Ensure Firebase service account & env vars present on the Droplet
- Run `npm ci` on the Droplet if dependencies change
- (Optional) Add `username` to `user_profile_view` in Supabase (SQL in /sql/create_user_profile.sql) or keep server fallback

If you want, I can prepare a short systemd unit snippet and an example EnvironmentFile to drop into the Droplet; otherwise these notes should be enough to pick back up quickly.
