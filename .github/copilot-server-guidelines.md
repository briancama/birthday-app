# Server-side Patterns & Deployment Guidance

This companion document records server-side best-practices for the Birthday App. It is intended to be referenced from `.github/copilot-instructions.md` and the repository `docs/` folder.

Principles

- Keep secrets off the client. All service_role/admin keys must be stored in server environment variables and never checked into source.
- Prefer server-side checks for any privileged action; the client should only call server endpoints that validate the caller.

Configuration & Runtime

- Use `process.env` for sensitive values (e.g., `SUPABASE_SERVICE_ROLE`, `ADMIN_TOKEN`).
- Provide a minimal public runtime-config endpoint if the frontend needs non-sensitive, runtime-only values (e.g., feature flags).

Rendering & Caching

- For server-rendered user pages:
  - Render templates (EJS/Pug/Handlebars) on request.
  - Optionally write atomic files to disk for nginx to serve: write `index.html.tmp` and then rename to `index.html`.
  - Use `Cache-Control` and nginx `proxy_cache` for caching responses.

Security

- Sanitize all user-provided HTML server-side (DOMPurify or equivalent) before persisting or rendering.
- Protect admin/regeneration endpoints with authentication (signed JWT, session, or a secret header).
- Rate-limit endpoints that can trigger heavy work (regeneration, exports).

Uploads & Storage

- Route uploads through signed URLs or server endpoints, validate file types and sizes, and store in Supabase Storage or DO Spaces.

Background Jobs & Cron

- Use scheduled jobs (App Platform, system cron, or queued workers) for periodic tasks: backups, cache warm, scoreboard recalculation.
- Keep jobs idempotent and monitor failure rates.

Operations

- Use atomic writes and short-lived locks to avoid concurrency issues when writing cached files.
- Monitor disk usage; estimate ~5–50KB per profile HTML (scale planning required for many users).
- Log render failures, RPC errors, and disk writes for observability.

Deployment options

- App Platform: easiest (env management, auto-deploys, TLS).
- Droplet + nginx: full control, requires process manager (pm2/systemd) and TLS setup.
- Functions/Edge: good for small serverless endpoints or scheduled tasks.

Changelog and Maintenance

- When updating server practices, add a short changelog entry here with date, author, and a summary.
- Consider a CI job or subagent that can summarize PRs touching `server.js`, `templates/`, or `js/config.js` and propose updates to this document.

Example: atomic write helper (Node)

```javascript
const fs = require("fs").promises;
async function atomicWrite(path, html) {
  const tmp = path + ".tmp";
  await fs.writeFile(tmp, html, "utf8");
  await fs.rename(tmp, path);
}
```

---

Document created to capture server-side patterns; keep it in sync with `.github/copilot-instructions.md` and `docs/`.
