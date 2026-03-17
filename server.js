const express = require("express");
// Load local .env for development only (do not attempt in production)
if (process.env.NODE_ENV !== "production") {
  try {
    require("dotenv").config();
  } catch (err) {
    // dotenv may not be installed in some environments; fall back to system env
  }
}
const path = require("path");
const cookieParser = require("cookie-parser");
const { getSupabase } = require("./js/utils/server-utils");
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
        const devId =
          req.query && req.query.devUserId
            ? req.query.devUserId
            : process.env.DEV_LOCAL_USER_ID || "local-dev-user";
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

// Server middleware: populate nav data for server-rendered navigation partials
app.use(async (req, res, next) => {
  try {
    const supabase = getSupabase();
    res.locals.navData = { isAuthenticated: false };

    if (!supabase) return next();

    const signed = req.signedCookies && req.signedCookies.user_id;
    if (!signed) return next();

    // Try to resolve the signed cookie value to a users row. The cookie may
    // already be a UUID or a development shortcut like 'local-dev-user'. Try
    // id first (only if value looks like a UUID), then username.
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(signed);
    let { data: user, error: userErr } = isUuid
      ? await supabase
          .from("users")
          .select("id, username, display_name, user_type, headshot")
          .eq("id", signed)
          .maybeSingle()
      : { data: null, error: null };

    if ((!user || userErr) && signed) {
      const { data: byName } = await supabase
        .from("users")
        .select("id, username, display_name, user_type, headshot")
        .eq("username", signed)
        .maybeSingle();
      if (byName) user = byName;
    }

    if (!user) return next();

    // Run push subscription check and event_started flag in parallel
    const [pushResult, flagResult] = await Promise.allSettled([
      supabase.from("push_subscriptions").select("id").eq("user_id", user.id).limit(1),
      supabase
        .from("app_settings")
        .select("setting_value")
        .eq("setting_key", "event_started")
        .maybeSingle(),
    ]);

    const hasPush = !!(
      pushResult.status === "fulfilled" &&
      !pushResult.value.error &&
      pushResult.value.data &&
      pushResult.value.data.length
    );

    const eventStarted = !!(
      flagResult.status === "fulfilled" &&
      !flagResult.value.error &&
      flagResult.value.data &&
      flagResult.value.data.setting_value &&
      flagResult.value.data.setting_value.enabled === true
    );

    // Simple admin check: username matches known admins (keep existing client-side conventions)
    const isAdmin = !!(user && (user.username === "brianc" || user.username === "admin"));

    res.locals.navData = {
      user: {
        id: user.id,
        username: user.username,
        display_name: user.display_name,
        headshot: user.headshot,
        user_type: user.user_type,
        isAdmin,
      },
      isAuthenticated: true,
      hasPushSubscription: hasPush,
      eventStarted,
    };
    // Precompute a sanitized JSON blob for navData to safely embed in templates
    try {
      let navJson = JSON.stringify(res.locals.navData || {});
      navJson = navJson
        .replace(/</g, "\\u003c")
        .replace(/\u2028/g, "\\u2028")
        .replace(/\u2029/g, "\\u2029");
      res.locals.navDataJson = navJson;
    } catch (e) {
      res.locals.navDataJson = "{}";
    }
  } catch (err) {
    // fallback: leave navData minimal
    res.locals.navData = { isAuthenticated: false };
  }
  return next();
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

// GET / — smart root handler:
//   ?logout  → clear cookie and serve login page
//   cookie present + valid user → server-side redirect to correct destination
//   otherwise → fall through to express.static (serves index.html)
app.get("/", async (req, res, next) => {
  // Handle ?logout — clear server cookie and serve login page directly
  if ("logout" in req.query) {
    res.clearCookie("user_id");
    return next(); // express.static serves index.html
  }

  const userId = req.signedCookies && req.signedCookies.user_id;
  if (!userId) return next();

  try {
    const supabase = getSupabase();
    if (!supabase) return next();

    const { data } = await supabase
      .from("users")
      .select("username, display_name, user_type")
      .eq("id", userId)
      .maybeSingle();

    if (!data) return next(); // unknown user, serve login

    const needsOnboarding = !data.display_name;
    const userType = data.user_type || "visitor";
    const username = data.username || null;

    let destination;
    if (needsOnboarding) {
      destination = "/register";
    } else if (userType === "participant") {
      destination = "/dashboard";
    } else {
      destination = username ? `/users/${username}` : "/leaderboard";
    }

    return res.redirect(302, destination);
  } catch (e) {
    // On any error just serve the login page
    return next();
  }
});

// Serve static files from workspace root
// Rendered routes (prefer explicit server-rendered pages where desired)
app.get(["/dashboard", "/dashboard.html"], async (req, res) => {
  try {
    const supabase = getSupabase();
    const assignments = [];

    // If we have a server-resolved user, pre-fetch their assignments for server-side render
    // Only fetch if the event has started — otherwise show the pre-event preview
    const user = res.locals && res.locals.navData && res.locals.navData.user;
    const eventStarted = !!(res.locals.navData && res.locals.navData.eventStarted);
    if (supabase && user && user.id && eventStarted) {
      const { data, error } = await supabase
        .from("assignments")
        .select(
          `id, completed_at, outcome, challenges (id, title, description, brian_mode, success_metric, vs_user, vs_user_profile:users!vs_user(display_name, username))`
        )
        .eq("user_id", user.id)
        .eq("active", true)
        .order("assigned_at", { ascending: true });

      if (!error && Array.isArray(data)) {
        // Sort: incomplete first, completed at the bottom (preserves assigned_at order within each group)
        const sorted = data.slice().sort((a, b) => {
          const aComplete = a.completed_at ? 1 : 0;
          const bComplete = b.completed_at ? 1 : 0;
          return aComplete - bComplete;
        });
        sorted.forEach((row) => assignments.push(row));
      }
    }

    // Precompute a JSON blob with unsafe chars escaped for safe embedding
    // Escape '<' to prevent </script> injection and also escape line separator
    // characters U+2028/U+2029 which break JS string literals when embedded.
    let assignmentsJson = JSON.stringify(assignments) || "[]";
    assignmentsJson = assignmentsJson
      .replace(/</g, "\\u003c")
      .replace(/\u2028/g, "\\u2028")
      .replace(/\u2029/g, "\\u2029");
    // Log size for debugging EJS compile issues
    try {
      console.debug(`Dashboard: assignmentsJson length=${assignmentsJson.length}`);
    } catch (e) {
      /* ignore logging errors */
    }
    return res.render("dashboard", { assignments, assignmentsJson, eventStarted });
  } catch (err) {
    console.warn("Dashboard server render failed to fetch assignments:", err && err.message);
    const assignmentsJson = JSON.stringify([]);
    return res.render("dashboard", { assignments: [], assignmentsJson, eventStarted: false });
  }
});

// Leaderboard: server-rendered to include navigation partial
app.get(["/leaderboard", "/leaderboard.html"], (req, res) => {
  return res.render("leaderboard");
});

// Challenge Workshop: server-rendered to include navigation partial
app.get(["/challenges-submit", "/challenges-submit.html"], (req, res) => {
  return res.render("challenges-submit");
});

// Admin Approvals: server-rendered to include navigation partial
app.get(["/admin-approvals", "/admin-approvals.html"], (req, res) => {
  return res.render("admin-approvals");
});


// Cocktail Judging: server-rendered to include navigation partial
app.get(["/cocktail-judging", "/cocktail-judging.html"], (req, res) => {
  return res.render("cocktail-judging");
});

// Event Info: server-rendered to include navigation partial (myspace style)
app.get(["/event-info", "/event-info.html"], (req, res) => {
  return res.render("event-info");
});

app.use(express.static(path.join(__dirname)));

// Mount users route
const usersRouter = require("./routes/users");
app.use("/users", usersRouter);
const apiUsersRouter = require("./routes/api-users");
app.use("/api", apiUsersRouter);
const authRouter = require("./routes/auth");
app.use("/auth", authRouter);

// Notifications route (push subscriptions, send/list/mark-read)
const notificationsRouter = require("./routes/notifications");
app.use("/notifications", notificationsRouter);

app.listen(port, () => {
  console.log(`Birthday App server running at http://localhost:${port}`);
});
