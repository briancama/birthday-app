const webpush = require("web-push");
const { getSupabase } = require("./server-utils");

const supabase = getSupabase();

let webPushConfigured = false;
let configurationAttempted = false;

function getVapidConfig() {
  return {
    publicKey: process.env.VAPID_PUBLIC_KEY || "",
    privateKey: process.env.VAPID_PRIVATE_KEY || "",
    contactEmail: process.env.VAPID_EMAIL || "admin@birthday-app.local",
  };
}

function ensureWebPushConfigured() {
  if (configurationAttempted) return webPushConfigured;
  configurationAttempted = true;

  const { publicKey, privateKey, contactEmail } = getVapidConfig();
  if (!publicKey || !privateKey) {
    webPushConfigured = false;
    return false;
  }

  try {
    webpush.setVapidDetails(`mailto:${contactEmail}`, publicKey, privateKey);
    webPushConfigured = true;
  } catch (error) {
    console.warn("Failed to configure web-push:", error.message || error);
    webPushConfigured = false;
  }

  return webPushConfigured;
}

function buildNotificationPayload({
  type,
  fromUserId = null,
  title = "",
  body = "",
  url = "",
  data = {},
}) {
  return {
    version: 1,
    type: type || "generic",
    title,
    body,
    url,
    from_user: fromUserId,
    data: data && typeof data === "object" ? { ...data } : {},
    ...data,
  };
}

function buildPushEnvelope(payload, notificationId) {
  const title = payload.title || "Birthday Challenge Zone";
  const body = payload.body || "You have a new notification.";
  const url = payload.url || payload.link || "/account";

  return JSON.stringify({
    title,
    body,
    data: {
      ...(payload.data && typeof payload.data === "object" ? payload.data : {}),
      type: payload.type || "generic",
      notificationId,
      url,
    },
  });
}

async function removeDeadSubscription(subscriptionId) {
  if (!subscriptionId || !supabase) return;
  const { error } = await supabase.from("push_subscriptions").delete().eq("id", subscriptionId);
  if (error) {
    console.warn("Failed to remove dead push subscription:", error.message || error);
  }
}

async function sendPushToSubscriptions(userId, payload, notificationId) {
  const pushSummary = {
    attempted: false,
    enabled: ensureWebPushConfigured(),
    sent: 0,
    failed: 0,
    cleanedUp: 0,
    skippedReason: "",
  };

  if (!supabase) {
    pushSummary.skippedReason = "supabase-not-initialized";
    return pushSummary;
  }

  if (!pushSummary.enabled) {
    pushSummary.skippedReason = "web-push-not-configured";
    return pushSummary;
  }

  const { data: subscriptions, error } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, keys")
    .eq("user_id", userId);

  if (error) throw error;

  if (!Array.isArray(subscriptions) || subscriptions.length === 0) {
    pushSummary.skippedReason = "no-subscriptions";
    return pushSummary;
  }

  pushSummary.attempted = true;
  const message = buildPushEnvelope(payload, notificationId);

  for (const subscription of subscriptions) {
    try {
      await webpush.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: subscription.keys || {},
        },
        message
      );
      pushSummary.sent += 1;
    } catch (pushError) {
      pushSummary.failed += 1;
      const statusCode = pushError && pushError.statusCode;
      console.warn(
        `Push delivery failed for subscription ${subscription.id}:`,
        pushError && pushError.message ? pushError.message : pushError
      );

      if (statusCode === 404 || statusCode === 410) {
        await removeDeadSubscription(subscription.id);
        pushSummary.cleanedUp += 1;
      }
    }
  }

  return pushSummary;
}

async function createAndDeliverNotification({
  userId,
  type,
  fromUserId = null,
  title = "",
  body = "",
  url = "",
  data = {},
  skipPush = false,
}) {
  if (!supabase) throw new Error("Supabase not initialized");
  if (!userId) throw new Error("userId is required");

  const payload = buildNotificationPayload({
    type,
    fromUserId,
    title,
    body,
    url,
    data,
  });

  const { data: inserted, error } = await supabase
    .from("notifications")
    .insert({
      user_id: userId,
      payload,
      read: false,
    })
    .select()
    .single();

  if (error) throw error;

  let push;
  if (skipPush) {
    push = {
      attempted: false,
      enabled: false,
      sent: 0,
      failed: 0,
      cleanedUp: 0,
      skippedReason: "skip-push-requested",
    };
  } else {
    try {
      push = await sendPushToSubscriptions(userId, payload, inserted.id);
    } catch (pushError) {
      console.warn("Push delivery phase failed after notification persistence:", pushError);
      push = {
        attempted: true,
        enabled: ensureWebPushConfigured(),
        sent: 0,
        failed: 1,
        cleanedUp: 0,
        skippedReason: "push-delivery-error",
      };
    }
  }

  return { notification: inserted, push, payload };
}

module.exports = {
  createAndDeliverNotification,
  ensureWebPushConfigured,
  getVapidConfig,
};
