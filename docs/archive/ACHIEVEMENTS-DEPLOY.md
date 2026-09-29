# Achievements — Deployment Notes

This document describes how to deploy the Achievements feature safely.

1. Apply SQL migrations

- Run the migration file to create the `achievements` and `user_achievements` tables and seed example achievements:
  - `sql/1_create_achievements_and_user_achievements.sql`
  - Update the `scoreboard` view is already committed in `sql/scoreboard_view.sql`.

  Apply migrations against your dev/staging Supabase instance first. For example, using `psql` or the Supabase SQL editor:

```bash
# Example (replace with your DB connection)
psql $DATABASE_URL -f sql/1_create_achievements_and_user_achievements.sql
psql $DATABASE_URL -f sql/scoreboard_view.sql
```

2. RLS / Permissions

- Currently this prototype assumes open RLS for simplicity. For production you should:
  - Create an RPC `award_achievement(user_id, achievement_key, details json)` that validates triggers and inserts into `user_achievements` under a trusted service role.
  - Restrict direct inserts to `user_achievements` via RLS so only the RPC (or server) role can insert.

3. Seed data

- Migrations include a set of example achievements (first challenge, five challenges, first comment, first favorite, rickroll). Adjust points and descriptions to taste.

4. Frontend wiring

- `js/services/achievement-service.js` contains the client-side awarding logic and listens to `EventBus` events.
- `js/pages/base-page.js` initializes the service and listens for `achievement:awarded` to show toasts.
- Where applicable, components now emit events:
  - `user:guestbook:sign` (from `js/components/guestbook.js`)
  - `cocktail:favorite:toggled` (from `js/pages/cocktail-judging.js`)
  - Window-level custom events like `achievement:trigger` can be dispatched for inline easter eggs.

5. Testing

- Use the browser test helpers in `test-achievement-service.js`:
  - `testAchievementService()` — awards the `rickroll` achievement and lists recent awards.
  - `testAwardFirstComment()` — inserts a guestbook comment and polls for an award.

6. Production considerations

- For security and race-free counting, implement counter/threshold awards server-side as a Postgres function (RPC) which:
  - Checks current counts atomically
  - Inserts into `user_achievements` if not already awarded
  - Returns whether an award was created

- Consider moving `achievementService` checks for sensitive awards to call the RPC rather than performing client-side inserts.

7. Rollback

- To rollback schema changes, drop `user_achievements` and `achievements` (careful: this deletes award history). Keep backups before applying.

8. Monitoring

- After deployment, monitor recently inserted rows in `user_achievements` and confirm `scoreboard` totals update correctly.

---

If you want, I can generate the server-side RPC function and an example RLS policy to harden the flow.
