const express = require("express");
const router = express.Router();
const { getSupabase, requireSignedUser } = require("../js/utils/server-utils");

const supabase = getSupabase();

function looksLikeUuid(id) {
  return (
    typeof id === "string" &&
    /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(id)
  );
}

async function resolveUserUuid(possibleIdOrUsername) {
  // If it's already a UUID, return as-is
  if (looksLikeUuid(possibleIdOrUsername)) return possibleIdOrUsername;

  // Otherwise try common lookup fields: firebase_uid, username
  try {
    // Try firebase_uid
    let q = await supabase
      .from("users")
      .select("id")
      .eq("firebase_uid", possibleIdOrUsername)
      .limit(1);
    if (!q.error && Array.isArray(q.data) && q.data.length) return q.data[0].id;

    // Try username
    q = await supabase.from("users").select("id").eq("username", possibleIdOrUsername).limit(1);
    if (!q.error && Array.isArray(q.data) && q.data.length) return q.data[0].id;

    // As a last resort in development, create a minimal user record so local flows work
    if ((process.env.NODE_ENV || "development") !== "production") {
      const displayName = String(possibleIdOrUsername).slice(0, 64);
      const { data: created, error: createErr } = await supabase
        .from("users")
        .insert([{ username: possibleIdOrUsername, display_name: displayName }])
        .select("id")
        .limit(1);
      if (createErr) {
        console.error("resolveUserUuid create user error", createErr);
      } else if (Array.isArray(created) && created.length) {
        return created[0].id;
      }
    }

    return null;
  } catch (err) {
    console.error("resolveUserUuid error", err);
    return null;
  }
}
/**
 * POST /notifications/subscribe
 * Body: { subscription: { endpoint, keys: { p256dh, auth } } }
 */
router.post("/subscribe", async (req, res) => {
  const userId = requireSignedUser(req);
  if (!userId) return res.status(401).json({ error: "auth required" });
  if (!supabase) return res.status(500).json({ error: "Supabase not initialized" });

  const { subscription } = req.body;
  if (!subscription || !subscription.endpoint)
    return res.status(400).json({ error: "missing subscription" });

  try {
    // Resolve signed cookie to UUID if necessary
    const resolvedUserId = await resolveUserUuid(userId);
    if (!resolvedUserId)
      return res
        .status(400)
        .json({ error: "unable to resolve user id; please sign in via server" });
    const payload = {
      user_id: resolvedUserId,
      endpoint: subscription.endpoint,
      keys: subscription.keys || {},
      created_at: new Date().toISOString(),
    };
    const { data, error } = await supabase
      .from("push_subscriptions")
      .upsert(payload, { onConflict: "endpoint" })
      .select("*");

    if (error) throw error;
    res.json({ success: true, subscription: data && data[0] });
  } catch (err) {
    console.error("subscribe error", err);
    res.status(500).json({ error: err.message || err });
  }
});

/**
 * POST /notifications/unsubscribe
 * Body: { endpoint }
 */
router.post("/unsubscribe", async (req, res) => {
  const userId = requireSignedUser(req);
  if (!userId) return res.status(401).json({ error: "auth required" });
  if (!supabase) return res.status(500).json({ error: "Supabase not initialized" });

  const { endpoint } = req.body;
  // If no endpoint provided, remove all subscriptions for this user.
  try {
    // Resolve the stored signed cookie value to a real UUID if necessary
    const resolvedUserId = await resolveUserUuid(userId);
    if (!resolvedUserId)
      return res
        .status(400)
        .json({ error: "unable to resolve user id; please sign in via server" });

    if (!endpoint) {
      const { error } = await supabase
        .from("push_subscriptions")
        .delete()
        .eq("user_id", resolvedUserId);
      if (error) throw error;
      return res.json({ success: true, removed: "all" });
    }

    const { error } = await supabase
      .from("push_subscriptions")
      .delete()
      .match({ endpoint, user_id: resolvedUserId });
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    console.error("unsubscribe error", err);
    res.status(500).json({ error: err.message || err });
  }
});

/**
 * POST /notifications/send
 * Body: { user_id, title, body, data }
 * NOTE: This endpoint should be protected/limited; here it's a skeleton.
 */
router.post("/send", async (req, res) => {
  // TODO: Add auth/permission checks for who can send notifications
  const { user_id, title, body, data } = req.body;
  if (!user_id) return res.status(400).json({ error: "missing user_id" });
  if (!supabase) return res.status(500).json({ error: "Supabase not initialized" });

  try {
    // Persist the notification record
    const { data: created, error: insertError } = await supabase
      .from("notifications")
      .insert([{ user_id, payload: { title, body, data } }])
      .select("*");
    if (insertError) throw insertError;

    // TODO: send push using web-push or Firebase Admin (send to endpoints in push_subscriptions)
    // Example: lookup subscriptions and deliver via web-push library or Firebase Admin
    res.json({ success: true, created: created && created[0] });
  } catch (err) {
    console.error("send notification error", err);
    res.status(500).json({ error: err.message || err });
  }
});

/**
 * GET /notifications/list
 * Query: ?unreadOnly=1
 */
router.get("/list", async (req, res) => {
  const userId = requireSignedUser(req);
  if (!userId) return res.status(401).json({ error: "auth required" });
  if (!supabase) return res.status(500).json({ error: "Supabase not initialized" });

  try {
    const resolvedUserId = await resolveUserUuid(userId);
    if (!resolvedUserId)
      return res
        .status(400)
        .json({ error: "unable to resolve user id; please sign in via server" });

    let q = supabase
      .from("notifications")
      .select("*")
      .eq("user_id", resolvedUserId)
      .order("created_at", { ascending: false });
    if (req.query.unreadOnly) q = q.eq("read", false);
    const { data, error } = await q;
    if (error) throw error;
    res.json({ notifications: data || [] });
  } catch (err) {
    console.error("list notifications error", err);
    res.status(500).json({ error: err.message || err });
  }
});

/**
 * POST /notifications/mark-read
 * Body: { ids: [notification_id,...] } or { id }
 */
router.post("/mark-read", async (req, res) => {
  const userId = requireSignedUser(req);
  if (!userId) return res.status(401).json({ error: "auth required" });
  if (!supabase) return res.status(500).json({ error: "Supabase not initialized" });

  const ids = Array.isArray(req.body.ids) ? req.body.ids : req.body.id ? [req.body.id] : [];
  if (!ids.length) return res.status(400).json({ error: "missing ids" });

  try {
    const resolvedUserId = await resolveUserUuid(userId);
    if (!resolvedUserId)
      return res
        .status(400)
        .json({ error: "unable to resolve user id; please sign in via server" });
    const { data, error } = await supabase
      .from("notifications")
      .update({ read: true })
      .in("id", ids)
      .eq("user_id", resolvedUserId)
      .select("*");

    if (error) throw error;
    res.json({ success: true, updated: data });
  } catch (err) {
    console.error("mark-read error", err);
    res.status(500).json({ error: err.message || err });
  }
});

module.exports = router;
