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
  event.waitUntil(
    (async () => {
      try {
        const configResponse = await fetch("/notifications/config", {
          credentials: "include",
        });
        if (!configResponse.ok) return;

        const config = await configResponse.json();
        if (!config || !config.publicKey) return;

        const subscription = await self.registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(config.publicKey),
        });

        await fetch("/notifications/subscribe", {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ subscription }),
        });
      } catch (error) {
        console.warn("pushsubscriptionchange refresh failed", error);
      }
    })()
  );
});

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let index = 0; index < rawData.length; index += 1) {
    outputArray[index] = rawData.charCodeAt(index);
  }
  return outputArray;
}
