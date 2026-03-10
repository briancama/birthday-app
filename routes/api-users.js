const express = require("express");
const router = express.Router();
const { getSupabase, createSanitizer, requireSignedUser } = require("../js/utils/server-utils");

const supabase = getSupabase();

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
// Body: any subset of { status, hometown, fav_movie, fav_song, fav_food, looking_for, about_html }
const ALLOWED_PROFILE_FIELDS = [
  "status", "hometown", "fav_movie", "fav_song", "fav_food", "looking_for", "about_html",
];

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
        updates[field] = typeof val === "string" ? val.trim().slice(0, 300) : null;
      }
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
// Body: { items: [{rank, label}] }  — max N items where N = current user count
router.patch("/users/:id/top-n", async (req, res) => {
  try {
    const targetId = req.params.id;
    const signedUserId = requireSignedUser(req);
    if (!signedUserId) return res.status(401).json({ error: "Not authenticated" });
    if (signedUserId !== targetId) return res.status(403).json({ error: "Forbidden" });

    const { items } = req.body || {};
    if (!Array.isArray(items)) return res.status(400).json({ error: "items must be an array" });

    const clean = items
      .slice(0, 50) // hard cap
      .map((item, i) => ({
        rank: typeof item.rank === "number" ? item.rank : i + 1,
        label: typeof item.label === "string" ? item.label.trim().slice(0, 80) : "",
      }))
      .filter((item) => item.label);

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
