/**
 * Notification Service (client-side)
 *
 * Minimal skeleton with TODOs. Meant to be imported as an ES module.
 */

const listeners = new Set();

/**
 * Initialize the notification service (e.g. set VAPID key or perform setup).
 * @param {string|null} vapidPublicKey
 */
export async function init(vapidPublicKey = null) {
  // TODO: store the vapidPublicKey, register service worker, detect current
  // permission state, and resume any existing subscription.
  // Store public key on window so other modules can access it if needed
  if (vapidPublicKey) {
    window.APP_VAPID_PUBLIC_KEY = vapidPublicKey;
  }
  return Promise.resolve({ supported: "serviceWorker" in navigator && "PushManager" in window });
}

/**
 * Register the service worker used for notifications.
 * @param {string} scriptPath
 */
export async function registerServiceWorker(scriptPath = "/sw-notifications.js") {
  if (!("serviceWorker" in navigator)) return null;
  try {
    const reg = await navigator.serviceWorker.register(scriptPath);
    return reg;
  } catch (err) {
    console.warn("Service worker registration failed", err);
    return null;
  }
}

/**
 * Send a subscription object to the server to persist.
 * @param {PushSubscription} subscription
 */
export async function subscribe(subscription) {
  // If a subscription object is provided, send it. Otherwise attempt to
  // create one from the service worker pushManager.
  try {
    let sub = subscription;
    if (!sub) {
      // Basic capability checks
      if (!("serviceWorker" in navigator))
        return {
          ok: false,
          error: "sw-not-supported",
          message: "Service workers not supported in this browser",
        };
      if (!("PushManager" in window))
        return {
          ok: false,
          error: "push-not-supported",
          message: "Push API not supported in this browser",
        };

      // Ensure SW is ready
      let reg;
      try {
        reg = await navigator.serviceWorker.ready;
      } catch (e) {
        return {
          ok: false,
          error: "sw-not-ready",
          message: "Service worker not ready; try reloading the page",
        };
      }

      // Respect existing permission state
      const currentPerm = Notification.permission;
      if (currentPerm === "denied") {
        return {
          ok: false,
          error: "permission-denied",
          message: "Notifications are blocked in your browser settings",
        };
      }

      // If default, request permission from the user (this call must be from a user gesture)
      if (currentPerm === "default") {
        try {
          const permission = await Notification.requestPermission();
          if (permission !== "granted") {
            return { ok: false, error: "permission-denied", message: "Permission was not granted" };
          }
        } catch (reqErr) {
          return { ok: false, error: "permission-error", message: reqErr && reqErr.message };
        }
      }

      // Ensure VAPID public key is available (recommended)
      if (!window.APP_VAPID_PUBLIC_KEY) {
        return {
          ok: false,
          error: "missing-vapid",
          message: "VAPID public key not configured. Contact the site administrator.",
        };
      }
      const applicationServerKey = urlBase64ToUint8Array(window.APP_VAPID_PUBLIC_KEY);

      try {
        sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey });
      } catch (subErr) {
        // Common reasons: permission revoked, invalid key, or browser-specific errors
        return { ok: false, error: "subscribe-failed", message: subErr && subErr.message };
      }
    }

    const resp = await fetch("/notifications/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ subscription: sub }),
    });
    const data = await resp.json().catch(() => null);
    return { ok: resp.ok, data };
  } catch (err) {
    console.warn("subscribe error", err);
    return { ok: false, error: err && err.message };
  }
}

/**
 * Remove a subscription on the server side.
 * @param {string} endpoint
 */
export async function unsubscribe(endpoint) {
  try {
    // Attempt to unsubscribe locally if service worker has it
    try {
      const reg = await navigator.serviceWorker.ready;
      const subs = await reg.pushManager.getSubscription();
      if (subs && (!endpoint || subs.endpoint === endpoint)) {
        await subs.unsubscribe();
      }
    } catch (e) {
      /* ignore */
    }
    const resp = await fetch('/notifications/unsubscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ endpoint }),
    });

    // Try to parse JSON body, but fall back to text for debugging
    let data = null;
    let text = null;
    try {
      data = await resp.json().catch(() => null);
    } catch (_) {
      try {
        text = await resp.text();
      } catch (e) {
        text = null;
      }
    }

    return { ok: resp.ok, status: resp.status, statusText: resp.statusText, data, text };
  } catch (err) {
    console.warn("unsubscribe error", err);
    return { ok: false, error: err && err.message };
  }
}

/**
 * Register a callback for incoming notifications routed to the page.
 * Returns an unsubscribe function.
 * @param {(payload:any)=>void} cb
 */
export function onNotification(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/**
 * Internal: invoke page listeners when a notification is received (e.g. from SW via postMessage).
 * @param {any} payload
 */
export function _handleIncomingNotification(payload) {
  listeners.forEach((cb) => {
    try {
      cb(payload);
    } catch (e) {
      console.warn("notification listener error", e);
    }
  });
}

// Small helper to decode VAPID key
function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

// TODO: provide helpers for subscribing via service worker, storing subscriptions locally,
// handling permission flow, and integrating with BasePage/appState.
