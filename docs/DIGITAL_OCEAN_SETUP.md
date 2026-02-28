# DigitalOcean Droplet Setup — Birthday App (Server-rendered profiles)

This document lists the minimal steps to prepare a DigitalOcean Droplet (Ubuntu) to run the Birthday App server (Express + EJS), manage env vars, and configure nginx as a reverse proxy.

Prereqs
- Droplet with Ubuntu 22.04+ and SSH access
- Domain DNS A record pointing to the Droplet
- Access to Supabase project (service_role key) and any other secrets

1) Update system and install packages

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y build-essential curl git nginx certbot python3-certbot-nginx
```

2) Install Node (recommended Node 18/20)

```bash
# install NodeSource Node 20 LTS (example)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
node -v
npm -v
```

3) Clone repo and install dependencies

```bash
cd /var/www
sudo mkdir -p birthday-app
sudo chown $USER:$USER birthday-app
git clone <your-repo-url> birthday-app
cd birthday-app
npm install
```

4) Environment variables
- Create a `.env` (or set systemd unit / App Platform env vars). At minimum set:

```
NODE_ENV=production
PORT=8000
SUPABASE_URL=https://your.supabase.co
SUPABASE_SERVICE_ROLE=<your-service_role_key>
SUPABASE_ANON=<your_anon_key>
# Optional: ADMIN_TOKEN or other internal secret for protected endpoints
```

If using systemd, put them in the unit file or a `/etc/environment.d/birthday-app.conf` file.

5) Process manager (pm2) OR systemd

pm2 (quick):
```bash
sudo npm install -g pm2
pm2 start server.js --name birthday-app
pm2 save
pm2 startup
```

systemd (recommended for controlled setups): create `/etc/systemd/system/birthday-app.service`:

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
User=www-data
Group=www-data

[Install]
WantedBy=multi-user.target
```

Then enable/start:
```bash
sudo systemctl daemon-reload
sudo systemctl enable birthday-app
sudo systemctl start birthday-app
sudo journalctl -u birthday-app -f
```

6) Nginx reverse proxy

Create `/etc/nginx/sites-available/birthday-app`:

```nginx
server {
  listen 80;
  server_name yourdomain.example;

  location / {
    proxy_pass http://127.0.0.1:8000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }

  location ~* \.(css|js|png|jpg|jpeg|gif|svg|ico)$ {
    root /var/www/birthday-app;
    try_files $uri =404;
  }
}
```

Enable and test:
```bash
sudo ln -s /etc/nginx/sites-available/birthday-app /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

7) TLS via Certbot

```bash
sudo certbot --nginx -d yourdomain.example
```

8) Database migrations / SQL

Run the SQL migration `sql/create_user_profile.sql` against your Postgres/Supabase DB. Options:
- Use `psql` with your DB connection string
- Use Supabase SQL editor

Example `psql` (if you have a PG connection string):
```bash
psql "postgresql://user:pass@host:5432/dbname" -f sql/create_user_profile.sql
```

9) File permissions and static assets

Ensure nginx user can read static files:
```bash
sudo chown -R www-data:www-data /var/www/birthday-app
sudo find /var/www/birthday-app -type d -exec chmod 755 {} \;
sudo find /var/www/birthday-app -type f -exec chmod 644 {} \;
```

10) Logging and monitoring
- Use `journalctl -u birthday-app` or `pm2 logs` for logs
- Consider installing `fail2ban` and monitoring tools

11) Deploy workflow
- For simple deployments: `git pull` on the droplet, `npm ci`, `pm2 restart birthday-app` or `sudo systemctl restart birthday-app`.
- For safer deploys: use a CI pipeline to push artifacts, run migrations, and restart the service.

Notes and tips
- Keep `SUPABASE_SERVICE_ROLE` only on the server; never expose it to the browser.
- If you add a regeneration/purge endpoint, protect it with an `ADMIN_TOKEN` header and only accept requests from localhost or CI IPs.
- For testing locally, keep using `node server.js` and `npm install`.

*** End of guide
