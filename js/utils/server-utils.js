const { createClient } = require("@supabase/supabase-js");
const { JSDOM } = require("jsdom");
const createDOMPurify = require("dompurify");
const admin = require("firebase-admin");

let supabaseInstance = null;
function getSupabase() {
  if (supabaseInstance) return supabaseInstance;
  const url = process.env.SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE || "";
  if (!url || !key)
    console.warn(
      "Warning: SUPABASE_URL or SUPABASE_SERVICE_ROLE not set — Supabase client may not function"
    );
  supabaseInstance = createClient(url, key);
  return supabaseInstance;
}

function requireSignedUser(req) {
  return req && req.signedCookies && req.signedCookies.user_id ? req.signedCookies.user_id : null;
}

function createSanitizer() {
  const window = new JSDOM("").window;
  return createDOMPurify(window);
}

function ensureFirebaseAdmin() {
  if (!admin.apps.length) {
    try {
      const raw = process.env.FIREBASE_SERVICE_ACCOUNT || "";
      if (raw) {
        const creds = raw.trim().startsWith("{") ? JSON.parse(raw) : undefined;
        if (creds) {
          admin.initializeApp({ credential: admin.credential.cert(creds) });
        } else {
          admin.initializeApp();
        }
      } else {
        admin.initializeApp();
      }
    } catch (err) {
      console.warn("Failed to initialize firebase-admin:", err && err.message ? err.message : err);
    }
  }
  return admin;
}

module.exports = { getSupabase, requireSignedUser, createSanitizer, ensureFirebaseAdmin };
