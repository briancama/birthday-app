# Birthday App 🎉

A weekend event challenge app with progressive reveals, Brian-mode challenges, and live scoreboard.

## Features

- 🔓 **Username-only auth** (no passwords needed)
- 🎯 **Progressive challenge reveals** (unlock one at a time)
- ⚔️ **Brian vs mode** (competitive challenges)
- 🤝 **Brian with mode** (collaborative challenges)
- 🏆 **Live scoreboard** with rankings
- 📊 **Personal stats dashboard**

## Quick Start

### Local Development

1. Clone the repo:
   ```bash
   git clone https://github.com/yourusername/birthday-app.git
   cd birthday-app
   ```

2. Start local dev server:
   ```bash
   python3 serve.py 8000
   ```
   Then open `http://localhost:8000` in your browser.
   
   **Important**: Use the custom `serve.py` script (not `python3 -m http.server`) to properly resolve routes without `.html` extensions (e.g., `/dashboard`, `/leaderboard` instead of `/dashboard.html`). This ensures the local development environment matches production behavior.
   
   **Pro tip**: Add this alias to your `~/.zshrc`:
   ```bash
   alias serve="python3 serve.py 8000"
   ```
   Then just run `serve` from the project directory.

3. Create a Supabase project at [supabase.com](https://supabase.com)

3. Run the SQL migration in Supabase SQL Editor:
   ```bash
   # Copy contents of supabase/sql/init.sql
   # Paste and run in Supabase dashboard → SQL Editor
   ```

4. Update Supabase credentials in all HTML files:
   - `index.html`
   - `dashboard.html`
   - `leaderboard.html`
   
   Replace:
   ```javascript
   const SUPABASE_URL = 'https://your-project.supabase.co'
   const SUPABASE_KEY = 'your-anon-key'
   ```

5. Open `index.html` in your browser

### Production Deployment (DigitalOcean)

1. SSH to your droplet:
   ```bash
   ssh root@your-droplet-ip
   ```

2. Install nginx:
   ```bash
   apt update && apt install nginx -y
   ```

3. Clone repo to web directory:
   ```bash
   mkdir -p /var/www/birthday-app
   cd /var/www/birthday-app
   git clone https://github.com/yourusername/birthday-app.git .
   ```

4. Configure nginx:
   ```bash
   nano /etc/nginx/sites-available/birthday-app
   ```
   
   Paste:
   ```nginx
   server {
       listen 80;
       server_name your-domain.com;
       root /var/www/birthday-app;
       index index.html;
       location / {
           try_files $uri $uri/ =404;
       }
   }
   ```

5. Enable site:
   ```bash
   ln -s /etc/nginx/sites-available/birthday-app /etc/nginx/sites-enabled/
   nginx -t
   systemctl restart nginx
   ```

6. Optional - Setup SSL:
   ```bash
   apt install certbot python3-certbot-nginx -y
   certbot --nginx -d your-domain.com
   ```

## Admin Guide

### Setup Users
```sql
INSERT INTO users (username, display_name) VALUES 
  ('alice', 'Alice'),
  ('bob', 'Bob');
```

### Create Challenges
```sql
-- Regular challenge
INSERT INTO challenges (id, title, description, type) VALUES
  ('c1', 'First Challenge', 'Complete this task', 'assigned');

-- Brian vs challenge
INSERT INTO challenges (id, title, description, type, brian_mode) VALUES
  ('c2', 'Beat Brian', 'Compete against Brian', 'assigned', 'vs');

-- Brian with challenge
INSERT INTO challenges (id, title, description, type, brian_mode) VALUES
  ('c3', 'Team Up', 'Work with Brian', 'assigned', 'with');

-- Competition challenge
INSERT INTO challenges (id, title, description, type) VALUES
  ('comp1', 'Competition 1', 'First competition', 'competition');
```

### Assign Challenges
```sql
INSERT INTO assignments (user_id, challenge_id)
SELECT u.id, 'c1' FROM users u WHERE u.username = 'alice';
```

### Add Competition Results
```sql
INSERT INTO competition_placements (user_id, challenge_id, place, points)
SELECT u.id, 'comp1', 1, 20 FROM users u WHERE u.username = 'alice';
```

## Database Schema

- **users**: User accounts (username, display_name)
- **challenges**: Challenge definitions (title, description, type, brian_mode)
- **assignments**: User-challenge links with outcomes
- **competition_placements**: Competition results with points
- **scoreboard**: View aggregating all points

## Points System

- **Assigned challenges**: 5 points per successful completion
- **Brian challenges**: 5 points to winner/collaborators, 0 to loser/failed
- **Competition challenges**: Custom points per placement

## Tech Stack

- Frontend: Vanilla HTML/CSS/JavaScript (ES modules)
- Backend: Supabase (Postgres + RLS)
- Auth: Username-based (no passwords)
- Hosting: Static nginx on DigitalOcean

## License

MIT