/**
 * Test script for notification subscription + inbox flows.
 * Run in the browser console after authenticating a test user.
 */

async function testNotificationSubscription() {
  console.log("🧪 Testing notification subscription flow...");
  try {
    const notificationService = await import("./js/services/notification-service.js");
    const subscription = await notificationService.getCurrentSubscription();
    console.log("Current subscription:", subscription);

    if (!subscription) {
      const result = await notificationService.subscribe();
      console.log("Subscribe result:", result);
    }

    console.table(notificationService.getPushFlowLog());
  } catch (error) {
    console.error("✖️ testNotificationSubscription failed:", error);
  }
}

async function testNotificationInbox() {
  console.log("🧪 Testing account notification inbox APIs...");
  try {
    const listResponse = await fetch("/notifications/list", {
      credentials: "include",
    });
    const listData = await listResponse.json();
    console.log("Notifications:", listData);

    const firstUnread = Array.isArray(listData.notifications)
      ? listData.notifications.find((notification) => notification.read === false)
      : null;

    if (!firstUnread) {
      console.log("No unread notifications available to mark read.");
      return;
    }

    const markReadResponse = await fetch("/notifications/mark-read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ id: firstUnread.id }),
    });
    const markReadData = await markReadResponse.json();
    console.log("Mark-read result:", markReadData);
  } catch (error) {
    console.error("✖️ testNotificationInbox failed:", error);
  }
}

window.testNotificationSubscription = testNotificationSubscription;
window.testNotificationInbox = testNotificationInbox;

console.log(
  "🧪 Notification test helpers loaded: testNotificationSubscription(), testNotificationInbox()"
);
