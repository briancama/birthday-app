# Deployment (Production)

Production runs on a DigitalOcean droplet (Ubuntu): Node/Express behind nginx (TLS via Certbot), managed by systemd as the `birthday-app` service. Domain: `thebri.space` (`www.thebri.space` and the old `birthday.briancama.com` 301 to it).

## Environment Variables (production)

Set in the EnvironmentFile referenced by the systemd unit. Plain `KEY=VALUE` lines, **no surrounding quotes**.

| Variable                                                                     | Purpose                                                |
| ---------------------------------------------------------------------------- | ------------------------------------------------------ |
| `NODE_ENV=production`                                                        | Enables secure cookies, disables dev auto-login/dotenv |
| `PORT=8000`                                                                  | Express port (nginx proxies to it)                     |
| `SUPABASE_URL`                                                               | **Prod** Supabase project URL                          |
| `SUPABASE_SERVICE_ROLE`                                                      | Prod service-role key — server-only secret             |
| `COOKIE_SECRET`                                                              | Strong random secret for signed cookies                |
| `FIREBASE_SERVICE_ACCOUNT` (JSON) or `GOOGLE_APPLICATION_CREDENTIALS` (path) | Firebase admin creds for ID-token verification         |
| `FIREBASE_PROJECT_ID`                                                        | Fallback if no service account                         |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_EMAIL`                       | Web Push delivery                                      |
| `SUPABASE_JWT_SECRET`                                                        | Prod JWT secret; signs `/auth/supabase-token` (wallet) |

Client-side keys live in `js/config.js` (gitignored) which auto-selects prod keys by hostname — make sure the deployed copy exists on the droplet.

## First-Time Server Setup

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y build-essential curl git nginx certbot python3-certbot-nginx
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

cd /var/www && sudo mkdir -p birthday-app && sudo chown $USER:$USER birthday-app
git clone <repo-url> birthday-app && cd birthday-app
npm ci --omit=dev   # run as the service user, not root
```

### systemd unit — `/etc/systemd/system/birthday-app.service`

```ini
[Unit]
Description=Birthday App
After=network.target

[Service]
Type=simple
WorkingDirectory=/var/www/birthday-app
EnvironmentFile=/var/www/birthday-app/.env
ExecStart=/usr/bin/node server.js
Restart=on-failure
User=birthday
Group=birthday

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now birthday-app
sudo journalctl -u birthday-app -f
```

### nginx reverse proxy

See `deploy/birthday-app.nginx.conf.example` for the canonical config: TLS on 443 (Certbot-managed certs), `/songs/` served directly from disk, everything else proxied to `127.0.0.1:8000` with forwarded headers, security headers, gzip, `client_max_body_size 20M`. Separate server blocks 301 `www.thebri.space`, `birthday.briancama.com`, and all port-80 traffic to `https://thebri.space`.

```bash
sudo ln -s /etc/nginx/sites-available/birthday-app /etc/nginx/sites-enabled/
sudo certbot certonly --nginx -d thebri.space -d www.thebri.space
sudo nginx -t && sudo systemctl restart nginx
sudo certbot renew --dry-run   # covers both certs
```

Keep the `birthday.briancama.com` cert renewing: its HTTPS redirect needs a valid cert, and old-domain push notification clicks land there.

Note: Express should trust proxy headers behind nginx (`X-Forwarded-Proto` affects secure cookies).

## Deploy Workflow

```bash
# on the droplet
cd /var/www/birthday-app
git pull
npm ci --omit=dev                       # only if dependencies changed
sudo systemctl daemon-reload && sudo systemctl restart birthday-app
sudo journalctl -u birthday-app -f      # verify clean startup
```

Schema changes: apply the corresponding `/sql` file to the **prod** Supabase project via the SQL editor _before_ restarting with code that depends on it. See [DATABASE.md](DATABASE.md).

Songs are synced out-of-band (large files not in git):

```bash
rsync -avz --progress songs/ birthday@<droplet-ip>:/var/www/birthday-app/songs/
```

## Smoke Tests

```bash
curl -I https://thebri.space/
curl -I https://www.thebri.space/walktober              # 301 -> https://thebri.space/walktober
curl -I "https://birthday.briancama.com/users/x?a=1"    # 301 -> https://thebri.space/users/x?a=1
curl -I http://birthday.briancama.com/                  # 301 -> https://thebri.space/
# With the literal <TOKEN> placeholder this returns "Invalid Firebase ID token" (server + firebase-admin are up).
# Test real sign-in through the browser OTP flow.
curl -v -c cookies.txt -X POST https://thebri.space/auth/login \
  -H "Content-Type: application/json" -d '{"idToken":"<TOKEN>"}'
curl -v -b cookies.txt https://thebri.space/auth/me
```

## Debug Checklist

- **Firebase token verification fails** → service account accessible to the service process? Service-account project matches the Firebase project issuing client tokens (prod vs dev)?
- **Phone sign-in fails only on a new host** → add the host under Firebase console → Authentication → Settings → Authorized domains (and any API-key referrer / reCAPTCHA domain lists).
- **Supabase errors (missing view/table)** → prod project missing a migration; check [DATABASE.md](DATABASE.md) drift notes.
- **Cookies missing in browser** → HTTPS required for `Secure` cookies; check nginx forwarded headers and `SameSite`.
- **Env changes not taking effect** → systemd requires `daemon-reload` after unit/EnvironmentFile edits; values must be unquoted.
- **Push notifications silent** → all three `VAPID_*` vars present? Stale subscriptions are pruned on 404/410 push responses.
- Logs: `sudo journalctl -u birthday-app -f`
