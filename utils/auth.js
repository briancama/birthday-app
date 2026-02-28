// utils/auth.js
const bcrypt = require("bcryptjs");
const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE || "";
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);

/**
 * Verify credentials and return user id on success, otherwise null.
 * @param {string} identifier username or email
 * @param {string} password plain text password
 * @returns {string|null} user id (UUID) or null on failure
 */
async function verifyCredentialsAndGetUserId(identifier, password) {
  if (!identifier || !password) return null;

  try {
    // Look up user by username OR email (adjust columns to match your schema)
    const { data: user, error } = await supabase
      .from("users")
      .select("id,username,email,password_hash")
      .or(`username.eq.${identifier},email.eq.${identifier}`)
      .maybeSingle();

    if (error) {
      console.error("Supabase lookup error (verifyCredentials):", error);
      return null;
    }
    if (!user) return null;

    // If there's no password_hash, deny login (unless you intentionally allow passwordless)
    if (!user.password_hash) return null;

    const matches = await bcrypt.compare(password, user.password_hash);
    return matches ? user.id : null;
  } catch (err) {
    console.error("verifyCredentialsAndGetUserId error:", err);
    return null;
  }
}

module.exports = { verifyCredentialsAndGetUserId };
