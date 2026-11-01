const { createClient } = require("@supabase/supabase-js");
const { JSDOM } = require("jsdom");
const createDOMPurify = require("dompurify");
const admin = require("firebase-admin");
const crypto = require("crypto");

let supabaseInstance = null;
function getSupabase() {
  if (supabaseInstance) return supabaseInstance;
  const url = process.env.SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE || "";
  if (!url || !key) {
    console.warn(
      "Warning: SUPABASE_URL or SUPABASE_SERVICE_ROLE not set — Supabase client will not be initialized"
    );
    return null;
  }

  supabaseInstance = createClient(url, key);
  return supabaseInstance;
}

function requireSignedUser(req) {
  return req && req.signedCookies && req.signedCookies.user_id ? req.signedCookies.user_id : null;
}

const SUPABASE_JWT_TTL_SECONDS = 60 * 60;

// HS256 Supabase access token for a users.id, signed with the project's JWT
// secret. Postgres sees it as role `authenticated`; current_player_id() reads `sub`.
function mintSupabaseJwt(userId, ttlSeconds = SUPABASE_JWT_TTL_SECONDS) {
  const secret = process.env.SUPABASE_JWT_SECRET || "";
  if (!secret || !userId) return null;
  const now = Math.floor(Date.now() / 1000);
  const encode = (obj) => Buffer.from(JSON.stringify(obj)).toString("base64url");
  const header = encode({ alg: "HS256", typ: "JWT" });
  const payload = encode({
    sub: userId,
    role: "authenticated",
    aud: "authenticated",
    iss: "birthday-app",
    iat: now,
    exp: now + ttlSeconds,
  });
  const signature = crypto
    .createHmac("sha256", secret)
    .update(`${header}.${payload}`)
    .digest("base64url");
  return { token: `${header}.${payload}.${signature}`, expiresAt: now + ttlSeconds };
}

async function isAdminUser(userId) {
  const supabase = getSupabase();
  if (!userId || !supabase) return false;
  const { data, error } = await supabase
    .from("users")
    .select("username")
    .eq("id", userId)
    .maybeSingle();
  if (error || !data) return false;
  const username = String(data.username || "").toLowerCase();
  return username === "brianc" || username === "admin";
}

function createSanitizer() {
  const window = new JSDOM("").window;
  return createDOMPurify(window);
}

// JSON that is safe to print inside a <script> tag (no "</script>" breakouts).
function jsonForScript(value) {
  return JSON.stringify(value === undefined ? null : value)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
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
        // No service account — initialize with just the project ID so that
        // verifyIdToken() can still work (token verification uses Firebase's
        // public keys and only needs the projectId to validate the aud claim).
        const projectId = process.env.FIREBASE_PROJECT_ID || "";
        if (projectId) {
          admin.initializeApp({ projectId });
        } else {
          admin.initializeApp();
        }
      }
    } catch (err) {
      console.warn("Failed to initialize firebase-admin:", err && err.message ? err.message : err);
    }
  }
  return admin;
}

module.exports = {
  getSupabase,
  requireSignedUser,
  isAdminUser,
  mintSupabaseJwt,
  createSanitizer,
  jsonForScript,
  ensureFirebaseAdmin,
};
