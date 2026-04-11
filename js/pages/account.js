import { BasePage } from "./base-page.js";
import { EventBus } from "../events/event-bus.js";

class AccountPage extends BasePage {
  constructor() {
    super({ requiresAuth: true });
    this.lookbackDays = 7;
    this.notifications = [];
    this.actorMap = new Map();
    this.hoverReadDelayMs = 200;
    this.pendingReadIds = new Set();
    this.hoverReadTimers = new Map();
  }

  async onReady() {
    this.setPageTitle("Account Center");
    this.bindAdminPushTestForm();
    await Promise.all([this.loadNotifications(), this.renderAchievements()]);

    const achCleanup = EventBus.instance.listen("achievement:awarded", (e) => {
      try {
        const userId = e.detail?.userId || e.detail?.user_id;
        if (userId && this.userId && userId === this.userId) {
          this.renderAchievements();
        }
      } catch (err) {
        console.warn("Error handling achievement:awarded in account", err);
      }
    });
    this.eventCleanup.push(achCleanup);
  }

  bindAdminPushTestForm() {
    const form = document.getElementById("adminPushTestForm");
    if (!form) return;

    const submitButton = document.getElementById("adminPushSubmit");
    const resultEl = document.getElementById("adminPushResult");
    const userSelect = document.getElementById("adminPushUserSelect");
    const userIdInput = document.getElementById("adminPushTargetUserId");

    this.populateAdminUserDropdown(userSelect, userIdInput, resultEl).catch((error) => {
      console.warn("Failed to populate admin push dropdown", error);
      if (resultEl) {
        resultEl.textContent =
          "Could not load user dropdown. You can still paste a target user id manually.";
      }
    });

    if (userSelect && userIdInput) {
      userSelect.addEventListener("change", () => {
        if (!userSelect.value) return;
        userIdInput.value = userSelect.value;
      });
    }

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!submitButton || !resultEl) return;

      const userId = String(document.getElementById("adminPushTargetUserId")?.value || "").trim();
      const type = String(document.getElementById("adminPushType")?.value || "manual_test").trim();
      const title = String(document.getElementById("adminPushTitle")?.value || "").trim();
      const body = String(document.getElementById("adminPushBody")?.value || "").trim();
      const url = String(document.getElementById("adminPushUrl")?.value || "/account").trim();

      if (!userId || !title || !body) {
        resultEl.textContent = "Target user id, title, and body are required.";
        return;
      }

      submitButton.disabled = true;
      submitButton.textContent = "Sending...";
      resultEl.textContent = "Sending test notification...";

