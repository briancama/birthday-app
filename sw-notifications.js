/**
 * Root service worker for push notifications.
 * Place this at the project root so it can be registered from the client.
 *
 * Minimal handlers with TODOs for payload validation and subscription refresh.
 */

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data
      ? event.data.json
        ? event.data.json()
        : JSON.parse(event.data.text())
      : {};
  } catch (e) {
    try {
      payload = event.data.text();
    } catch (_) {
      payload = {};
    }
  }

  const title = (payload && payload.title) || "Notification";
  const options = {
    body: payload && payload.body,
    data: payload && payload.data,
    icon: "/images/icon.png", // TODO: replace with actual icon path
    badge: "/images/badge.png", // optional
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data && event.notification.data.url;
  event.waitUntil(
    (async () => {
      if (url) {
        const windowClients = await clients.matchAll({ type: "window", includeUncontrolled: true });
        for (const c of windowClients) {
          if (c.url === url && "focus" in c) return c.focus();
        }
        if (clients.openWindow) return clients.openWindow(url);
      }
    })()
  );
});

self.addEventListener("pushsubscriptionchange", (event) => {
  // TODO: handle refresh of push subscription (re-subscribe and POST to /notifications/subscribe)
});
