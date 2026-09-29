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
const { getSupabase, createSanitizer } = require("./js/utils/server-utils");
const _sanitizer = createSanitizer();
const sanitizeHtml = (str) => _sanitizer.sanitize(str || "");
const app = express();
app.locals.sanitizeHtml = sanitizeHtml;
// Shared challenge state logic for SSR
const { computeChallengeState, getChallengeCardOptions } = require("./js/utils/challenge-state.js");
const { buildMediaSlots } = require("./js/utils/sidebar-media.js");
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
app.use(async (req, res, next) => {
  if (process.env.NODE_ENV !== "production" && !process.env.DEV_DISABLE_AUTOLOGIN) {
    try {
      const signed = req.signedCookies && req.signedCookies.user_id;
      const override = req.query && req.query.devUserId;
      const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      // Re-resolve when: no cookie, explicit switch, or a stale username-valued cookie
      if (!signed || override || !UUID_RE.test(signed)) {
        let devId =
          override ||
          (signed && !UUID_RE.test(signed) ? signed : null) ||
          process.env.DEV_LOCAL_USER_ID ||
          "local-dev-user";
        // API ownership checks compare the cookie to UUIDs, so resolve usernames up front
        if (!UUID_RE.test(devId)) {
          const supabase = getSupabase();
          if (supabase) {
            const { data: byName } = await supabase
              .from("users")
              .select("id")
              .eq("username", devId)
              .maybeSingle();
            if (byName) devId = byName.id;
          }
        }
        if (devId && devId !== signed) {
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
          // Make the new identity visible to downstream middleware on this same request
          req.signedCookies.user_id = devId;
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

  // Only rewrite single-segment paths (e.g. /dashboard → /dashboard.html)
  // Do NOT rewrite deep paths like /recipes/tasty-garbage — those are dynamic routes
  const isSingleSegment = !req.path.slice(1).includes("/");
  if (isGet && !hasExtension && !isRoot && !isApiLike && isSingleSegment) {
    req.url += ".html";
  }
  next();
});

// Backward-compatible aliases for the singular recipe paths.
// Canonical routes use /recipes, so redirect old/bookmarked links there.
app.get(["/recipe", "/recipe.html"], (req, res) => {
  return res.redirect("/recipes");
});

app.get(["/recipe/all", "/recipe/all.html"], (req, res) => {
  return res.redirect("/recipes/all");
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
    const mediaState = buildMediaSlots({
      req,
      isSignedIn,
      slotPlan: [
        { key: "mainPromo", area: "main", count: 1, includeTypes: ["ad"] },
        { key: "sidebar", area: "sidebar", count: 2, includeTypes: ["ad"] },
      ],
    });
    return res.render("brispace", {
      latestUsers,
      currentUser,
      adSlots: mediaState.slots,
      adCatalogKeys: mediaState.adKeys,
      sidebarTest: mediaState.test,
      hasGifStepper: mediaState.anyGifStepper,
      isSignedIn,
    });
  } catch (err) {
    const mediaState = buildMediaSlots({
      req,
      isSignedIn: false,
      slotPlan: [
        { key: "mainPromo", area: "main", count: 1, includeTypes: ["ad"] },
        { key: "sidebar", area: "sidebar", count: 2, includeTypes: ["ad"] },
      ],
    });
    return res.render("brispace", {
      latestUsers: [],
      currentUser: null,
      adSlots: mediaState.slots,
      adCatalogKeys: mediaState.adKeys,
      sidebarTest: mediaState.test,
      hasGifStepper: mediaState.anyGifStepper,
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
    const isSignedIn = !!currentUser;
    const mediaState = buildMediaSlots({
      req,
      isSignedIn,
      slotPlan: [{ key: "sidebar", area: "sidebar", count: 2, includeTypes: ["ad"] }],
    });
    return res.render("friends", {
      allUsers,
      currentUser,
      adSlots: mediaState.slots,
      adCatalogKeys: mediaState.adKeys,
      sidebarTest: mediaState.test,
      hasGifStepper: mediaState.anyGifStepper,
      isSignedIn,
    });
  } catch (err) {
    console.warn("Friends page query failed:", err && err.message ? err.message : err);
    const currentUser =
      res.locals.navData && res.locals.navData.user ? res.locals.navData.user : null;
    const isSignedIn = !!currentUser;
    const mediaState = buildMediaSlots({
      req,
      isSignedIn,
      slotPlan: [{ key: "sidebar", area: "sidebar", count: 2, includeTypes: ["ad"] }],
    });
    return res.render("friends", {
      allUsers: [],
      currentUser,
      adSlots: mediaState.slots,
      adCatalogKeys: mediaState.adKeys,
      sidebarTest: mediaState.test,
      hasGifStepper: mediaState.anyGifStepper,
      isSignedIn,
    });
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

// A Few Recipes — homepage: recently added recipes + sidebar data
app.get(["/recipes", "/recipes.html"], async (req, res) => {
  const currentUser =
    res.locals.navData && res.locals.navData.user ? res.locals.navData.user : null;
  try {
    const supabase = getSupabase();
    const cols =
      "id, slug, title, description, author, author_slug, category, prep_time, image_url, competition_name, competition_medal, avg_score, created_at";

    const [{ data: recentRecipes, error: recentError }, { data: topRated, error: topError }] =
      await Promise.all([
        supabase
          .from("recipe_detail_view")
          .select(cols)
          .order("created_at", { ascending: false })
          .limit(5),
        supabase
          .from("recipe_detail_view")
          .select(cols)
          .order("avg_score", { ascending: false, nullsFirst: false })
          .order("created_at", { ascending: false })
          .limit(5),
      ]);
    if (recentError) throw recentError;
    if (topError) throw topError;

    // All competitions for the homepage grid (most recent first)
    const { data: allCompetitions, error: compError } = await supabase
      .from("recipe_competitions")
      .select("id, name, event_date")
      .order("event_date", { ascending: false });
    if (compError) console.warn("recipe_competitions query error:", compError.message);

    const latestComp = (allCompetitions && allCompetitions[0]) || null;

    return res.render("recipe", {
      currentUser,
      recentRecipes: recentRecipes || [],
      topRated: topRated || [],
      latestCompetition: latestComp,
      allCompetitions: allCompetitions || [],
      sanitizeHtml,
    });
  } catch (err) {
    console.warn("Recipes homepage query failed:", err && err.message ? err.message : err);
    return res.render("recipe", {
      currentUser,
      recentRecipes: [],
      topRated: [],
      latestCompetition: null,
      allCompetitions: [],
      sanitizeHtml,
    });
  }
});

// A Few Recipes — all recipes index: filterable by category / competition
app.get(["/recipes/all", "/recipes/all.html"], async (req, res) => {
  const currentUser =
    res.locals.navData && res.locals.navData.user ? res.locals.navData.user : null;
  const { category, competition, author } = req.query;

  try {
    const supabase = getSupabase();
    const cols =
      "id, slug, title, description, author, author_slug, category, prep_time, image_url, competition_name, competition_medal, avg_score, created_at";

    let query = supabase
      .from("recipe_detail_view")
      .select(cols)
      .order("avg_score", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });

    if (category) query = query.eq("category", category);
    if (competition) query = query.eq("competition_name", competition);
    if (author) query = query.eq("author_slug", author);

    const [{ data: allRecipes, error: recipesError }, { data: filterData }] = await Promise.all([
      query,
      supabase.from("recipe_detail_view").select("category, competition_name"),
    ]);

    if (recipesError) throw recipesError;

    const tagRe = /<[^>]+>/g;
    const processed = (allRecipes || []).map((r) => ({
      ...r,
      plainDesc: (r.description || "")
        .replace(tagRe, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 200),
    }));

    const categories = [
      ...new Set((filterData || []).map((r) => r.category).filter(Boolean)),
    ].sort();
    const competitions = [
      ...new Set((filterData || []).map((r) => r.competition_name).filter(Boolean)),
    ].sort();

    return res.render("recipe", {
      currentUser,
      allRecipes: processed,
      categories,
      competitions,
      activeCategory: category || null,
      activeCompetition: competition || null,
      activeAuthor: author || null,
      recipe: null,
      recentRecipes: [],
      topRated: [],
      latestCompetition: null,
      sanitizeHtml,
    });
  } catch (err) {
    console.warn("Recipes all page query failed:", err && err.message ? err.message : err);
    return res.render("recipe", {
      currentUser,
      allRecipes: [],
      categories: [],
      competitions: [],
      activeCategory: null,
      activeCompetition: competition || null,
      recipe: null,
      recentRecipes: [],
      topRated: [],
      latestCompetition: null,
      sanitizeHtml,
    });
  }
});

// A Few Recipes — detail page: single recipe by slug
app.get("/recipe/:slug", (req, res) => {
  return res.redirect(`/recipes/${encodeURIComponent(req.params.slug)}`);
});

app.get("/recipes/:slug", async (req, res) => {
  const currentUser =
    res.locals.navData && res.locals.navData.user ? res.locals.navData.user : null;
  const { slug } = req.params;

  // Reject obviously invalid slugs (too long or containing path separators/null bytes)
  if (!slug || slug.length > 200 || slug.includes("/") || slug.includes("\0")) {
    return res.redirect("/recipes");
  }

  try {
    const supabase = getSupabase();
    const { data: recipe, error } = await supabase
      .from("recipe_detail_view")
      .select("*")
      .eq("slug", slug)
      .maybeSingle();

    if (error) throw error;
    if (!recipe) return res.redirect("/recipes");

    // Shape competition_result for the template
    const competition_result = recipe.competition_rank
      ? {
          medal: recipe.competition_medal,
          place:
            recipe.competition_rank === 1
              ? "1st Place"
              : recipe.competition_rank === 2
                ? "2nd Place"
                : "3rd Place",
          competition_name: recipe.competition_name,
        }
      : null;

    // Keep recipe comments independent from competition judging data.
    // If the table has not been migrated yet, skip comments gracefully.
    let recipeComments = [];
    const { data: commentsData, error: commentsError } = await supabase
      .from("recipe_comments")
      .select("id, user_id, guest_name, comment, created_at, updated_at")
      .eq("recipe_id", recipe.id)
      .order("created_at", { ascending: false });

    if (commentsError) {
      if (commentsError.code !== "42P01") {
        console.warn("recipe_comments query failed:", commentsError.message || commentsError);
      }
    } else if (Array.isArray(commentsData) && commentsData.length > 0) {
      const userIds = [...new Set(commentsData.map((c) => c.user_id).filter(Boolean))];
      const { data: commentUsers, error: usersError } = userIds.length
        ? await supabase.from("users").select("id, username, display_name").in("id", userIds)
        : { data: [], error: null };

      if (usersError) {
        console.warn("recipe_comments user lookup failed:", usersError.message || usersError);
      }

      const userMap = new Map(
        Array.isArray(commentUsers)
          ? commentUsers.map((u) => [
              u.id,
              {
                name: u.display_name || u.username || "User",
                username: u.username || null,
              },
            ])
          : []
      );

      recipeComments = commentsData
        .filter((c) => typeof c.comment === "string" && c.comment.trim().length > 0)
        .map((c) => {
          const user = c.user_id ? userMap.get(c.user_id) : null;
          return {
            id: c.id,
            body: c.comment,
            author: user ? user.name : c.guest_name || "Guest",
            author_slug: user ? user.username : null,
            created_at: c.updated_at || c.created_at,
          };
        });
    }

    return res.render("recipe", {
      currentUser,
      recipe: { ...recipe, competition_result },
      recipeComments,
      recentRecipes: [],
      latestCompetition: null,
      sanitizeHtml,
    });
  } catch (err) {
    console.warn("Recipe detail query failed:", err && err.message ? err.message : err);
    return res.status(500).render("recipe", {
      currentUser,
      recipe: null,
      recentRecipes: [],
      topRated: [],
      latestCompetition: null,
    });
  }
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
    const mediaState = buildMediaSlots({
      req,
      isSignedIn,
      slotPlan: [
        { key: "mainPromo", area: "main", count: 1, includeTypes: ["ad"] },
        { key: "sidebar", area: "sidebar", count: 2, includeTypes: ["ad"] },
      ],
    });

    return res.render("scoreboard", {
      rankedUsers,
      podiumUsers: rankedUsers.slice(0, 3),
      currentUser,
      adSlots: mediaState.slots,
      adCatalogKeys: mediaState.adKeys,
      sidebarTest: mediaState.test,
      hasGifStepper: mediaState.anyGifStepper,
      isSignedIn,
      leaderboardGeneratedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.warn("Brispace scoreboard query failed:", err && err.message ? err.message : err);
    const currentUser =
      res.locals.navData && res.locals.navData.user ? res.locals.navData.user : null;
    const mediaState = buildMediaSlots({
      req,
      isSignedIn: false,
      slotPlan: [
        { key: "mainPromo", area: "main", count: 1, includeTypes: ["ad"] },
        { key: "sidebar", area: "sidebar", count: 2, includeTypes: ["ad"] },
      ],
    });
    return res.render("scoreboard", {
      rankedUsers: [],
      podiumUsers: [],
      currentUser,
      adSlots: mediaState.slots,
      adCatalogKeys: mediaState.adKeys,
      sidebarTest: mediaState.test,
      hasGifStepper: mediaState.anyGifStepper,
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

// Direct-access rubric page for sharing a judge link without adding it to nav
app.get(["/cocktail-rubric", "/cocktail-rubric.html"], (req, res) => {
  return res.sendFile(path.join(__dirname, "cocktail-rubric.html"));
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
