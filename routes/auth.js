// routes/auth.js
const express = require("express");
const router = express.Router();
const { ensureFirebaseAdmin, getSupabase, requireSignedUser } = require("../js/utils/server-utils");

// Ensure firebase-admin is initialized and use shared Supabase client
const admin = ensureFirebaseAdmin();
const supabase = getSupabase();
const SESSION_COOKIE_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 2;

async function generateBrianFanDisplayName() {
  const { count, error: countErr } = await supabase
    .from("users")
    .select("id", { count: "exact", head: true });

  if (countErr) throw countErr;

  let nextNumber = Math.max(1, Number(count) || 1);

  // Keep incrementing if the candidate is already taken.
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const candidate = `Brian Fan #${nextNumber}`;
    const { data, error } = await supabase
      .from("users")
      .select("id")
      .eq("display_name", candidate)
      .maybeSingle();

    if (error && error.code !== "PGRST116") throw error;
    if (!data) return candidate;

    nextNumber += 1;
  }

  return `Brian Fan #${Date.now()}`;
}

// POST /auth/login
// Supports two flows:
// 1) Password-based: { username, password } (legacy)
// 2) Firebase ID token: { idToken }
router.post("/login", async (req, res) => {
  try {
    // Development shortcut: allow setting a local dev user id without Firebase
    if (process.env.NODE_ENV !== "production") {
      const devUserId =
        req.body &&
        (req.body.devUserId || (req.body.dev === true && process.env.DEV_LOCAL_USER_ID));
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
          maxAge: SESSION_COOKIE_MAX_AGE_MS,
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
            maxAge: SESSION_COOKIE_MAX_AGE_MS,
          });

          // Also expose a readable dev cookie for client-side simulation/testing.
          // This is NOT used for security checks server-side; it's only for local UI behavior simulation.
          res.cookie("user_id_dev_readable", devUserId, {
            signed: false,
            httpOnly: false,
            secure: false,
            sameSite: "lax",
            maxAge: SESSION_COOKIE_MAX_AGE_MS,
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

      // First login for a pre-authorized user: firebase_uid not set yet, but phone_number exists.
      // Find by phone_number and stamp their row with the firebase_uid.
      if (!userId && phone) {
        const { data: byPhone, error: phoneErr } = await supabase
          .from("users")
          .select("id")
          .eq("phone_number", phone)
          .maybeSingle();

        if (phoneErr) {
          console.error("Supabase phone lookup error (auth login):", phoneErr);
          return res.status(500).json({ error: "Internal error" });
        }

        if (byPhone && byPhone.id) {
          // Link firebase_uid to the existing pre-authorized row
          const { error: updateErr } = await supabase
            .from("users")
            .update({ firebase_uid: firebaseUid })
            .eq("id", byPhone.id);

          if (updateErr) {
            console.error("Supabase update error (link firebase_uid):", updateErr);
            return res.status(500).json({ error: "Failed to link account" });
          }
          userId = byPhone.id;
        }
      }

      // Truly new user (no pre-authorized row) — create a minimal visitor profile
      if (!userId) {
        // Generate a unique temp username to satisfy any NOT NULL constraint until
        // the allow_null_username.sql migration is applied.
        const tempUsername =
          "visitor_" +
          firebaseUid
            .replace(/[^a-z0-9]/gi, "")
            .slice(-10)
            .toLowerCase();
        const payload = {
          firebase_uid: firebaseUid,
          phone_number: phone,
          display_name: name,
          username: tempUsername,
          user_type: "visitor",
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
        maxAge: SESSION_COOKIE_MAX_AGE_MS,
      });

      // Fetch user details to determine onboarding state and user type
      let { data: resolvedUser } = await supabase
        .from("users")
        .select("username, user_type, display_name")
        .eq("id", userId)
        .maybeSingle();

      // Auto-assign a default display name for accounts that don't have one yet.
      if (!resolvedUser?.display_name) {
        try {
          const autoDisplayName = await generateBrianFanDisplayName();
          const { data: updatedUser, error: updateNameErr } = await supabase
            .from("users")
            .update({ display_name: autoDisplayName })
            .eq("id", userId)
            .select("username, user_type, display_name")
            .maybeSingle();

          if (updateNameErr) {
            console.error("Supabase update error (set default display_name):", updateNameErr);
          } else if (updatedUser) {
            resolvedUser = updatedUser;
          }
        } catch (nameErr) {
          console.error(
            "Failed to generate default display_name:",
            nameErr && nameErr.message ? nameErr.message : nameErr
          );
        }
      }

      // needsOnboarding = user hasn't completed registration (no display_name set yet).
      // We use display_name rather than username because new visitors get a temp username
      // on creation but haven't picked a real one until they complete the register page.
      const needsOnboarding = !resolvedUser?.display_name;
      const userType = resolvedUser?.user_type || "visitor";
      const username = resolvedUser?.username || null;

      // Compute the redirect destination server-side so the client can navigate
      // immediately without an extra appState.init() round-trip before redirecting.
      let redirect;
      if (needsOnboarding) {
        redirect = "/register.html";
      } else if (userType === "participant") {
        redirect = "/dashboard.html";
      } else {
        redirect = username ? `/users/${username}` : "/leaderboard.html";
      }

      return res.json({ ok: true, userId, needsOnboarding, userType, username, redirect });
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
  res.clearCookie("user_id", {
    signed: true,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
  });
  return res.json({ ok: true });
});

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
module.exports = router;