      try {
        const response = await fetch("/notifications/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            user_id: userId,
            type: type || "manual_test",
            title,
            body,
            data: { url: url || "/account" },
          }),
        });

        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          resultEl.textContent = `Failed (${response.status}): ${payload.error || "Unknown error"}`;
          return;
        }

        const push = payload.push || {};
        resultEl.textContent = [
          "Test notification sent.",
          `Notification ID: ${payload.created?.id || "n/a"}`,
          `Push attempted: ${push.attempted ? "yes" : "no"}`,
          `Push sent: ${push.sent || 0}`,
          `Push failed: ${push.failed || 0}`,
          `Subscriptions cleaned up: ${push.cleanedUp || 0}`,
          `Skip reason: ${push.skippedReason || "none"}`,
        ].join("\n");

        await this.loadNotifications();
      } catch (error) {
        resultEl.textContent = `Error: ${error && error.message ? error.message : String(error)}`;
      } finally {
        submitButton.disabled = false;
        submitButton.textContent = "Send Test Notification";
      }
    });
  }

  async populateAdminUserDropdown(userSelect, userIdInput, resultEl) {
    if (!userSelect) return;

    const response = await fetch("/notifications/users", {
      credentials: "include",
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || `Failed to load users (${response.status})`);
    }

    const users = Array.isArray(payload.users) ? payload.users : [];
    if (!users.length) {
      userSelect.innerHTML = '<option value="">No users found</option>';
      return;
    }

    const options = [
      '<option value="">Select a user...</option>',
      ...users.map((user) => {
        const label = `${user.display_name || user.username || "User"} (@${user.username || "unknown"})`;
        const safeLabel = this.escapeHtml(label);
        const safeId = this.escapeAttr(user.id || "");
        return `<option value="${safeId}">${safeLabel}</option>`;
      }),
    ];

    userSelect.innerHTML = options.join("");

    if (userIdInput && userIdInput.value) {
      const found = users.some((user) => user.id === userIdInput.value);
      if (found) userSelect.value = userIdInput.value;
    }

    if (resultEl) {
      resultEl.textContent =
        "Admin dropdown loaded. Pick a user to auto-fill the target user id field.";
    }
  }

  async loadNotifications() {
    const metaEl = document.getElementById("accountNotificationsMeta");
    try {
      const resp = await fetch(`/notifications/list?days=${this.lookbackDays}`, {
        credentials: "include",
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        throw new Error(data.error || `Failed to load notifications (${resp.status})`);
      }
      this.notifications = Array.isArray(data.notifications) ? data.notifications : [];
      await this.hydrateActorMap(this.notifications);
      this.renderNotifications();
      this.updateUnreadBadge();
    } catch (err) {
      console.warn("Account: failed to load notifications", err);
      this.notifications = [];
      if (metaEl) {
        metaEl.textContent =
          err && err.message
            ? `Notifications unavailable: ${err.message}`
            : "Notifications unavailable right now.";
      }
      this.renderNotifications();
    }
  }

  async hydrateActorMap(notifications) {
    const actorIds = [
      ...new Set(
        notifications
          .map((notification) => notification?.payload?.from_user)
          .filter((value) => typeof value === "string" && value.length > 0)
      ),
    ];

    if (!actorIds.length || !this.supabase) {
      this.actorMap = new Map();
      return;
    }

    try {
      const { data, error } = await this.supabase
        .from("users")
        .select("id, username, display_name")
        .in("id", actorIds);
      if (error) throw error;

      const nextMap = new Map();
      (data || []).forEach((row) => {
        nextMap.set(row.id, row);
      });
      this.actorMap = nextMap;
    } catch (err) {
      console.warn("Account: failed to hydrate actor map", err);
      this.actorMap = new Map();
    }
  }

  renderNotifications() {
    const listEl = document.getElementById("accountNotificationsList");
    const metaEl = document.getElementById("accountNotificationsMeta");
    if (!listEl || !metaEl) return;

    const unreadCount = this.notifications.filter(
      (notification) => notification.read === false
    ).length;
    const visibleItems = this.notifications;

    metaEl.textContent = `Last ${this.lookbackDays} days: ${unreadCount} unread`;

    if (!visibleItems.length) {
      listEl.innerHTML =
        '<li><p class="account-notification-empty">No notifications in this view right now.</p></li>';
      return;
    }

    // Preserve open groups so read-state refresh does not collapse expanded sections.
    const openGroupKeys = new Set();
    listEl.querySelectorAll("details[data-notification-group][open]").forEach((detailsEl) => {
      const groupKey = detailsEl.getAttribute("data-group-key");
      if (groupKey) openGroupKeys.add(groupKey);
    });

    const grouped = this.groupNotificationsByType(visibleItems);
    listEl.innerHTML = grouped.map((group) => this.renderNotificationGroup(group)).join("");

    listEl.querySelectorAll("details[data-notification-group]").forEach((detailsEl) => {
      const groupKey = detailsEl.getAttribute("data-group-key");
      if (groupKey && openGroupKeys.has(groupKey)) {
        detailsEl.open = true;
      }
    });

    listEl.querySelectorAll("[data-notification-mark-read]").forEach((cardEl) => {
      const notificationId = cardEl.getAttribute("data-notification-id");
      if (!notificationId) return;

      cardEl.addEventListener("mouseenter", () => {
        this.scheduleHoverRead(notificationId);
      });
      cardEl.addEventListener("mouseleave", () => {
        this.cancelHoverRead(notificationId);
      });
      cardEl.addEventListener("focus", () => {
        this.markNotificationReadIfNeeded(notificationId);
      });
      cardEl.addEventListener("blur", () => {
        this.cancelHoverRead(notificationId);
      });
      cardEl.addEventListener("click", () => {
        this.markNotificationReadIfNeeded(notificationId);
      });
      cardEl.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        this.markNotificationReadIfNeeded(notificationId);
      });
    });

    listEl.querySelectorAll("[data-notification-action]").forEach((linkEl) => {
      const notificationId = linkEl.getAttribute("data-notification-id");
      if (!notificationId) return;

      linkEl.addEventListener("click", () => {
        this.markNotificationReadIfNeeded(notificationId);
      });
    });
  }

  scheduleHoverRead(notificationId) {
    if (!notificationId || this.hoverReadTimers.has(notificationId)) return;
    const timerId = window.setTimeout(() => {
      this.hoverReadTimers.delete(notificationId);
      this.markNotificationReadIfNeeded(notificationId);
    }, this.hoverReadDelayMs);
    this.hoverReadTimers.set(notificationId, timerId);
  }

  cancelHoverRead(notificationId) {
    const timerId = this.hoverReadTimers.get(notificationId);
    if (!timerId) return;
    window.clearTimeout(timerId);
    this.hoverReadTimers.delete(notificationId);
  }

  markNotificationReadIfNeeded(notificationId) {
    if (!notificationId) return;
    const notification = this.notifications.find((n) => n.id === notificationId);
    if (!notification || notification.read === true) return;
    if (this.pendingReadIds.has(notificationId)) return;

    this.pendingReadIds.add(notificationId);
    this.markNotificationRead(notificationId).finally(() => {
      this.pendingReadIds.delete(notificationId);
    });
  }

  groupNotificationsByType(notifications) {
    const order = ["wall_post_received", "top8_updates", "challenge_triggered"];
    const map = new Map();

    notifications.forEach((notification) => {
      const key = this.getNotificationGroupKey(notification?.payload?.type);
      if (!map.has(key)) {
        map.set(key, {
          key,
          label: this.getTypeLabel(key),
          notifications: [],
        });
      }
      map.get(key).notifications.push(notification);
    });

    const groups = Array.from(map.values()).map((group) => {
      group.notifications.sort((a, b) => {
        const aTs = new Date(a?.created_at || 0).getTime();
        const bTs = new Date(b?.created_at || 0).getTime();
        return bTs - aTs;
      });
      return group;
    });

    groups.sort((a, b) => {
      const aIdx = order.indexOf(a.key);
      const bIdx = order.indexOf(b.key);
      const aRank = aIdx === -1 ? 999 : aIdx;
      const bRank = bIdx === -1 ? 999 : bIdx;
      if (aRank !== bRank) return aRank - bRank;
      return a.label.localeCompare(b.label);
    });

    return groups;
  }

  renderNotificationGroup(group) {
    const unread = group.notifications.filter((notification) => notification.read === false).length;
    const safeLabel = this.escapeHtml(group.label);
    const safeGroupKey = this.escapeAttr(group.key);
    const unreadGroupClass = unread > 0 ? " account-notification-group--has-unread" : "";
    const unreadMetaClass = unread > 0 ? " account-group-meta--has-unread" : "";

    return `
      <li>
        <details class="account-notification-group${unreadGroupClass}" data-notification-group data-group-key="${safeGroupKey}">
          <summary class="account-notification-summary">
            <span>${safeLabel}</span>
            <span class="account-group-meta${unreadMetaClass}">${unread} unread</span>
          </summary>
          <ul class="account-group-body">
            ${group.notifications.map((notification) => this.renderNotificationItem(notification)).join("")}
          </ul>
        </details>
      </li>
    `;
  }

  getNotificationGroupKey(type) {
    switch (type) {
      case "wall_post_received":
      case "top8_added":
      case "top8_removed":
        return type.startsWith("top8_") ? "top8_updates" : type;
      case "challenge_triggered":
        return "challenge_triggered";
      default:
        return "other";
    }
  }

  getUnreadIdsForGroup(groupKey) {
    return this.notifications
      .filter(
        (notification) =>
          notification.read === false &&
          this.getNotificationGroupKey(notification?.payload?.type) === groupKey
      )
      .map((notification) => notification.id)
      .filter(Boolean);
  }

  renderNotificationItem(notification) {
    const payload = notification?.payload || {};
    const summary = this.getNotificationSummary(payload);
    const typeLabel = this.getTypeLabel(payload.type);
    const createdAt = this.formatTime(notification.created_at);
    const action = this.getNotificationAction(payload);
    const targetHref = action.href;
    const actionLabel = action.label;
    const readState = notification.read === true;

    const safeTypeLabel = this.escapeHtml(typeLabel);
    const safeCreatedAt = this.escapeHtml(createdAt);
    const safeSummary = this.escapeHtml(summary);
    const safeTargetHref = this.escapeAttr(targetHref);
    const safeActionLabel = this.escapeHtml(actionLabel);
    const safeId = this.escapeAttr(notification.id || "");

    return `
      <li class="account-notification-item" data-read="${readState ? "true" : "false"}">
        <div
          class="account-notification-card"
          role="button"
          tabindex="0"
          data-notification-mark-read
          data-notification-id="${safeId}"
          aria-label="Mark as read: ${safeSummary}"
        >
        <div class="account-notification-row">
          <span class="account-notification-type">${safeTypeLabel}</span>
          <span class="account-notification-time">${safeCreatedAt}</span>
        </div>
        <p class="account-notification-text">${safeSummary}</p>
        </div>
        <a
          class="account-notification-target"
          href="${safeTargetHref}"
          data-notification-action
          data-notification-id="${safeId}"
          aria-label="${safeActionLabel}"
        >${safeActionLabel}</a>
      </li>
    `;
  }

  getTypeLabel(type) {
    switch (type) {
      case "wall_post_received":
        return "Wall Post";
      case "top8_updates":
        return "Top 8 Updates";
      case "top8_added":
        return "Top 8 Added";
      case "top8_removed":
        return "Top 8 Update";
      case "challenge_triggered":
        return "Challenge";
      case "other":
        return "Other Updates";
      default:
        return "Update";
    }
  }

  getActorLabel(payload) {
    if (payload.from_display_name) return payload.from_display_name;
    if (payload.from_username) return payload.from_username;

    const actor = this.actorMap.get(payload.from_user);
    if (actor?.display_name) return actor.display_name;
    if (actor?.username) return actor.username;
    return "Someone";
  }

  getNotificationSummary(payload) {
    const actor = this.getActorLabel(payload);

    switch (payload.type) {
      case "wall_post_received":
        return `${actor} posted on your wall.`;
      case "top8_added":
        return `${actor} added you to their Top 8.`;
      case "top8_removed":
        return `${actor} removed you from their Top 8.`;
      case "challenge_triggered":
        return `${actor} triggered one of your challenges.`;
      default:
        return payload.body || payload.title || "You have a new account update.";
    }
  }

  getNotificationAction(payload) {
    if (payload.type === "wall_post_received") {
      const isLegacyAccountUrl = !payload.url || payload.url === "/account";
      if (isLegacyAccountUrl && this.currentUser?.username) {
        return {
          href: `/users/${this.currentUser.username}#wall-entries`,
          label: "View",
        };
      }
    }

    if (payload.url) {
      return {
        href: payload.url,
        label: "View",
      };
    }

    if (payload.type === "wall_post_received" && this.currentUser?.username) {
      return {
        href: `/users/${this.currentUser.username}#wall-entries`,
        label: "View",
      };
    }

    if (
      (payload.type === "top8_added" || payload.type === "top8_removed") &&
      payload.from_username
    ) {
      return {
        href: `/users/${payload.from_username}#topn-display`,
        label: "View",
      };
    }

    if (payload.type === "challenge_triggered") {
      return {
        href: "/challenges",
        label: "View",
      };
    }

    return {
      href: "/account",
      label: "View",
    };
  }

  formatTime(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleString([], {
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  async markNotificationRead(notificationId) {
    if (!notificationId) return;
    return this.markNotificationsRead([notificationId]);
  }

  async markNotificationsRead(notificationIds) {
    const ids = Array.from(new Set(notificationIds.filter(Boolean)));
    if (!ids.length) return;

    try {
      const resp = await fetch("/notifications/mark-read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ ids }),
      });

      if (!resp.ok) return;

      this.notifications = this.notifications.map((notification) => {
        if (!ids.includes(notification.id)) return notification;
        return { ...notification, read: true };
      });
      this.renderNotifications();
      this.updateUnreadBadge();
    } catch (err) {
      console.warn("Account: failed to mark notification read", err);
    }
  }

  updateUnreadBadge() {
    const unreadCount = this.notifications.filter(
      (notification) => notification.read === false
    ).length;
    let badgeEl = document.querySelector(".nav-unread-badge");
    const profileLink = document.querySelector(".profile-nav-link");

    if (unreadCount <= 0) {
      if (badgeEl) {
        badgeEl.remove();
      }
      return;
    }

    if (!badgeEl && profileLink) {
      badgeEl = document.createElement("span");
      badgeEl.className = "nav-unread-badge";
      profileLink.appendChild(badgeEl);
    }

    if (!badgeEl) return;

    badgeEl.textContent = unreadCount > 99 ? "99+" : String(unreadCount);
    badgeEl.setAttribute("aria-label", `${unreadCount} unread notifications`);
  }

  navigateToNotification(cardEl) {
    const href = cardEl?.getAttribute("data-notification-href");
    if (!href) return;
    window.location.href = href;
  }

  async renderAchievements() {
    try {
      if (!this.userId || !this.supabase) return;

      const counterEl = document.getElementById("achievementsCounter");
      const listEl = document.getElementById("achievementsList");
      const section = document.getElementById("achievementsSection");
      if (!counterEl || !listEl || !section) return;

      const [{ data: allAchievements }, { data: userAwards }] = await Promise.all([
        this.supabase.from("achievements").select("id,key,name,description,points,metadata"),
        this.supabase.from("user_achievements").select("achievement_id").eq("user_id", this.userId),
      ]);

      const awardedIds = Array.isArray(userAwards)
        ? userAwards.map((row) => row.achievement_id)
        : [];

      const visibleAchievements = Array.isArray(allAchievements)
        ? allAchievements.filter(
            (achievement) => !achievement.metadata?.hidden || awardedIds.includes(achievement.id)
          )
        : [];

      const total = visibleAchievements.length;
      const awarded = visibleAchievements.filter((achievement) =>
        awardedIds.includes(achievement.id)
      );

      counterEl.innerHTML = `${awarded.length} / ${total} <span>complete</span>`;
      section.classList.toggle("visible", awarded.length > 0);

      listEl.innerHTML = awarded
        .map((achievement) => {
          const name = achievement.name || achievement.key || "Achievement";
          const description = achievement.description || "";
          const points = achievement.points || 0;
          const initial = name.charAt(0) || "*";
          const safeName = this.escapeHtml(name);
          const safeDescription = this.escapeHtml(description);
          const safeDescriptionAttr = this.escapeAttr(description);
          const safePoints = this.escapeHtml(String(points));
          const safeInitial = this.escapeHtml(initial);

          return `
            <div class="challenge-badge" tabindex="0" title="${safeDescriptionAttr}" data-title="${safeDescriptionAttr}">
              <span class="badge-icon" aria-hidden="true">${safeInitial}</span>
              <span class="badge-name">${safeName}</span>
              <span class="badge-description hide-mobile">${safeDescription}</span>
              <span class="badge-points">(${safePoints} pts)</span>
            </div>
          `;
        })
        .join("");
    } catch (err) {
      console.warn("Account: renderAchievements failed", err);
    }
  }

  escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  escapeAttr(value) {
    return this.escapeHtml(value).replace(/`/g, "&#96;");
  }
}

export { AccountPage };
