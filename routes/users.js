const express = require("express");
const router = express.Router();
const { getSupabase } = require("../js/utils/server-utils");
const fs = require("fs");
const path = require("path");
const profileThemes = require("../js/constants/profile-themes.json");

function _getThemeKeyFromUrl(url) {
  if (!url || typeof url !== "string") return "default";
  const fileName = url.split("/").pop() || "";
  return (
    fileName
      .replace(/\.[^.]+$/, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "default"
  );
}

function resolveProfileTheme(url) {
  const { tokens, backgroundKeys } = profileThemes;
  const key = _getThemeKeyFromUrl(url);
  if (!url) return { key: "default", tokens: tokens.default };

  const mappedKey = backgroundKeys[url];
  if (mappedKey && tokens[mappedKey]) return { key: mappedKey, tokens: tokens[mappedKey] };
  if (tokens[key]) return { key, tokens: tokens[key] };

  if (/star|space|night|galaxy|moon|nebula|cosmos/.test(key)) return { key, tokens: tokens.stars };
  if (/sun|dusk|retro|neon|city|fire|lava|flame/.test(key)) return { key, tokens: tokens.sunset };
  if (/matrix|hacker|terminal|green|cyber/.test(key)) return { key, tokens: tokens.matrix };
  if (/paper|grid|note|pastel|flower|cloud/.test(key)) return { key, tokens: tokens.paper };
  if (/kitty|heart|pooh|love|cute|pink/.test(key))
    return { key: "bubblegum", tokens: tokens.bubblegum };

  return { key, tokens: tokens.default };
}

// Shared Supabase client
const supabase = getSupabase();
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PROFILE_BACKGROUND_DIRECTORY = path.join(__dirname, "../images/backgrounds");
const PROFILE_BACKGROUND_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp"]);

function toBackgroundLabel(filename) {
  const ext = path.extname(filename);
  const base = path.basename(filename, ext);
  return (
    base
      .replace(/^bg[-_]?/i, "")
      .replace(/[-_]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/\b\w/g, (letter) => letter.toUpperCase()) || filename
  );
}

function getProfileBackgroundOptions() {
  try {
    return fs
      .readdirSync(PROFILE_BACKGROUND_DIRECTORY, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .filter((name) => PROFILE_BACKGROUND_EXTENSIONS.has(path.extname(name).toLowerCase()))
      .filter((name) => !name.includes("/") && !name.includes("\\"))
      .sort((a, b) => a.localeCompare(b))
      .map((filename) => ({
        filename,
        src: `/images/backgrounds/${filename}`,
        label: toBackgroundLabel(filename),
      }));
  } catch (error) {
    console.warn("Unable to read profile backgrounds directory:", error.message || error);
    return [];
  }
}

function normalizeTopNRefs(topN) {
  if (!Array.isArray(topN)) return [];
  return topN
    .map((entry) => {
      if (!entry) return null;
      if (typeof entry === "string") {
        const v = entry.trim();
        if (!v) return null;
        return UUID_REGEX.test(v) ? { userId: v } : { username: v.toLowerCase() };
      }
      if (typeof entry !== "object") return null;
      const userId =
        typeof entry.user_id === "string" && entry.user_id.trim()
          ? entry.user_id.trim()
          : typeof entry.id === "string" && entry.id.trim() && UUID_REGEX.test(entry.id.trim())
            ? entry.id.trim()
            : null;
      const username =
        typeof entry.username === "string" && entry.username.trim()
          ? entry.username.trim().toLowerCase()
          : null;
      if (userId) return { userId };
      if (username) return { username };
      return null;
    })
    .filter(Boolean);
}

function isPlaceholderUsername(username) {
  if (!username || typeof username !== "string") return false;
  return /^visitor_[a-z0-9]+$/i.test(username.trim());
}

// GET /users/:id
// Renders the user profile page using templates/user.ejs
router.get("/:identifier", async (req, res) => {
  const identifier = req.params.identifier;

  // UUID v4-ish check
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  try {
    let result = null;

    // If identifier looks like a UUID, try user_id first
    if (uuidRegex.test(identifier)) {
      const { data, error } = await supabase
        .from("user_profile_view")
        .select("*")
        .eq("user_id", identifier)
        .maybeSingle();
      if (error) throw error;
      result = data;
    }

    // If not found by id, try common username/display_name fields on the view
    if (!result) {
      // Only try username-like fields (do not use display_name)
      const fieldsToTry = ["username"];
      for (const field of fieldsToTry) {
        const { data, error } = await supabase
          .from("user_profile_view")
          .select("*")
          .eq(field, identifier)
          .maybeSingle();
        if (error) {
          console.warn("Supabase lookup error for field", field, error.message || error);
          continue;
        }
        if (data) {
          result = data;
          break;
        }
      }
    }

    // Fallback: if still not found in the view, try the users table directly
    if (!result) {
      try {
        const { data: u, error: ue } = await supabase
          .from("users")
          .select("id, username, display_name, headshot")
          .eq("username", identifier)
          .maybeSingle();
        if (ue) {
          console.warn("Supabase users lookup error:", ue.message || ue);
        } else if (u) {
          // Normalize to the same shape as the view so templates can render
          result = {
            user_id: u.id,
            display_name: u.display_name,
            headshot: u.headshot,
            profile_intro: null,
            profile_title: null,
            profile_details: [],
            is_published: false,
          };
        }
      } catch (e) {
        console.error("User table fallback error:", e && e.message ? e.message : e);
      }
    }

    if (!result) {
      return res.status(404).send("Profile not found");
    }

    const data = result;

    // Map/normalize all fields expected by templates/user.ejs
    const user = {
      id: data.user_id || data.id,
      username: data.username || null,
      display_name: data.display_name || data.user_display_name,
      headshot: data.headshot_url || data.user_headshot_url || data.headshot,
      about_html: data.about_html || data.prompt_html || null,
      profile_bg_url: data.profile_bg_url || null,
      profile_bg_mode: data.profile_bg_mode || "cover",
      profile_gif_key: data.profile_gif_key || null,
      // Sidebar detail fields
      status: data.status || null,
      hometown: data.hometown || null,
      fav_movie: data.fav_movie || null,
      fav_song: data.fav_song || null,
      general_interest: data.general_interest || null,
      television: data.television || null,
      // Top N — ensure it's always an array
      top_n: Array.isArray(data.top_n) ? data.top_n : [],
      // Publish toggle state
      is_published: data.is_published === true,
    };

    // Resolve displayed Top N user cards from stored refs
    let topNUsers = [];
    const topNRefs = normalizeTopNRefs(user.top_n);
    try {
      const idRefs = [...new Set(topNRefs.map((r) => r.userId).filter(Boolean))];
      const usernameRefs = [...new Set(topNRefs.map((r) => r.username).filter(Boolean))];
      const byId = {};
      const byUsername = {};

      const queries = [];
      if (idRefs.length) {
        queries.push(
          supabase.from("users").select("id, username, display_name, headshot").in("id", idRefs)
        );
      }
      if (usernameRefs.length) {
        queries.push(
          supabase
            .from("users")
            .select("id, username, display_name, headshot")
            .in("username", usernameRefs)
        );
      }

      const results = await Promise.all(queries);
      results.forEach((r) => {
        if (Array.isArray(r.data)) {
          r.data.forEach((u) => {
            if (u?.id) byId[u.id] = u;
            if (u?.username) byUsername[u.username.toLowerCase()] = u;
          });
        }
      });

      const seen = new Set();
      topNUsers = topNRefs
        .map((ref) => (ref.userId ? byId[ref.userId] : byUsername[ref.username]))
        .filter((u) => {
          if (!u || seen.has(u.id)) return false;
          seen.add(u.id);
          return true;
        });
    } catch (e) {
      console.warn("topN users query failed:", e.message);
    }
    const topNCount = topNUsers.length;

    // Fetch user's achievements (server-side) so profile pages show badges immediately
    let userAchievements = [];
    try {
      const { data: ua, error: uaErr } = await supabase
        .from("user_achievements")
        .select(
          "achievement_id, awarded_at, achievements!inner(name,description,image_url,is_visitor_eligible)"
        )
        .eq("user_id", data.user_id || data.id)
        .eq("achievements.is_visitor_eligible", true)
        .order("awarded_at", { ascending: false });
      if (!uaErr && Array.isArray(ua)) userAchievements = ua;
    } catch (e) {
      console.warn("user achievements query failed:", e && e.message ? e.message : e);
    }

    // Render template; wrap to provide clearer template error context when EJS fails
    try {
      // Use navData.user.id for current user identity
      let isOwnProfile = false;
      let isInTopN = false;
      let isTopNFull = false;
      const profileBackgroundOptions = getProfileBackgroundOptions().map((bg) => ({
        ...bg,
        themeName: profileThemes.names[resolveProfileTheme(bg.src).key] || "Classic",
      }));
      const activeTheme = resolveProfileTheme(user.profile_bg_url);
      const hasProfileTheme = !!user.profile_bg_url;
      const activeThemeInlineStyle = hasProfileTheme
        ? [
            `background-image: url('${user.profile_bg_url}')`,
            "background-repeat: repeat",
            "background-size: auto",
            `--profile-theme-section-bg: ${activeTheme.tokens.sectionBg}`,
            `--profile-theme-section-text: ${activeTheme.tokens.sectionText}`,
            `--profile-theme-section-border: ${activeTheme.tokens.sectionBorder}`,
            `--profile-theme-heading-bg: ${activeTheme.tokens.headingBg}`,
            `--profile-theme-heading-text: ${activeTheme.tokens.headingText}`,
            `--profile-theme-detail-bg: ${activeTheme.tokens.detailBg}`,
            `--profile-theme-link: ${activeTheme.tokens.link}`,
            `--profile-theme-link-hover: ${activeTheme.tokens.linkHover}`,
          ].join("; ")
        : "";
      const navUserId =
        res.locals && res.locals.navData && res.locals.navData.user && res.locals.navData.user.id;
      const profileId = (user.id || "") + "";
      if (navUserId && navUserId === profileId) isOwnProfile = true;

      // First-time identity setup: users created with a temp visitor username and no display name
      // must choose both fields before continuing profile editing.
      const needsIdentitySetup =
        isOwnProfile &&
        isPlaceholderUsername(user.username) &&
        !String(user.display_name || "").trim();

      // For Add-to-Top-8 button: compute whether viewed profile is already in VIEWER's Top N,
      // and whether viewer's Top N is at capacity.
      if (navUserId && !isOwnProfile) {
        try {
          const { data: viewerProfile } = await supabase
            .from("user_profile")
            .select("top_n")
            .eq("user_id", navUserId)
            .maybeSingle();

          const viewerRefs = normalizeTopNRefs(viewerProfile?.top_n || []);
          const viewerIds = new Set(viewerRefs.map((r) => r.userId).filter(Boolean));
          const viewerUsernames = new Set(viewerRefs.map((r) => r.username).filter(Boolean));

          isTopNFull = viewerRefs.length >= 8;
          isInTopN =
            viewerIds.has(profileId) ||
            (user.username ? viewerUsernames.has(String(user.username).toLowerCase()) : false);
        } catch (e) {
          console.warn("Failed to compute viewer top_n status:", e.message || e);
        }
      }

      res.render("user", {
        user,
        profile_title: data.profile_title,
        topNCount,
        topNUsers: topNUsers || [],
        userAchievements: userAchievements || [],
        isOwnProfile,
        needsIdentitySetup,
        isInTopN,
        isTopNFull,
        profileBackgroundOptions,
        activeTheme,
        hasProfileTheme,
        activeThemeInlineStyle,
      });
    } catch (renderErr) {
      // Log a helpful snippet around the reported template line if available
      console.error(
        "EJS render error for templates/user.ejs:",
        renderErr && renderErr.message ? renderErr.message : renderErr
      );
      try {
        const match =
          (renderErr && renderErr.message && renderErr.message.match(/\((\d+):(\d+)\)/)) || null;
        const tplPath = path.join(__dirname, "../templates/user.ejs");
        if (match && fs.existsSync(tplPath)) {
          const errLine = parseInt(match[1], 10);
          const file = fs.readFileSync(tplPath, "utf8").split("\n");
          const start = Math.max(0, errLine - 4);
          const end = Math.min(file.length, errLine + 3);
          console.error(`--- ${tplPath}:${errLine} (context) ---`);
          for (let i = start; i < end; i++) {
            const lineMarker = i + 1 === errLine ? "=>" : "  ";
            console.error(`${lineMarker} ${i + 1}: ${file[i]}`);
          }
          console.error("--- end template context ---");
        }
      } catch (innerErr) {
        console.error("Failed to show template context:", innerErr);
      }
      return res.status(500).send("Template rendering error (see server logs)");
    }
  } catch (err) {
    console.error("Error in /users/:identifier route", err);
    res.status(500).send("Internal server error");
  }
});

module.exports = router;
