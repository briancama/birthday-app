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

module.exports = router;
