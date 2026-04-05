const express = require("express");
const router = express.Router();
const { getSupabase, createSanitizer, requireSignedUser } = require("../js/utils/server-utils");
const fs = require("fs");
const path = require("path");

const supabase = getSupabase();
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PROFILE_GIF_KEYS = new Set([
  "afro-ninja",
  "aim",
  "backstreet-boys",
  "banana",
  "buffy",
  "dancingbaby",
  "dolphin",
  "elmo-fire",
  "gogeta-fusion",
  "hangover",
  "hide-the-simpsons",
  "i-said-hey-he-man",
  "internet-dial-up",
  "keycat-keyboard",
  "kermit-the-frog-tea",
  "leeroy-jenkins",
  "mind-blown",
  "not-okay-my-chemical-romance",
  "nsync",
  "roller-skate",
  "smash-bros",
  "snake-juice",
  "spit-hot-fire",
  "spongebob",
]);
const PROFILE_BACKGROUND_DIRECTORY = path.join(__dirname, "../images/backgrounds");
const PROFILE_BACKGROUND_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp"]);

function getAllowedProfileBackgroundUrls() {
  try {
    return fs
      .readdirSync(PROFILE_BACKGROUND_DIRECTORY, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .filter((name) => PROFILE_BACKGROUND_EXTENSIONS.has(path.extname(name).toLowerCase()))
      .filter((name) => !name.includes("/") && !name.includes("\\"))
      .sort((a, b) => a.localeCompare(b))
      .map((name) => `/images/backgrounds/${name}`);
  } catch (error) {
    console.warn("Unable to read profile backgrounds directory:", error.message || error);
    return [];
  }
}

const PROFILE_BACKGROUND_URLS = new Set(getAllowedProfileBackgroundUrls());

function extractTopNIdentifier(entry) {
  if (!entry) return null;
  if (typeof entry === "string") return entry.trim() || null;
  if (typeof entry !== "object") return null;
  if (typeof entry.user_id === "string" && entry.user_id.trim()) return entry.user_id.trim();
  if (typeof entry.id === "string" && entry.id.trim()) return entry.id.trim();
  if (typeof entry.username === "string" && entry.username.trim()) return entry.username.trim();
  if (typeof entry.label === "string" && entry.label.trim()) return entry.label.trim();
  return null;
}

async function normalizeTopNEntries(items, maxItems = 8) {
  if (!Array.isArray(items) || items.length === 0) return [];

  const ordered = [];
  const usernameCandidates = [];

  items.forEach((entry) => {
    const identifier = extractTopNIdentifier(entry);
    if (!identifier) return;
    if (UUID_REGEX.test(identifier)) {
      ordered.push({ type: "id", value: identifier });
    } else {
      const uname = identifier.toLowerCase();
      ordered.push({ type: "username", value: uname });
      usernameCandidates.push(uname);
    }
  });

  const usernameToId = {};
  if (usernameCandidates.length > 0) {
    const uniqueUsernames = [...new Set(usernameCandidates)];
    const { data: rows, error } = await supabase
      .from("users")
      .select("id, username")
      .in("username", uniqueUsernames);
    if (!error && Array.isArray(rows)) {
      rows.forEach((u) => {
        if (u?.username && u?.id) usernameToId[u.username.toLowerCase()] = u.id;
      });
    }
  }

  const seen = new Set();
  const normalized = [];
  for (const ref of ordered) {
    const userId = ref.type === "id" ? ref.value : usernameToId[ref.value];
    if (!userId || seen.has(userId)) continue;
    seen.add(userId);
    normalized.push({ user_id: userId });
    if (normalized.length >= maxItems) break;
  }

  return normalized;
}

// POST /api/users/:id/challenge
// Triggers assignment of the next available challenge to the target user and
// creates a notification for them. Requires the caller to be authenticated.
router.post("/users/:id/challenge", async (req, res) => {
  try {
    const rawTarget = req.params.id;
    const signedUserId = requireSignedUser(req);
    if (!signedUserId) return res.status(401).json({ error: "Not authenticated" });

    // Resolve target: allow either UUID (users.id) or username slug in URL
    let targetUserId = rawTarget;
    const uuidRegex =
      /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
    if (!uuidRegex.test(rawTarget)) {
      // Looks like a username slug — look up the user's UUID
      try {
        const { data: userRow, error: userErr } = await supabase
          .from("users")
          .select("id")
          .eq("username", rawTarget)
          .maybeSingle();
        if (userErr) throw userErr;
        if (!userRow || !userRow.id)
          return res.status(404).json({ error: "Target user not found" });
        targetUserId = userRow.id;
      } catch (lookupErr) {
        console.error("Failed to look up target user by username:", lookupErr.message || lookupErr);
        return res.status(500).json({ error: "Failed to resolve target user" });
      }
    }

    if (signedUserId === targetUserId)
      return res.status(400).json({ error: "Cannot challenge yourself" });

    // 1. Check the target's active challenge count (cap = 2)
    const { count: activeCount, error: countErr } = await supabase
      .from("assignments")
      .select("id", { count: "exact", head: true })
      .eq("user_id", targetUserId)
      .not("triggered_at", "is", null)
      .is("completed_at", null);

    if (countErr) {
      console.error("Failed to count active challenges:", countErr.message);
      return res.status(500).json({ error: "Failed to check challenge capacity" });
    }

    if (activeCount >= 2) {
      return res.status(409).json({
        error: "User is at challenge capacity",
        active_count: activeCount,
      });
    }

    // 2. Find the next dormant assignment for the target (oldest assigned_at).
    //    Does NOT filter on active — we re-activate it as part of the trigger.
    const { data: dormant, error: dormantErr } = await supabase
      .from("assignments")
      .select("id")
      .eq("user_id", targetUserId)
      .is("triggered_at", null)
      .is("completed_at", null)
      .order("assigned_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (dormantErr) {
      console.error("Failed to find dormant assignment:", dormantErr.message);
      return res.status(500).json({ error: "Failed to find next challenge" });
    }

    if (!dormant) {
      return res.status(404).json({ error: "No dormant challenges remaining for this user" });
    }

    // 3. Trigger: set active = true, triggered_at, and record who challenged
    const { error: triggerErr } = await supabase
      .from("assignments")
      .update({
        active: true,
        triggered_at: new Date().toISOString(),
        updated_by: signedUserId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", dormant.id);

    if (triggerErr) {
      console.error("Failed to trigger assignment:", triggerErr.message);
      return res.status(500).json({ error: "Failed to trigger challenge" });
    }

    // 4. Create a notification for the target
    let notif = null;
    try {
      const { data: notifData, error: notifErr } = await supabase
        .from("notifications")
        .insert({
          user_id: targetUserId,
          payload: {
            type: "challenge_triggered",
            from_user: signedUserId,
            assignment_id: dormant.id,
          },
          read: false,
        })
        .select()
        .single();
      if (!notifErr) notif = notifData;
    } catch (notifyErr) {
      // Non-fatal — assignment was triggered successfully
      console.warn("Failed to create challenge notification:", notifyErr.message || notifyErr);
    }

    // 5. Check and award social_butterfly achievement for the challenger (non-fatal)
    let achievement = null;
    try {
      const { data: achData } = await supabase.rpc("rpc_award_on_challenge_threshold", {
        p_user_id: signedUserId,
      });
      const achRow = Array.isArray(achData) ? achData[0] : achData;
      if (achRow?.awarded) {
        const { data: ach } = await supabase
          .from("achievements")
          .select("key, name, points")
          .eq("id", achRow.achievement_id)
          .maybeSingle();
        achievement = ach || null;
      }
    } catch (achieveErr) {
      console.warn(
        "Failed to check challenge threshold achievement:",
        achieveErr.message || achieveErr
      );
    }

    return res.json({ ok: true, assignment_id: dormant.id, notification: notif, achievement });
  } catch (err) {
    console.error("Error in POST /api/users/:id/challenge", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/assignments/:id/swap
// Lets the authenticated user swap out one of their own active (triggered,
// incomplete) challenges back to dormant and activates the next dormant one
// in queue instead. The swap is self-service — the caller must own the
// assignment being swapped out.
router.post("/assignments/:id/swap", async (req, res) => {
  try {
    const signedUserId = requireSignedUser(req);
    if (!signedUserId) return res.status(401).json({ error: "Not authenticated" });

    const assignmentId = req.params.id;

    // 1. Verify the assignment belongs to the signed user and is triggered+incomplete
    const { data: assignment, error: fetchErr } = await supabase
      .from("assignments")
      .select("id, user_id, triggered_at, completed_at")
      .eq("id", assignmentId)
      .maybeSingle();

    if (fetchErr) {
      console.error("swap: failed to fetch assignment:", fetchErr.message);
      return res.status(500).json({ error: "Failed to fetch assignment" });
    }
    if (!assignment) return res.status(404).json({ error: "Assignment not found" });
    if (assignment.user_id !== signedUserId)
      return res.status(403).json({ error: "Not your challenge" });
    if (!assignment.triggered_at)
      return res.status(400).json({ error: "Challenge is not currently active" });
    if (assignment.completed_at)
      return res.status(400).json({ error: "Challenge is already completed" });

    // 2. Find the next dormant assignment for this user (oldest assigned_at),
    //    excluding the one being swapped out.
    const { data: dormant, error: dormantErr } = await supabase
      .from("assignments")
      .select("id")
      .eq("user_id", signedUserId)
      .is("triggered_at", null)
      .is("completed_at", null)
      .neq("id", assignmentId)
      .order("assigned_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (dormantErr) {
      console.error("swap: failed to find dormant:", dormantErr.message);
      return res.status(500).json({ error: "Failed to find next challenge" });
    }
    if (!dormant) {
      return res.status(404).json({ error: "No dormant challenges available to swap in" });
    }

    // 3. Un-trigger the current assignment (reset to dormant)
    const { error: resetErr } = await supabase
      .from("assignments")
      .update({
        triggered_at: null,
        active: false,
        updated_at: new Date().toISOString(),
      })
      .eq("id", assignmentId);

    if (resetErr) {
      console.error("swap: failed to reset assignment:", resetErr.message);
      return res.status(500).json({ error: "Failed to swap out challenge" });
    }

    // 4. Trigger the dormant assignment
    const { error: triggerErr } = await supabase
      .from("assignments")
      .update({
        active: true,
        triggered_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", dormant.id);

    if (triggerErr) {
      console.error("swap: failed to trigger new assignment:", triggerErr.message);
      // Attempt to roll back the reset (best-effort)
      await supabase
        .from("assignments")
        .update({ triggered_at: assignment.triggered_at, active: true })
        .eq("id", assignmentId);
      return res.status(500).json({ error: "Failed to swap in new challenge" });
    }

    return res.json({ ok: true, swapped_out: assignmentId, swapped_in: dormant.id });
  } catch (err) {
    console.error("Error in POST /api/assignments/:id/swap", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/users/active-challenge-counts
// Returns active (triggered, incomplete) challenge counts and total incomplete
// (dormant + active) counts per user. Used by character select to enforce the
// 2-challenge cap and to disable players who have no challenges remaining.
router.get("/users/active-challenge-counts", async (req, res) => {
  try {
    const [activeResult, incompleteResult] = await Promise.all([
      supabase
        .from("assignments")
        .select("user_id")
        .not("triggered_at", "is", null)
        .is("completed_at", null)
        .eq("active", true),
      supabase.from("assignments").select("user_id").is("completed_at", null),
    ]);

    if (activeResult.error) throw activeResult.error;
    if (incompleteResult.error) throw incompleteResult.error;

    const counts = {};
    (activeResult.data || []).forEach(({ user_id }) => {
      counts[user_id] = (counts[user_id] || 0) + 1;
    });

    const incompleteCounts = {};
    (incompleteResult.data || []).forEach(({ user_id }) => {
      incompleteCounts[user_id] = (incompleteCounts[user_id] || 0) + 1;
    });

    return res.json({ counts, incompleteCounts });
  } catch (err) {
    console.error("Error in GET /api/users/active-challenge-counts", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/users/:id/profile
// Body: { profile_html }
router.post("/users/:id/profile", async (req, res) => {
  try {
    const targetId = req.params.id;
    const signedUserId = requireSignedUser(req);
    if (!signedUserId) return res.status(401).json({ error: "Not authenticated" });
    if (signedUserId !== targetId) return res.status(403).json({ error: "Forbidden" });

    const { profile_html } = req.body || {};
    if (typeof profile_html !== "string")
      return res.status(400).json({ error: "Invalid profile_html" });

    // Sanitize server-side
    const DOMPurify = createSanitizer();
    const clean = DOMPurify.sanitize(profile_html);

    // Upsert into user_profile table
    const payload = {
      user_id: signedUserId,
      profile_html: clean,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("user_profile")
      .upsert(payload, { onConflict: "user_id" })
      .select()
      .single();

    if (error) {
      console.error("Supabase upsert error:", error.message || error);
      return res.status(500).json({ error: "Database error" });
    }

    return res.json({ ok: true, profile: data });
  } catch (err) {
    console.error("Error in POST /api/users/:id/profile", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/users/:id/register
// Onboarding: set display_name + username, create stub user_profile row.
// Body: { display_name }
router.post("/users/:id/register", async (req, res) => {
  try {
    const targetId = req.params.id;
    const signedUserId = requireSignedUser(req);
    if (!signedUserId) return res.status(401).json({ error: "Not authenticated" });
    if (signedUserId !== targetId) return res.status(403).json({ error: "Forbidden" });

    const { display_name } = req.body || {};
    if (!display_name || typeof display_name !== "string" || !display_name.trim())
      return res.status(400).json({ error: "display_name is required" });

    const cleanName = display_name.trim().slice(0, 60);

    // Generate a URL-safe username slug from the display name
    const baseSlug =
      cleanName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "")
        .slice(0, 16) || "user";

    // Try the base slug then append random 4-digit suffix until unique
    let username = null;
    for (let attempt = 0; attempt < 6; attempt++) {
      const candidate =
        attempt === 0 ? baseSlug : `${baseSlug}${Math.floor(Math.random() * 9000) + 1000}`;
      const { data: existing } = await supabase
        .from("users")
        .select("id")
        .eq("username", candidate)
        .neq("id", targetId)
        .maybeSingle();
      if (!existing) {
        username = candidate;
        break;
      }
    }
    if (!username)
      return res
        .status(409)
        .json({ error: "Could not generate a unique username. Try a different name." });

    // Update users row
    const { error: updateErr } = await supabase
      .from("users")
      .update({ display_name: cleanName, username })
      .eq("id", targetId);
    if (updateErr) {
      console.error("register update error:", updateErr.message);
      return res.status(500).json({ error: "Failed to update user" });
    }

    // Ensure a stub user_profile row exists so user_profile_view resolves immediately
    const { error: profileErr } = await supabase
      .from("user_profile")
      .upsert({ user_id: targetId }, { onConflict: "user_id", ignoreDuplicates: true });
    if (profileErr) {
      console.warn("user_profile stub upsert warning:", profileErr.message);
    }

    return res.json({ ok: true, username });
  } catch (err) {
    console.error("Error in POST /api/users/:id/register", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ── Profile fields ─────────────────────────────────────────────────────────
// PATCH /api/users/:id/profile-fields
// Body: any subset of allowed profile fields. We've removed `fav_food` and added
// `general_interest` and `television` to support the new Interests UI.
const ALLOWED_PROFILE_FIELDS = [
  "status",
  "hometown",
  "age",
  "fav_movie",
  "fav_song",
  "looking_for",
  "about_html",
  "general_interest",
  "television",
  "is_published",
  "profile_gif_key",
  "profile_bg_url",
  "profile_bg_mode",
];

// Note: looking_for was removed — column does not exist in user_profile table.

router.patch("/users/:id/profile-fields", async (req, res) => {
  try {
    const targetId = req.params.id;
    const signedUserId = requireSignedUser(req);
    if (!signedUserId) return res.status(401).json({ error: "Not authenticated" });
    if (signedUserId !== targetId) return res.status(403).json({ error: "Forbidden" });

    const updates = {};
    for (const field of ALLOWED_PROFILE_FIELDS) {
      if (field in (req.body || {})) {
        const val = req.body[field];
        if (field === "is_published") {
          // Accept boolean or string 'true'/'false'
          updates[field] = val === true || val === "true";
        } else if (field === "profile_gif_key") {
          if (typeof val !== "string" || !val.trim()) {
            updates[field] = null;
          } else {
            const normalized = val.trim().toLowerCase();
            updates[field] = PROFILE_GIF_KEYS.has(normalized) ? normalized : null;
          }
        } else if (field === "profile_bg_mode") {
          const normalizedMode = typeof val === "string" ? val.trim().toLowerCase() : "";
          updates[field] = normalizedMode === "tile" ? "tile" : "cover";
        } else if (field === "profile_bg_url") {
          if (typeof val !== "string" || !val.trim()) {
            updates[field] = null;
          } else {
            const normalizedUrl = val.trim();
            updates[field] = PROFILE_BACKGROUND_URLS.has(normalizedUrl) ? normalizedUrl : null;
          }
        } else {
          updates[field] = typeof val === "string" ? val.trim().slice(0, 300) : null;
        }
      }
    }
    // Coerce age to integer (stored as integer column)
    if ("age" in updates) {
      const parsed = parseInt(updates.age, 10);
      updates.age = !isNaN(parsed) && parsed > 0 && parsed < 150 ? parsed : null;
    }

    if (Object.keys(updates).length === 0)
      return res.status(400).json({ error: "No valid fields provided" });

    updates.user_id = targetId;
    updates.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from("user_profile")
      .upsert(updates, { onConflict: "user_id" })
      .select()
      .single();

    if (error) {
      console.error("profile-fields upsert error:", error.message);
      return res.status(500).json({ error: "Database error" });
    }
    return res.json({ ok: true, profile: data });
  } catch (err) {
    console.error("Error in PATCH /api/users/:id/profile-fields", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /api/users/:id/top-n
// Body: { items: [{ user_id }] } (legacy username/label/id values are best-effort normalized)
router.patch("/users/:id/top-n", async (req, res) => {
  try {
    const targetId = req.params.id;
    const signedUserId = requireSignedUser(req);
    if (!signedUserId) return res.status(401).json({ error: "Not authenticated" });
    if (signedUserId !== targetId) return res.status(403).json({ error: "Forbidden" });

    const { items } = req.body || {};
    if (!Array.isArray(items)) return res.status(400).json({ error: "items must be an array" });

    const clean = await normalizeTopNEntries(items, 8);

    const { error } = await supabase
      .from("user_profile")
      .upsert(
        { user_id: targetId, top_n: clean, updated_at: new Date().toISOString() },
        { onConflict: "user_id" }
      );

    if (error) {
      console.error("top-n upsert error:", error.message);
      return res.status(500).json({ error: "Database error" });
    }
    return res.json({ ok: true, top_n: clean });
  } catch (err) {
    console.error("Error in PATCH /api/users/:id/top-n", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/users/:id/top-n/add
// Body: { targetUserId } — adds target user to caller's Top 8 (max 8)
router.post("/users/:id/top-n/add", async (req, res) => {
  try {
    const ownerId = req.params.id;
    const signedUserId = requireSignedUser(req);
    if (!signedUserId) return res.status(401).json({ error: "Not authenticated" });
    if (signedUserId !== ownerId) return res.status(403).json({ error: "Forbidden" });

    const targetUserId =
      typeof req.body?.targetUserId === "string" ? req.body.targetUserId.trim() : "";
    if (!targetUserId || !UUID_REGEX.test(targetUserId)) {
      return res.status(400).json({ error: "targetUserId must be a valid user id" });
    }
    if (targetUserId === ownerId) {
      return res.status(400).json({ error: "Cannot add yourself to Top 8" });
    }

    const { data: targetUser, error: targetErr } = await supabase
      .from("users")
      .select("id")
      .eq("id", targetUserId)
      .maybeSingle();
    if (targetErr) throw targetErr;
    if (!targetUser) return res.status(404).json({ error: "Target user not found" });

    const { data: profile, error: profileErr } = await supabase
      .from("user_profile")
      .select("top_n")
      .eq("user_id", ownerId)
      .maybeSingle();
    if (profileErr) throw profileErr;

    const current = await normalizeTopNEntries(profile?.top_n || [], 8);
    const ids = current.map((x) => x.user_id);

    if (ids.includes(targetUserId)) {
      return res.json({
        ok: true,
        already_added: true,
        top_n: current,
        is_full: current.length >= 8,
      });
    }
    if (current.length >= 8) {
      return res.status(409).json({ error: "Top 8 is full", top_n: current, is_full: true });
    }

    const next = [...current, { user_id: targetUserId }];
    const { error: upsertErr } = await supabase
      .from("user_profile")
      .upsert(
        { user_id: ownerId, top_n: next, updated_at: new Date().toISOString() },
        { onConflict: "user_id" }
      );
    if (upsertErr) throw upsertErr;

    return res.json({ ok: true, top_n: next, is_full: next.length >= 8 });
  } catch (err) {
    console.error("Error in POST /api/users/:id/top-n/add", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /api/users/:id/top-n/:targetUserId
// Removes a target user from caller's Top 8
router.delete("/users/:id/top-n/:targetUserId", async (req, res) => {
  try {
    const ownerId = req.params.id;
    const targetUserId = req.params.targetUserId;
    const signedUserId = requireSignedUser(req);
    if (!signedUserId) return res.status(401).json({ error: "Not authenticated" });
    if (signedUserId !== ownerId) return res.status(403).json({ error: "Forbidden" });
    if (!targetUserId || !UUID_REGEX.test(targetUserId)) {
      return res.status(400).json({ error: "targetUserId must be a valid user id" });
    }

    const { data: profile, error: profileErr } = await supabase
      .from("user_profile")
      .select("top_n")
      .eq("user_id", ownerId)
      .maybeSingle();
    if (profileErr) throw profileErr;

    const current = await normalizeTopNEntries(profile?.top_n || [], 8);
    const next = current.filter((entry) => entry.user_id !== targetUserId);

    const { error: upsertErr } = await supabase
      .from("user_profile")
      .upsert(
        { user_id: ownerId, top_n: next, updated_at: new Date().toISOString() },
        { onConflict: "user_id" }
      );
    if (upsertErr) throw upsertErr;

    return res.json({ ok: true, top_n: next, is_full: next.length >= 8 });
  } catch (err) {
    console.error("Error in DELETE /api/users/:id/top-n/:targetUserId", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ── Profile wall ────────────────────────────────────────────────────────────
// GET /api/users/:id/wall
router.get("/users/:id/wall", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("profile_wall")
      .select("id, author_user_id, author_name, message, created_at")
      .eq("target_user_id", req.params.id)
      .order("created_at", { ascending: false })
      .limit(30);

    if (error) {
      console.error("wall select error:", error.message);
      return res.status(500).json({ error: "Database error" });
    }
    return res.json({ ok: true, entries: data || [] });
  } catch (err) {
    console.error("Error in GET /api/users/:id/wall", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/users/:id/wall
// Body: { message }  — author_name resolved from signed-in user's display_name
router.post("/users/:id/wall", async (req, res) => {
  try {
    const targetId = req.params.id;
    const signedUserId = requireSignedUser(req);
    if (!signedUserId) return res.status(401).json({ error: "Not authenticated" });

    const message = (req.body?.message || "").trim().slice(0, 500);
    if (!message) return res.status(400).json({ error: "Message is required" });

    // Resolve author display_name
    const { data: author } = await supabase
      .from("users")
      .select("display_name, username")
      .eq("id", signedUserId)
      .maybeSingle();
    const authorName = author?.display_name || author?.username || "Anonymous";

    const { data, error } = await supabase
      .from("profile_wall")
      .insert({
        target_user_id: targetId,
        author_user_id: signedUserId,
        author_name: authorName,
        message,
      })
      .select()
      .single();

    if (error) {
      console.error("wall insert error:", error.message);
      return res.status(500).json({ error: "Database error" });
    }
    return res.json({ ok: true, entry: data });
  } catch (err) {
    console.error("Error in POST /api/users/:id/wall", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /api/users/:id/wall/:entryId
// Allowed if signed user is the author or the profile owner
router.delete("/users/:id/wall/:entryId", async (req, res) => {
  try {
    const { id: targetId, entryId } = req.params;
    const signedUserId = requireSignedUser(req);
    if (!signedUserId) return res.status(401).json({ error: "Not authenticated" });

    const { data: entry } = await supabase
      .from("profile_wall")
      .select("author_user_id, target_user_id")
      .eq("id", entryId)
      .maybeSingle();

    if (!entry) return res.status(404).json({ error: "Entry not found" });

    const canDelete =
      signedUserId === entry.author_user_id || signedUserId === entry.target_user_id;
    if (!canDelete) return res.status(403).json({ error: "Forbidden" });

    const { error } = await supabase.from("profile_wall").delete().eq("id", entryId);
    if (error) {
      console.error("wall delete error:", error.message);
      return res.status(500).json({ error: "Database error" });
    }
    return res.json({ ok: true });
  } catch (err) {
    console.error("Error in DELETE /api/users/:id/wall/:entryId", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
