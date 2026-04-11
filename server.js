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
// Shared challenge state logic for SSR
const { computeChallengeState, getChallengeCardOptions } = require("./js/utils/challenge-state.js");
const port = process.env.PORT || 8000;

// Use EJS for server-rendered pages
app.set("views", path.join(__dirname, "templates"));
app.set("view engine", "ejs");

app.use(express.json());
// Expose challenge state helper to EJS templates
app.use((req, res, next) => {
  res.locals.computeChallengeState = computeChallengeState;
  res.locals.getChallengeCardOptions = getChallengeCardOptions;
  next();
});
// signed cookies for simple session-style authentication
app.use(cookieParser(process.env.COOKIE_SECRET || "dev-secret"));

// Dev convenience: auto-set a signed `user_id` cookie when running locally
// so developers don't need to call /auth/login to work on UI pages.
// Activated only when NODE_ENV !== 'production'. Optionally override ID with
// query `?devUserId=...` or env `DEV_LOCAL_USER_ID`.
app.use((req, res, next) => {
  if (process.env.NODE_ENV !== "production" && !process.env.DEV_DISABLE_AUTOLOGIN) {
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

    const unreadWindowDays = 7;
    const unreadCutoffIso = new Date(
      Date.now() - unreadWindowDays * 24 * 60 * 60 * 1000
    ).toISOString();

    // Run independent nav-state lookups in parallel for faster TTFB on SSR pages.
    const [pushResult, eventFlagResult, challengesFlagResult, unreadResult] =
      await Promise.allSettled([
        supabase.from("push_subscriptions").select("id").eq("user_id", user.id).limit(1),
        supabase
          .from("app_settings")
          .select("setting_value")
          .eq("setting_key", "event_started")
          .maybeSingle(),
        supabase
          .from("app_settings")
          .select("setting_value")
          .eq("setting_key", "challenges_enabled")
          .maybeSingle(),
        supabase
          .from("notifications")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id)
          .eq("read", false)
          .gte("created_at", unreadCutoffIso),
      ]);

    const hasPush = !!(
      pushResult.status === "fulfilled" &&
      !pushResult.value.error &&
      pushResult.value.data &&
      pushResult.value.data.length
    );

    const eventStarted = !!(
      eventFlagResult.status === "fulfilled" &&
      !eventFlagResult.value.error &&
      eventFlagResult.value.data &&
      eventFlagResult.value.data.setting_value &&
      eventFlagResult.value.data.setting_value.enabled === true
    );

    const challengesEnabled = !(
      challengesFlagResult.status === "fulfilled" &&
      !challengesFlagResult.value.error &&
      challengesFlagResult.value.data &&
      challengesFlagResult.value.data.setting_value &&
      challengesFlagResult.value.data.setting_value.enabled === false
    );

    const unreadNotificationCount =
      unreadResult.status === "fulfilled" && !unreadResult.value.error
        ? unreadResult.value.count || 0
        : 0;

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
      unreadNotificationCount,
      eventStarted,
      challengesEnabled,
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
    req.path.startsWith("/api") ||
    req.path.startsWith("/auth") ||
    req.path.startsWith("/users") ||
    req.path.startsWith("/notifications");

  if (isGet && !hasExtension && !isRoot && !isApiLike) {
    req.url += ".html";
  }
  next();
});

