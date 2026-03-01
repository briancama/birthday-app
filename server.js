const express = require("express");
const path = require("path");
const cookieParser = require("cookie-parser");
const app = express();
const port = process.env.PORT || 8000;

// Use EJS for server-rendered pages
app.set("views", path.join(__dirname, "templates"));
app.set("view engine", "ejs");

app.use(express.json());
// signed cookies for simple session-style authentication
app.use(cookieParser(process.env.COOKIE_SECRET || "dev-secret"));

// Dev convenience: auto-set a signed `user_id` cookie when running locally
// so developers don't need to call /auth/login to work on UI pages.
// Activated only when NODE_ENV !== 'production'. Optionally override ID with
// query `?devUserId=...` or env `DEV_LOCAL_USER_ID`.
app.use((req, res, next) => {
  if (process.env.NODE_ENV !== "production") {
    try {
      const signed = req.signedCookies && req.signedCookies.user_id;
      if (!signed) {
        const devId = req.query && req.query.devUserId ? req.query.devUserId : (process.env.DEV_LOCAL_USER_ID || "local-dev-user");
        if (devId) {
          res.cookie("user_id", devId, {
            signed: true,
            httpOnly: true,
            secure: false,
            sameSite: "lax",
            maxAge: 1000 * 60 * 60 * 24 * 7,
          });
          // Also set a readable cookie for UI debugging if desired
          res.cookie("user_id_dev_readable", devId, {
            signed: false,
            httpOnly: false,
            secure: false,
            sameSite: "lax",
            maxAge: 1000 * 60 * 60 * 24 * 7,
          });
        }
      }
    } catch (e) {
      // ignore cookie errors in dev
      console.warn("dev auto-login middleware error:", e && e.message);
    }
  }
  next();
});

// Middleware to serve .html files for extensionless URLs (keep for static fallback)
// Only apply for top-level GET page requests (avoid rewriting API routes like /auth, /api, /users)
app.use((req, res, next) => {
  const isGet = req.method === "GET";
  const isRoot = req.path === "/";
  const hasExtension = req.path.includes(".");
  const isApiLike =
    req.path.startsWith("/api") || req.path.startsWith("/auth") || req.path.startsWith("/users");

  if (isGet && !hasExtension && !isRoot && !isApiLike) {
    req.url += ".html";
  }
  next();
});

// Serve static files from workspace root
app.use(express.static(path.join(__dirname)));

// Mount users route
const usersRouter = require("./routes/users");
app.use("/users", usersRouter);
const apiUsersRouter = require("./routes/api-users");
app.use("/api", apiUsersRouter);
const authRouter = require("./routes/auth");
app.use("/auth", authRouter);

app.listen(port, () => {
  console.log(`Birthday App server running at http://localhost:${port}`);
});
