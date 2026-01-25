# Birthday App — Project Overview

## Summary
Weekend event app with username-based sign-in, progressive challenge reveals, Brian-mode challenges (vs/with mechanics), and live scoreboard. Built with Supabase backend and vanilla HTML/JS frontend.

## Tech Stack
- **Backend**: Supabase (Postgres + RLS)
- **Frontend**: Vanilla HTML/CSS/JS (ES modules)
- **Auth**: Authless username-based sign-in (localStorage)
- **Deployment**: DigitalOcean droplet (static nginx hosting)

## Database Schema

### Tables
1. **users** (id uuid, username text unique, display_name text, created_at timestamptz)
2. **challenges** (id text, title text, description text, type text ['assigned'|'competition'], brian_mode text ['vs'|'with'], created_at timestamptz)
3. **assignments** (id uuid, user_id uuid, challenge_id text, assigned_at timestamptz, completed_at timestamptz, outcome text ['success'|'failure'])
4. **competition_placements** (id uuid, user_id uuid, challenge_id text, place int, points int, completed_at timestamptz)

### Views
- **scoreboard**: Aggregates points from successful assignments (5pts each) + competition placements

## Features

### Authentication
- Username-only sign-in (no passwords/email)
- Auto-creates user if username doesn't exist
- Persistent session via localStorage

### Challenge System

**Assigned Challenges:**
- Progressive reveal: generic "Challenge N" titles until clicked
- Sequential unlocking: must complete current challenge before next unlocks
- Success/Failure outcomes
- Regular challenges: 5 points on success, 0 on failure
- **Brian-mode challenges**:
  - **vs Brian** (⚔️): User success = Brian failure, User failure = Brian success
  - **with Brian** (🤝): Both get same outcome (collaborative)
  - Auto-creates brianc assignment on user completion

**Competition Challenges:**
- Admin-managed placements
- Custom points per placement
- Visible on scoreboard only

### Dashboard
- Personal stats card (rank, total points, assigned completed, competition points)
- Progressive challenge reveal mechanic
- Real-time scoreboard (auto-refresh every 10s)

### Leaderboard
- Full rankings for all users
- Highlights current user
- Medals for top 3 (🥇🥈🥉)
- Shows breakdown: assigned points + competition points = total

## Admin Workflow (via Supabase Dashboard)

1. **Setup users**: Insert rows in `users` table with username + display_name
2. **Create challenges**: Insert into `challenges` with type and optional brian_mode
3. **Assign challenges**: Insert into `assignments` linking user_id to challenge_id
4. **Resolve competitions**: Insert into `competition_placements` with place + points
5. **Monitor**: Query `scoreboard` view or use frontend leaderboard

## Deployment

- Static files served via nginx on DigitalOcean droplet
- No backend server needed (Supabase handles all data)
- Updates: git pull and refresh browser
- Optional SSL via Let's Encrypt

## Future Enhancements (Optional)
- Admin UI for managing challenges/assignments
- Challenge categories/filtering
- Time-limited challenges
- Team competitions
- Real-time notifications