// GET / — Brispace homepage
app.get("/", async (req, res) => {
  try {
    const supabase = getSupabase();
    let latestUsers = [];
    // Fetch latest 4 users with headshots from public profiles only
    const { data: users, error: usersError } = await supabase
      .from("user_profile_view")
      .select("user_id, username, display_name, headshot, is_published, created_at")
      .eq("is_published", true)
      .not("headshot", "is", null)
      .order("created_at", { ascending: false })
      .limit(12); // fetch more in case some have missing headshots
    if (usersError) {
      console.warn("Homepage latestUsers query failed:", usersError.message || usersError);
    }
    if (Array.isArray(users)) {
      latestUsers = users
        .filter((u) => u.headshot)
        .slice(0, 4)
        .map((u) => ({
          id: u.user_id,
          username: u.username,
          display_name: u.display_name,
          headshot: u.headshot,
        }));
    }
    // Get current user if authenticated
    const currentUser =
      res.locals.navData && res.locals.navData.user ? res.locals.navData.user : null;
    const isSignedIn = !!currentUser;
    const { media: sidebarMedia, test: sidebarTest } = getSidebarMediaSelection(req, isSignedIn);
    const sidebarAdKeys = getSidebarAdKeys();
    return res.render("brispace", {
      latestUsers,
      currentUser,
      sidebarMedia,
      sidebarAdKeys,
      sidebarTest,
      isSignedIn,
    });
  } catch (err) {
    const { media: sidebarMedia, test: sidebarTest } = getSidebarMediaSelection(req, false);
    const sidebarAdKeys = getSidebarAdKeys();
    return res.render("brispace", {
      latestUsers: [],
      currentUser: null,
      sidebarMedia,
      sidebarAdKeys,
      sidebarTest,
      isSignedIn: false,
    });
  }
});

// Friends: server-rendered page listing all users
app.get(["/friends", "/friends.html"], async (req, res) => {
  try {
    const supabase = getSupabase();
    const { data: users, error } = await supabase
      .from("user_profile_view")
      .select("user_id, username, display_name, headshot, created_at")
      .eq("is_published", true)
      .order("created_at", { ascending: false });

    if (error) throw error;

    const allUsers = Array.isArray(users)
      ? users.map((u) => ({
          id: u.user_id,
          username: u.username,
          display_name: u.display_name,
          headshot: u.headshot,
          created_at: u.created_at,
        }))
      : [];
    const currentUser =
      res.locals.navData && res.locals.navData.user ? res.locals.navData.user : null;
    return res.render("friends", { allUsers, currentUser });
  } catch (err) {
    console.warn("Friends page query failed:", err && err.message ? err.message : err);
    const currentUser =
      res.locals.navData && res.locals.navData.user ? res.locals.navData.user : null;
    return res.render("friends", { allUsers: [], currentUser });
  }
});

// Account Center: server-rendered notifications and achievements hub
app.get(["/account", "/account.html"], (req, res) => {
  const currentUser =
    res.locals.navData && res.locals.navData.user ? res.locals.navData.user : null;

  if (!currentUser) {
    return res.redirect("/");
  }

  return res.render("account", { currentUser });
});

// Shared helper to fetch assignments for SSR
async function fetchUserAssignments(supabase, user, eventStarted) {
  const assignments = [];
  if (supabase && user && user.id && eventStarted) {
    const { data, error } = await supabase
      .from("assignments")
      .select(
        `id, completed_at, outcome, triggered_at, challenges (id, title, description, brian_mode, success_metric, vs_user, vs_user_profile:users!vs_user(display_name, username))`
      )
      .eq("user_id", user.id)
      .eq("active", true)
      .order("assigned_at", { ascending: true });
    if (!error && Array.isArray(data)) {
      const sorted = data.slice().sort((a, b) => {
        const grp = (r) => (r.completed_at ? 2 : r.triggered_at ? 0 : 1);
        return grp(a) - grp(b);
      });
      sorted.forEach((row) => assignments.push(row));
    }
  }
  let assignmentsJson = JSON.stringify(assignments) || "[]";
  assignmentsJson = assignmentsJson
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
  return { assignments, assignmentsJson };
}

/**
 * Build sidebar media pool (ads + GIFs) for randomization
 * Discovers ad_* images from /images and returns metadata list
 */
