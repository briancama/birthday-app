# Birthday App Local Server Setup

## Node.js Express Server

We now use a Node.js Express server for local development. This improves reliability and matches production patterns.

### Setup Steps

1. Install Node.js (https://nodejs.org/)
2. In your project folder, run:
   npm install express
   # Run this command in the root of your project directory (where server.js is located)
3. Start the server:
   node server.js

### Features

- Serves static files from workspace root
- Extensionless URLs (e.g., /dashboard) automatically map to .html files
- Handles high concurrency and asset requests

### Legacy Python Server

You can still use `python3 -m http.server 8000` for quick tests, but Node.js is recommended for reliability.

### Troubleshooting

- If you see 404 errors, check file paths and ensure files exist
- Restart the server after file changes

---

## Production Deployment

For production, use a similar static server (Node.js, nginx, or Vercel/Netlify).
