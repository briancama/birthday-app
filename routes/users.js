const express = require("express");
const router = express.Router();
const { getSupabase } = require("../js/utils/server-utils");

// Shared Supabase client
const supabase = getSupabase();

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
            is_public: true,
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

    // Map/normalize fields expected by templates/user.ejs
    const user = {
      id: data.user_id || data.id,
      display_name: data.display_name || data.user_display_name,
      headshot: data.headshot_url || data.user_headshot_url || data.headshot,
      profile_html: data.profile_html || data.prompt_html || data.prompt_html_safe,
      profile_bg_url: data.profile_bg_url,
      profile_bg_mode: data.profile_bg_mode || "cover",
      favorite_track: data.favorite_track_url || data.favorite_track || null,
    };

    const editMode = req.cookies && req.cookies.edit_profile === "1";

    res.render("user", { user, profile_title: data.profile_title, editMode });
  } catch (err) {
    console.error("Error in /users/:identifier route", err);
    res.status(500).send("Internal server error");
  }
});

module.exports = router;
