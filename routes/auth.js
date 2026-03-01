// routes/auth.js
const express = require("express");
const router = express.Router();
const { ensureFirebaseAdmin, getSupabase, requireSignedUser } = require("../js/utils/server-utils");

// Ensure firebase-admin is initialized and use shared Supabase client
const admin = ensureFirebaseAdmin();
const supabase = getSupabase();

// POST /auth/login
// Supports two flows:
// 1) Password-based: { username, password } (legacy)
// 2) Firebase ID token: { idToken }
router.post("/login", async (req, res) => {
  try {
    // Development shortcut: allow setting a local dev user id without Firebase
    if (process.env.NODE_ENV !== "production") {
      const devUserId = req.body && (req.body.devUserId || (req.body.dev === true && process.env.DEV_LOCAL_USER_ID));
      // Allow a developer-requested simulation of production cookie behavior.
      // simulateLive is enabled when any of:
      // - env `DEV_SIMULATE_LIVE=1`
      // - the POST body includes `simulateLive: true`
      // - (convenience) when running in non-production and a `devUserId` is provided
      //   so developers don't have to set an env variable before starting the server.
      const simulateLive = Boolean(
        process.env.DEV_SIMULATE_LIVE === "1" ||
          (req.body && req.body.simulateLive) ||
          (process.env.NODE_ENV !== "production" && req.body && req.body.devUserId)
      );
      if (devUserId) {
        // Primary dev cookie (httpOnly) used for normal local dev flows
        res.cookie("user_id", devUserId, {
          signed: true,
          httpOnly: true,
          secure: false,
          sameSite: "lax",
          maxAge: 1000 * 60 * 60 * 24 * 7,
        });

        // If developer wants to simulate production, also set a production-like cookie.
        // Note: browsers will only persist/send cookies with `Secure` when on HTTPS,
        // but setting this option helps exercise server-side logic and mirrors headers.
        if (simulateLive) {
          res.cookie("user_id_prod_sim", devUserId, {
            signed: true,
            httpOnly: true,
            secure: true,
            sameSite: "lax",
            maxAge: 1000 * 60 * 60 * 24 * 7,
          });

          // Also expose a readable dev cookie for client-side simulation/testing.
          // This is NOT used for security checks server-side; it's only for local UI behavior simulation.
          res.cookie("user_id_dev_readable", devUserId, {
            signed: false,
            httpOnly: false,
            secure: false,
            sameSite: "lax",
            maxAge: 1000 * 60 * 60 * 24 * 7,
          });
        }

        return res.json({ ok: true, userId: devUserId, dev: true, simulated: simulateLive });
      }
    }
    // Firebase token flow
    if (req.body && req.body.idToken) {
      if (!admin.apps.length)
        return res.status(500).json({ error: "Firebase not configured on server" });

      const idToken = req.body.idToken;
      let decoded;
      try {
        decoded = await admin.auth().verifyIdToken(idToken);
      } catch (err) {
        console.warn("Firebase token verification failed:", err && err.message ? err.message : err);
        return res.status(401).json({ error: "Invalid Firebase ID token" });
      }

      // Extract useful claims
      const firebaseUid = decoded.uid;
      const phone = decoded.phone_number || null;
      const email = decoded.email || null;
      const name = decoded.name || decoded.displayName || null;

      // Lookup existing user by firebase_uid
      const { data: existing, error: lookupErr } = await supabase
        .from("users")
        .select("id")
        .eq("firebase_uid", firebaseUid)
        .maybeSingle();

      if (lookupErr) {
        console.error("Supabase lookup error (auth login):", lookupErr);
        return res.status(500).json({ error: "Internal error" });
      }

      let userId = existing && existing.id;

      // If no user exists, create one (minimal profile)
      if (!userId) {
        const payload = {
          firebase_uid: firebaseUid,
          phone: phone,
          email: email,
          display_name: name,
        };
        const { data: inserted, error: insertErr } = await supabase
          .from("users")
          .insert(payload)
          .select("id")
          .maybeSingle();
        if (insertErr) {
          console.error("Supabase insert error (auth create user):", insertErr);
          return res.status(500).json({ error: "Failed to create user" });
        }
        userId = inserted && inserted.id;
      }

      if (!userId) return res.status(500).json({ error: "Failed to resolve user id" });

      // Set signed cookie for server-side edit gating
      res.cookie("user_id", userId, {
        signed: true,
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 1000 * 60 * 60 * 24 * 7,
      });

      return res.json({ ok: true, userId });
    }

    // Only Firebase ID token flow is supported.
    return res.status(400).json({ error: "Missing idToken" });
  } catch (err) {
    console.error("/auth/login error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /auth/logout
router.post("/logout", (req, res) => {
  res.clearCookie("user_id");
  return res.json({ ok: true });
});

module.exports = router;

// GET /auth/me - return server-side profile for signed-in user
router.get("/me", async (req, res) => {
  try {
    const signedUserId = requireSignedUser(req);
    if (!signedUserId) return res.status(401).json({ error: "Not authenticated" });

    const { data, error } = await supabase
      .from("user_profile_view")
      .select("*")
      .eq("user_id", signedUserId)
      .maybeSingle();

    if (error) {
      console.error("Supabase lookup error (/auth/me):", error);
      return res.status(500).json({ error: "Internal error" });
    }
    if (!data) return res.status(404).json({ error: "User profile not found" });

    return res.json({ ok: true, user: data });
  } catch (err) {
    console.error("Error in GET /auth/me:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});
