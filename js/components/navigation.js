import { appState } from "../app.js";
import { EventBus } from "../events/event-bus.js";
import { audioManager } from "../utils/audio.js";
import * as notificationService from "../services/notification-service.js";

class NavigationController {
  constructor() {
    this.currentUser = null;
    this.currentPage = this.getCurrentPage();
    this.eventCleanup = [];
  }

  init() {
    // Initialize navigation behavior on existing HTML
    this.setupEventListeners();
    this.addDOMEventListeners();

    // If server provided a hydrated nav state, use it immediately to avoid UI flicker.
    try {
      const navState = window && window.__NAV_STATE__ ? window.__NAV_STATE__ : null;
      if (navState && navState.user) {
        this.setCurrentUser(navState.user);
      } else if (appState.getCurrentUser()) {
        // Fall back to appState if already loaded
        this.setCurrentUser(appState.getCurrentUser());
      } else {
        // Set initial page title
        this.updatePageTitle();
      }
    } catch (e) {
      // In non-browser contexts or errors, fall back to appState behavior
      if (appState.getCurrentUser()) {
        this.setCurrentUser(appState.getCurrentUser());
      } else {
        this.updatePageTitle();
      }
    }
    // Ensure Arnold trigger wiring is initialized (will no-op if modal not present)
    this.setupArnoldHandlers();
  }

  setupEventListeners() {
    // Modern event-based subscription to appState
    const userLoadedCleanup = appState.on("user:loaded", (e) => {
      this.setCurrentUser(e.detail);
    });

    const userLogoutCleanup = appState.on("user:logout", (e) => {
      this.currentUser = null;
      this.updatePageTitle();
      this.updateAdminVisibility();
    });

    const userErrorCleanup = appState.on("user:error", (e) => {
      console.error("Navigation: User error", e.detail);
      this.showUserError(e.detail);
    });

    // Listen to global navigation events
    const pageChangeCleanup = EventBus.instance.listen(
      EventBus.EVENTS.NAVIGATION.PAGE_CHANGE,
      (e) => {
        this.handlePageChange(e.detail);
      }
    );

    // Store cleanup functions
    this.eventCleanup.push(
      userLoadedCleanup,
      userLogoutCleanup,
      userErrorCleanup,
      pageChangeCleanup
    );
  }

  addDOMEventListeners() {
    // Plain mobile menu: menu closed by default, users must open via toggle
    const menuToggle = document.querySelector(".mobile-menu-toggle");
    const navMenu = document.querySelector(".nav-menu");

    if (menuToggle && navMenu) {
      menuToggle.addEventListener("click", (e) => {
        e.preventDefault();
        const wasOpen = navMenu.classList.contains("mobile-open");
        navMenu.classList.toggle("mobile-open");
        menuToggle.classList.toggle("active");
        // Emit menu toggle event
        EventBus.instance.emit(EventBus.EVENTS.NAVIGATION.MENU_TOGGLE, {
          isOpen: !wasOpen,
          source: "mobile-toggle",
        });
      });
    }

    // Nav links do not close menu
    // Logout functionality
    // Logout functionality
    const logoutBtn = document.querySelector(".logout-btn");
    if (logoutBtn) {
      logoutBtn.addEventListener("click", (e) => {
        e.preventDefault();
        appState.logout();
      });
    }
  }

  cleanup() {
    // Clean up event listeners
    this.eventCleanup.forEach((cleanup) => cleanup());
    this.eventCleanup = [];
  }

  handlePageChange(detail) {
    const { page, source } = detail;
    if (page !== this.currentPage) {
      this.currentPage = page;
      this.updatePageTitle();
      this.updateActiveTab();
    }
  }

  showUserError(errorDetail) {
    // Could show a temporary error message in the navigation
    console.warn("Navigation: User authentication error", errorDetail);
    // For now, just log it - could add error UI later
  }

  getCurrentPage() {
    const path = window.location.pathname;
    if (path.includes("dashboard")) return "dashboard";
    if (path.includes("leaderboard")) return "leaderboard";
    if (path.includes("event-info")) return "event-info";
    if (path.includes("cocktail-judging")) return "cocktail-judging";
    if (path.includes("cocktail-rubric")) return "rubric";
    if (path.includes("challenges-submit")) return "challenges-submit";
    if (path.includes("admin-approvals")) return "admin-approvals";

    return "dashboard"; // default
  }