function getSidebarMediaPool() {
  const pool = [];

  // Curated GIF-stepper candidates (can be extended with filesystem enumeration later)
  const gifCandidates = [
    {
      type: "gif-stepper",
      src: "/images/iron-man.gif",
      alt: "Iron Man GIF",
      width: 347,
      height: 207,
      stepsPerClick: 3,
      gifSound: "proton-cannon.mp3",
      gifSoundPercent: 70,
    },
    {
      type: "gif-stepper",
      src: "/images/stepper-kobe.gif",
      alt: "Kobe Bryant GIF",
      width: 240,
      height: 180,
      stepsPerClick: 1,
      gifSound: "kobe.mp3",
      gifSoundPercent: 70,
    },
    {
      type: "gif-stepper",
      src: "/images/stepper-vince.gif",
      alt: "Vince Carter GIF",
      width: 240,
      height: 192,
      stepsPerClick: 2,
      gifSound: "roundball-rock-basketball.mp3",
      gifSoundPercent: 70,
    },
    {
      type: "gif-stepper",
      src: "/images/with-fusion.gif",
      alt: "Gotenks GIF",
      width: 139,
      height: 80,
      stepsPerClick: 1,
      gifSound: "dbz-ssj3-gotenks.mp3",
      gifSoundPercent: 70,
    },
    {
      type: "gif-stepper",
      src: "/images/stepper-hello-kitty.gif",
      alt: "Hello Kitty GIF",
      width: 400,
      height: 150,
      stepsPerClick: 1,
      gifSound: "hello-kitty.mp3",
      gifSoundPercent: 70,
    },
    // Additional GIF candidates can be added here
  ];

  // Hardcoded ad images
  const adCandidates = [
    {
      type: "ad",
      src: "/images/ad_att-click-here.png",
      alt: "ATT Click Here",
      link: "#",
      audio: "/audio/woohoo.mp3",
      overlayText: null,
      belowText: null,
      overlayClass: null,
    },
    {
      type: "ad",
      src: "/images/ad_duke-nukem.gif",
      alt: "Play Duke Nukem 3D Here",
      link: "https://playclassic.games/games/first-person-shooter-dos-games-online/play-duke-nukem-3d-online/play/",
      audio: null,
      overlayText: null,
      belowText: null,
      overlayClass: null,
    },
    {
      type: "ad",
      src: "/images/ad_babylon-5.gif",
      alt: "Babylon 5 on TNT",
      link: "http://www.midwinter.com/lurk/",
      audio: null,
      overlayText: null,
      belowText: null,
      overlayClass: null,
    },
    {
      type: "ad",
      src: "/images/ad_tiger-trap.webp",
      alt: "Tiger Trap",
      link: "#",
      audio: "/audio/tiger-monologue.mp3",
      overlayText: null,
      belowText: null,
      overlayClass: null,
    },
    {
      type: "ad",
      src: "/images/ad_10th_kingdom.gif",
      alt: "10th Kingdom",
      link: "#",
      audio: "/audio/suck-an-elf.mp3",
      overlayText: null,
      belowText: null,
      overlayClass: null,
    },
    {
      type: "ad",
      src: "/images/ad_connery.gif",
      alt: "Sean Connery",
      link: "https://seanconnery.com/",
      audio: null,
      overlayText: "Entrapment",
      belowText: '"Welcome to the Rock"',
      overlayClass: "ad-connery",
    },
    {
      type: "ad",
      src: "/images/ad_heavensgate.jpg",
      alt: "Heaven's Gate",
      link: "https://www.heavensgate.com/",
      audio: null,
      overlayText: "Next gate in 2,359 years",
      belowText: null,
      overlayClass: "ad-heavensgate",
    },
    {
      type: "ad",
      src: "/images/ad_homestar.png",
      alt: "Homestar Runner",
      link: "https://homestarrunner.com/main",
      audio: null,
      overlayText: null,
      belowText: null,
      overlayClass: null,
    },
    // {
    //   type: "ad",
    //   src: "/images/ad_screensaver.gif",
    //   alt: "Screensaver",
    //   link: "#",
    //   audio: null,
    // },
    {
      type: "ad",
      src: "/images/ad_space-jam.gif",
      alt: "Space Jam",
      link: "https://www.spacejam.com/1996",
      audio: null,
      overlayText: null,
      belowText: null,
      overlayClass: null,
    },
    {
      type: "ad",
      src: "/images/ad_toyraygun.gif",
      alt: "Toy Ray Gun",
      link: "https://www.toyraygun.com/",
      audio: null,
      overlayText: null,
      belowText: null,
      overlayClass: null,
    },
  ];

  // Add ad candidates to pool
  pool.push(...adCandidates);

  // Add GIF candidates to pool
  pool.push(...gifCandidates);

  // Fallback: if no media found, return safe default GIF
  if (pool.length === 0) {
    pool.push({
      type: "gif-stepper",
      src: "/images/iron-man.gif",
      alt: "Iron Man GIF",
      width: 347,
      height: 207,
      stepsPerClick: 3,
      gifSound: "proton-cannon.mp3",
      gifSoundPercent: 70,
    });
  }

  return pool;
}

