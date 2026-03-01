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

module.exports = router;