  getPageTitle() {
    const pageTitles = {
      dashboard: "Dashboard",
      leaderboard: "Leaderboard",
      "event-info": "Event Info",
      "cocktail-judging": "40 Proof",
      rubric: "Rubric",
      "challenges-submit": "Workshop",
      "admin-approvals": "Admin",
      challenges: "My Challenges",
    };
    return pageTitles[this.currentPage] || "Dashboard";
  }

  setCurrentUser(user) {
    this.currentUser = user;
    this.updatePageTitle();
    this.updateAdminVisibility();
    this.updateMenuOptions();
    this.ensureNotificationToggle();
    this.updateProfileButton(user);
  }

  updateProfileButton(user) {
    // No-op: profile link is server-rendered now. Kept for backward compatibility.
    return;
  }

  ensureNotificationToggle() {
    try {
      const container = document.querySelector(".nav-tabs");
      if (!container) return;
      // Avoid duplicate toggle
      if (container.querySelector(".notif-toggle-btn")) return;

      const btn = document.createElement("button");
      btn.className = "notif-toggle-btn";
      // Initial label will be updated based on actual PushSubscription state
      btn.textContent = "Checking notifications...";

      async function updateButtonState() {
        try {
          if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
            btn.textContent = "Notifications: Unsupported";
            btn.disabled = true;
            return;
          }
          const reg = await navigator.serviceWorker.ready;
          const subs = await reg.pushManager.getSubscription();
          if (subs) {
            btn.textContent = "Notifications: ON";
            btn.dataset.subscribed = "1";
          } else {
            btn.textContent = "Enable Notifications";
            btn.dataset.subscribed = "0";
          }
        } catch (e) {
          console.warn("updateButtonState error", e);
          btn.textContent = "Enable Notifications";
          btn.dataset.subscribed = "0";
        } finally {
          btn.disabled = false;
        }
      }

      btn.addEventListener("click", async (e) => {
        e.preventDefault();
        btn.disabled = true;
        try {
          // Determine current subscription state from PushManager
          const reg = await navigator.serviceWorker.ready;
          const subs = await reg.pushManager.getSubscription();
          if (subs) {
            // Currently subscribed -> unsubscribe both client and server
            try {
              await subs.unsubscribe();
            } catch (ignore) {
              // continue to call server even if local unsubscribe fails
            }
            const res = await notificationService.unsubscribe(subs.endpoint);
            if (res && res.ok) {
              btn.textContent = "Enable Notifications";
              btn.dataset.subscribed = "0";
              EventBus.instance.emit("ui:toast", {
                type: "success",
                message: "Notifications disabled",
              });
            } else {
              const errMsg =
                (res && (res.error || (res.data && (res.data.error || res.data.message)))) ||
                "Failed to disable notifications. Check console for details.";
              EventBus.instance.emit("ui:toast", { type: "error", message: errMsg });
              console.warn("Unsubscribe failed response:", res);
            }
          } else {
            // Not subscribed -> try to subscribe (may prompt permission)
            const res = await notificationService.subscribe();
            if (res && res.ok) {
              btn.textContent = "Notifications: ON";
              btn.dataset.subscribed = "1";
              EventBus.instance.emit("ui:toast", {
                type: "success",
                message: "Notifications enabled",
              });
            } else if (res && res.error === "permission-denied") {
              EventBus.instance.emit("ui:toast", {
                type: "error",
                message: "Permission denied. Enable notifications in browser settings.",
              });
            } else {
              const errMsg =
                (res && (res.error || (res.data && (res.data.error || res.data.message)))) ||
                "Failed to enable notifications";
              EventBus.instance.emit("ui:toast", { type: "error", message: errMsg });
              console.warn("Subscribe failed response:", res);
            }
          }
        } catch (err) {
          console.warn("Notification toggle error", err);
          EventBus.instance.emit("ui:toast", {
            type: "error",
            message: err && err.message ? err.message : "Notification action failed",
          });
        } finally {
          btn.disabled = false;
          // refresh state from push manager
          updateButtonState().catch(() => {});
        }
      });

      // Run initial state check
      updateButtonState().catch(() => {});

      container.appendChild(btn);
    } catch (e) {
      console.warn("Failed to add notification toggle", e);
    }
  }
  updateMenuOptions() {
    // Show/hide nav menu options based on auth status (except admin link)
    const navTabs = document.querySelectorAll(".nav-tab[data-page]");
    const logoutBtn = document.querySelector(".logout-btn");
    // If not logged in, only show dashboard/home and hide others; always hide participant-only
    if (!this.currentUser) {
      navTabs.forEach((tab) => {
        const page = tab.dataset.page;
        if (page === "dashboard" || page === "home" || page === "index") {
          tab.style.display = "";
        } else if (tab.hasAttribute("data-participant-only")) {
          tab.style.display = "none";
        } else if (!tab.hasAttribute("data-admin-only")) {
          tab.style.display = "none";
        }
      });
      if (logoutBtn) logoutBtn.style.display = "none";
    } else {
      navTabs.forEach((tab) => {
        // Admin-only handled elsewhere
        if (tab.hasAttribute("data-admin-only")) return;

        // Participant-only tabs should only show for participants
        if (
          tab.hasAttribute("data-participant-only") &&
          this.currentUser.user_type !== "participant"
        ) {
          tab.style.display = "none";
          return;
        }

        tab.style.display = "";
      });
      if (logoutBtn) logoutBtn.style.display = "";
    }
  }

  updatePageTitle() {
    const titleElement = document.querySelector('[data-nav="page-title"]');
    if (titleElement) {
      titleElement.textContent = this.getPageTitle();
    }
  }

  updateAdminVisibility() {
    const adminLink = document.querySelector("[data-admin-only]");
    if (adminLink) {
      if (!this.currentUser) {
        adminLink.style.display = "none";
      } else {
        adminLink.style.display = this.currentUser.isAdmin ? "" : "none";
      }
    }
  }

  // For unauthenticated pages, allow manual nav init with no user
  setNoUser() {
    this.currentUser = null;
    this.updatePageTitle();
    this.updateAdminVisibility();
    this.updateMenuOptions();
  }

  updateActiveTab() {
    // Update active state on navigation tabs
    const tabs = document.querySelectorAll(".nav-tab[data-page]");
    tabs.forEach((tab) => {
      if (tab.dataset.page === this.currentPage) {
        tab.classList.add("active");
      } else {
        tab.classList.remove("active");
      }
    });
  }

  // Attach handlers for the Arnold easter-egg modal if present on the page.
  setupArnoldHandlers() {
    // Attach when DOM is ready
    const attach = () => {
      try {
        const trigger = document.getElementById("secretArnold");
        const modal = document.getElementById("arnoldModal");
        const audio = document.getElementById("arnoldAudio");
        const closeBtn = document.getElementById("close-arnold");
        const rick = document.getElementById("rickRoll");
        const gif = document.getElementById("arnoldGif");

        if (!trigger) return; // nothing to wire

        // Prevent attaching multiple times
        if (trigger.dataset.arnoldAttached) return;
        trigger.dataset.arnoldAttached = "1";

        trigger.addEventListener("click", () => {
          if (modal) {
            modal.style.display = "flex";
          }
        });

        if (rick) {
          rick.addEventListener("click", (e) => {
            e.preventDefault();
            if (gif) gif.style.display = "block";
            // Hide the rickRoll button after it's clicked so it can't be reused.
            try {
              rick.style.display = "none";
              rick.disabled = true;
            } catch (hideErr) {
              console.warn("Failed to hide rickRoll button:", hideErr);
            }
            if (audio && audio.play) {
              audio.currentTime = 0;
              audio.play().catch((err) => console.warn("Audio play prevented:", err));
            }
            try {
              window.dispatchEvent(
                new CustomEvent("achievement:trigger", { detail: { key: "rickroll" } })
              );
            } catch (err) {
              console.warn("Failed to dispatch achievement trigger", err);
            }
          });
        }

        const hideModal = () => {
          if (audio && audio.pause) {
            audio.pause();
            audio.currentTime = 0;
          }
          if (gif) gif.style.display = "none";
          if (modal) modal.style.display = "none";
        };

        if (closeBtn) closeBtn.addEventListener("click", hideModal);
        if (modal)
          modal.addEventListener("click", (e) => {
            if (e.target === modal) hideModal();
          });
      } catch (e) {
        console.warn("setupArnoldHandlers failed:", e);
      }
    };

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", attach);
    } else {
      attach();
    }
  }
}

// Export singleton instance and initializer
const navigationController = new NavigationController();

export function initNavigation() {
  navigationController.init();
  return navigationController;
}

export { NavigationController, navigationController };