/**
 * Select sidebar media item based on auth status
 * Signed-in: random from full pool (ads + GIFs)
 * Signed-out: first ad only (static, no interaction)
 * Test mode: deterministic index selection via query (?sidebarTest=1&sidebarIndex=N)
 */
function getSidebarMediaSelection(req, isSignedIn) {
  const pool = getSidebarMediaPool();
  const sidebarTestRaw = String((req && req.query && req.query.sidebarTest) || "").toLowerCase();
  const isSidebarTestMode = sidebarTestRaw === "1" || sidebarTestRaw === "true";

  if (isSidebarTestMode && pool.length > 0) {
    const rawIndex = Number.parseInt((req && req.query && req.query.sidebarIndex) || "0", 10);
    const safeIndex = Number.isFinite(rawIndex)
      ? Math.max(0, Math.min(rawIndex, pool.length - 1))
      : 0;
    const basePath = (req && req.path) || "/";
    const prevIndex = (safeIndex - 1 + pool.length) % pool.length;
    const nextIndex = (safeIndex + 1) % pool.length;

    return {
      media: pool[safeIndex],
      test: {
        enabled: true,
        index: safeIndex,
        total: pool.length,
        prevUrl: `${basePath}?sidebarTest=1&sidebarIndex=${prevIndex}`,
        nextUrl: `${basePath}?sidebarTest=1&sidebarIndex=${nextIndex}`,
      },
    };
  }

  if (!isSignedIn) {
    const firstAd = pool.find((item) => item.type === "ad");
    return { media: firstAd || pool[0], test: { enabled: false, total: pool.length } };
  }

  return {
    media: pool[Math.floor(Math.random() * pool.length)],
    test: { enabled: false, total: pool.length },
  };
}

function getSidebarAdKeys() {
  const pool = getSidebarMediaPool();
  return Array.from(new Set(pool.filter((item) => item.type === "ad").map((item) => item.src)));
}

// Serve static files from workspace root
// Rendered routes (prefer explicit server-rendered pages where desired)
app.get(["/dashboard", "/dashboard.html"], async (req, res) => {
  try {
    const supabase = getSupabase();
    const user = res.locals && res.locals.navData && res.locals.navData.user;
    const eventStarted = !!(res.locals.navData && res.locals.navData.eventStarted);
    const challengesEnabled = !!(res.locals.navData && res.locals.navData.challengesEnabled);
    const { assignments, assignmentsJson } = await fetchUserAssignments(
      supabase,
      user,
      eventStarted
    );
    try {
      console.debug(`Dashboard: assignmentsJson length=${assignmentsJson.length}`);
    } catch (e) {}
    return res.render("dashboard", {
      assignments,
      assignmentsJson,
      eventStarted,
      challengesEnabled,
    });
  } catch (err) {
    console.warn("Dashboard server render failed to fetch assignments:", err && err.message);
    const assignmentsJson = JSON.stringify([]);
    return res.render("dashboard", {
      assignments: [],
      assignmentsJson,
      eventStarted: false,
      challengesEnabled: false,
    });
  }
});

// Leaderboard: server-rendered to include navigation partial
app.get(["/leaderboard", "/leaderboard.html"], (req, res) => {
  return res.render("leaderboard");
});

// Scoreboard: server-rendered Brispace ranking based on visitor-eligible achievements
app.get(["/scoreboard", "/scoreboard.html"], async (req, res) => {
  try {
    const supabase = getSupabase();
    const [leaderboardResult, publicProfilesResult] = await Promise.all([
      supabase
        .from("brispace_leaderboard")
        .select(
          "user_id, username, display_name, headshot, achievement_points, achievements_completed"
        )
        .order("achievement_points", { ascending: false })
        .order("achievements_completed", { ascending: false }),
      supabase.from("user_profile_view").select("user_id").eq("is_published", true),
    ]);

    const { data, error } = leaderboardResult;
    const { data: publicProfiles, error: publicProfilesError } = publicProfilesResult;

    if (error) throw error;
    if (publicProfilesError) throw publicProfilesError;

    const rows = Array.isArray(data) ? data : [];
    const publicUserIds = new Set(
      (Array.isArray(publicProfiles) ? publicProfiles : [])
        .map((row) => row.user_id)
        .filter(Boolean)
    );
    const publicRows = rows.filter((row) => publicUserIds.has(row.user_id));
    const rankedUsers = publicRows.map((row, idx) => ({ ...row, rank: idx + 1 }));

    const currentUser =
      res.locals.navData && res.locals.navData.user ? res.locals.navData.user : null;
    const isSignedIn = !!currentUser;
    const { media: sidebarMedia, test: sidebarTest } = getSidebarMediaSelection(req, isSignedIn);
    const sidebarAdKeys = getSidebarAdKeys();

    return res.render("scoreboard", {
      rankedUsers,
      podiumUsers: rankedUsers.slice(0, 3),
      currentUser,
      sidebarMedia,
      sidebarAdKeys,
      sidebarTest,
      isSignedIn,
      leaderboardGeneratedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.warn("Brispace scoreboard query failed:", err && err.message ? err.message : err);
    const currentUser =
      res.locals.navData && res.locals.navData.user ? res.locals.navData.user : null;
    const { media: sidebarMedia, test: sidebarTest } = getSidebarMediaSelection(req, false);
    const sidebarAdKeys = getSidebarAdKeys();
    return res.render("scoreboard", {
      rankedUsers: [],
      podiumUsers: [],
      currentUser,
      sidebarMedia,
      sidebarAdKeys,
      sidebarTest,
      isSignedIn: false,
      leaderboardGeneratedAt: new Date().toISOString(),
    });
  }
});

// Challenge Workshop: server-rendered to include navigation partial
app.get(["/challenges-submit", "/challenges-submit.html"], (req, res) => {
  return res.render("challenges-submit");
});

// Admin: server-rendered landing with dashboard and login
app.get(["/admin", "/admin.html"], (req, res) => {
  const currentUser =
    res.locals.navData && res.locals.navData.user ? res.locals.navData.user : null;
  return res.render("admin", { currentUser });
});

// Admin Approvals: server-rendered to include navigation partial
app.get(["/admin-approvals", "/admin-approvals.html"], (req, res) => {
  return res.render("admin-approvals");
});

// Cocktail Judging: server-rendered to include navigation partial
app.get(["/cocktail-judging", "/cocktail-judging.html"], (req, res) => {
  return res.render("cocktail-judging");
});

// Challenges: server-rendered to include navigation partial
app.get(["/challenges", "/challenges.html"], async (req, res) => {
  try {
    const supabase = getSupabase();
    const user = res.locals && res.locals.navData && res.locals.navData.user;
    const eventStarted = !!(res.locals.navData && res.locals.navData.eventStarted);
    const challengesEnabled = !!(res.locals.navData && res.locals.navData.challengesEnabled);
    const { assignments, assignmentsJson } = await fetchUserAssignments(
      supabase,
      user,
      eventStarted
    );
    return res.render("challenges", {
      assignments,
      assignmentsJson,
      eventStarted,
      challengesEnabled,
    });
  } catch (err) {
    const assignmentsJson = JSON.stringify([]);
    return res.render("challenges", {
      assignments: [],
      assignmentsJson,
      eventStarted: false,
      challengesEnabled: false,
    });
  }
});

// Event Info: server-rendered to include navigation partial (myspace style)
app.get(["/event-info", "/event-info.html"], (req, res) => {
  return res.render("event-info");
});

// Mount API/auth routes BEFORE static so they are never shadowed by file serving
const usersRouter = require("./routes/users");
app.use("/users", usersRouter);
const apiUsersRouter = require("./routes/api-users");
app.use("/api", apiUsersRouter);
const authRouter = require("./routes/auth");
app.use("/auth", authRouter);

// Notifications route (push subscriptions, send/list/mark-read)
const notificationsRouter = require("./routes/notifications");
app.use("/notifications", notificationsRouter);

app.use(express.static(path.join(__dirname)));

app.listen(port, () => {
  console.log(`Birthday App server running at http://localhost:${port}`);
});
