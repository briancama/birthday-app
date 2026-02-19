import { SUPABASE_CONFIG, FIREBASE_CONFIG } from "./config.js";
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.94.1/+esm";
import { firebaseAuth } from "./services/firebase-auth.js";
import { EventBus } from "./events/event-bus.js";

// Environment detection
const isProduction =
  window.location.hostname !== "localhost" &&
  window.location.hostname !== "127.0.0.1" &&
  !window.location.hostname.includes("github.io");

// Application Configuration (moved from config.js since that's gitignored)
const APP_CONFIG = {
  // Auto-refresh settings - more conservative in development
  enableAutoRefresh: true, // Enable auto-refresh for both dev and production
  refreshInterval: isProduction ? 30000 : 10000, // 30s production, 10s development for faster dev feedback

  // Performance settings
  useSmartRefresh: true, // Only update data, not images
  enableImageCaching: true, // Avoid re-requesting images

  // Development settings
  isDevelopment: !isProduction,
  isProduction: isProduction,

  // UI settings
  enableDebugLogging: !isProduction,
  showDeveloperTools: !isProduction,

  // Feature flags
  enableEventSystem: true,
  enableAdvancedErrorHandling: true,
};

// Make APP_CONFIG available globally
window.APP_CONFIG = APP_CONFIG;

class AppState extends EventTarget {
  constructor() {
    super();
    this.supabase = createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.key);
    this.currentUser = null;
    this.userId = null;

    // Keep legacy subscribers for backward compatibility
    this.subscribers = new Set();
  }

  // Initialize the application
  async init() {
    // Ensure Firebase is initialized before any auth logic
    if (!firebaseAuth.auth) {
      try {
        await firebaseAuth.init();
      } catch (err) {
        console.error("Firebase failed to initialize:", err);
        this.forceLogout();
        return false;
      }
    }

    // Wait for Firebase to restore session and user to be available
    await new Promise((resolve) => {
      const unsub = firebaseAuth.onAuthStateChanged((user) => {
        unsub();
        resolve();
      });
    });

    // Determine firebaseUid: prefer persisted value, fall back to Firebase SDK
    let firebaseUid =
      localStorage.getItem("firebase_uid") || firebaseAuth.getCurrentUser()?.uid || null;

    // Persist firebaseUid if it exists but wasn't stored
    if (!localStorage.getItem("firebase_uid") && firebaseUid) {
      try {
        localStorage.setItem("firebase_uid", firebaseUid);
        console.log("[APP] Persisted firebase_uid from Firebase SDK:", firebaseUid);
      } catch (e) {
        console.warn("[APP] Failed to persist firebase_uid to localStorage", e);
      }
    }

    if (!firebaseUid) {
      const redirectInfo = {
        reason: "missing_firebase_uid",
        firebaseUid: firebaseUid,
        pathname: window.location.pathname,
        time: new Date().toISOString(),
        stack: new Error().stack,
      };
      try {
        sessionStorage.setItem("auth:redirect", JSON.stringify(redirectInfo));
      } catch (e) {
        console.warn("Failed to write auth redirect info", e);
      }
      console.warn("[APP] No firebase_uid available after SDK check:", redirectInfo);
      console.trace();
      this.redirectToLogin();
      return false;
    }

    // Load full user profile using firebase_uid
    await this.loadUserProfile(firebaseUid);

    // Initialize navigation if present
    this.initializeNavigation();

    return true;
  }

  async loadUserProfile(firebaseUid) {
    try {
      let result;

      if (firebaseUid) {
        // Fetch by firebase_uid when available
        result = await this.supabase
          .from("users")
          .select("*")
          .eq("firebase_uid", firebaseUid)
          .single();
      } else {
        // Fallback: try to find a user by phone_number stored in localStorage
        const phone = localStorage.getItem("phone_number");
        if (phone) {
          result = await this.supabase
            .from("users")
            .select("*")
            .eq("phone_number", phone)
            .maybeSingle();
        } else {
          throw new Error("No firebaseUid or phone_number available to load profile");
        }
      }

      const { data, error } = result || {};

      if (error || !data) {
        throw new Error(error?.message || "User not found");
      }

      this.currentUser = data;
      this.userId = data.id;

      // Emit user loaded event
      const userLoadedEvent = new CustomEvent("user:loaded", {
        detail: this.currentUser,
      });
      this.dispatchEvent(userLoadedEvent);
      EventBus.instance.emit(EventBus.EVENTS.USER.LOADED, this.currentUser);

      // Legacy subscriber support
      this.notifySubscribers("user-loaded", this.currentUser);
    } catch (error) {
      console.error("Failed to load user profile:", error);

      // Emit error events
      const errorDetail = {
        error: error.message,
        action: "loadProfile",
        originalError: error,
      };

      this.dispatchEvent(
        new CustomEvent("user:error", {
          detail: errorDetail,
        })
      );
      EventBus.instance.emit(EventBus.EVENTS.USER.ERROR, errorDetail);

      // Persist debug info so the login page can show why we redirected
      const redirectInfo = {
        reason: "loadUserProfile_failed",
        message: error.message,
        action: "loadProfile",
        firebaseUid,
        time: new Date().toISOString(),
        stack: error.stack || null,
      };
      try {
        sessionStorage.setItem("auth:redirect", JSON.stringify(redirectInfo));
      } catch (e) {
        console.warn("Failed to write auth redirect info", e);
      }
      console.warn("[APP] loadUserProfile failed; redirecting to login:", redirectInfo);
      console.trace();
      this.redirectToLogin();
    }
  }

  async logout() {
    const previousUser = this.currentUser;
    let signOutError = null;
    try {
      // Ensure Firebase is initialized before signOut
      if (!firebaseAuth.auth) {
        await firebaseAuth.init();
      }
      await firebaseAuth.signOut();
    } catch (err) {
      signOutError = err;
      console.error("Firebase signout error:", err);
      // Fallback: if Firebase is not initialized, force logout
      if (!firebaseAuth.auth) {
        this.forceLogout();
        return;
      }
      // Optionally, show a user-friendly message (if you have a global error UI)
      if (typeof this.showError === "function") {
        this.showError("Logout failed. Please refresh the page or try again.");
      } else {
        alert("Logout failed. Please refresh the page or try again.");
      }
    }

    // Clear localStorage regardless of signOut result
    localStorage.removeItem("firebase_uid");
    localStorage.removeItem("phone_number");

    this.currentUser = null;
    this.userId = null;

    // Emit logout events
    const logoutDetail = {
      previousUser,
      timestamp: new Date().toISOString(),
      signOutError,
    };

    this.dispatchEvent(
      new CustomEvent("user:logout", {
        detail: logoutDetail,
      })
    );
    EventBus.instance.emit(EventBus.EVENTS.USER.LOGOUT, logoutDetail);

    this.redirectToLogin();
  }

  // Fallback: force logout if Firebase cannot be initialized
  forceLogout() {
    localStorage.removeItem("firebase_uid");
    localStorage.removeItem("phone_number");
    this.currentUser = null;
    this.userId = null;
    this.dispatchEvent(new CustomEvent("user:logout", { detail: { forced: true } }));
    EventBus.instance.emit(EventBus.EVENTS.USER.LOGOUT, { forced: true });
    this.redirectToLogin();
  }

  initializeNavigation() {
    const navigation = document.querySelector("site-navigation");
    if (navigation && this.currentUser) {
      navigation.setCurrentUser(this.currentUser);
    }
  }

  // Modern event-based subscription (recommended)
  on(eventType, handler, options = {}) {
    this.addEventListener(eventType, handler, options);
    return () => this.removeEventListener(eventType, handler, options);
  }

  // Emit custom events
  emit(eventType, detail) {
    this.dispatchEvent(new CustomEvent(eventType, { detail }));
    EventBus.instance.emit(eventType, detail);
  }

  // Legacy subscription - DEPRECATED
  subscribe(callback) {
    console.warn(
      "AppState.subscribe() is deprecated. Use appState.on(eventType, handler) instead."
    );
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  // Legacy subscriber notification - for backward compatibility
  notifySubscribers(event, data) {
    this.subscribers.forEach((callback) => {
      try {
        callback(event, data);
      } catch (error) {
        console.error("Legacy subscriber callback error:", error);
      }
    });
  }

  // Debug helpers to suppress redirects during investigation
  disableRedirectsForDebug() {
    try {
      sessionStorage.setItem("auth:disableRedirect", "true");
      console.warn("[APP] Auth redirects disabled (debug)");
    } catch (e) {
      console.warn("Failed to set debug redirect flag", e);
    }
  }

  enableRedirects() {
    try {
      sessionStorage.removeItem("auth:disableRedirect");
      console.warn("[APP] Auth redirects enabled");
    } catch (e) {
      console.warn("Failed to remove debug redirect flag", e);
    }
  }

  redirectsSuppressed() {
    return sessionStorage.getItem("auth:disableRedirect") === "true" || !!APP_CONFIG.disableAuthRedirects;
  }

  // Authentication methods
  async logout() {
    const previousUser = this.currentUser;
    let signOutError = null;
    try {
      // Ensure Firebase is initialized before signOut
      await firebaseAuth.init();
      await firebaseAuth.signOut();
    } catch (err) {
      signOutError = err;
      console.error("Firebase signout error:", err);
      // Optionally, show a user-friendly message (if you have a global error UI)
      if (typeof this.showError === "function") {
        this.showError("Logout failed. Please refresh the page or try again.");
      } else {
        alert("Logout failed. Please refresh the page or try again.");
      }
    }

    // Clear localStorage regardless of signOut result
    console.log("[APP] Removed localStorage.firebase_uid (on logout)");
    localStorage.removeItem("firebase_uid");
    localStorage.removeItem("phone_number");

    this.currentUser = null;
    this.userId = null;

    // Emit logout events
    const logoutDetail = {
      previousUser,
      timestamp: new Date().toISOString(),
      signOutError,
    };

    this.dispatchEvent(
      new CustomEvent("user:logout", {
        detail: logoutDetail,
      })
    );
    EventBus.instance.emit(EventBus.EVENTS.USER.LOGOUT, logoutDetail);

    this.redirectToLogin();
  }

  redirectToLogin() {
    // Prevent redirect loop if already on login page (index.html or /)
    const path = window.location.pathname.replace(/^\/+/, "");
    if (path === "" || path === "index.html") {
      return;
    }

    // If debug suppression is enabled, do not navigate away — just log
    if (this.redirectsSuppressed()) {
      console.warn("[APP] redirectToLogin suppressed by debug flag. would-have-redirected-from:", path);
      try {
        sessionStorage.setItem(
          "auth:redirect",
          JSON.stringify({ reason: "redirect_suppressed", path, time: new Date().toISOString() })
        );
      } catch (e) {
        /* ignore */
      }
      return;
    }

    // store minimal context for debugging
    try {
      const debug = {
        reason: "redirectToLogin_called",
        path,
        time: new Date().toISOString(),
        firebaseUid: localStorage.getItem("firebase_uid"),
        currentUser: this.currentUser
          ? { id: this.currentUser.id, username: this.currentUser.username }
          : null,
      };
      sessionStorage.setItem("auth:redirect", JSON.stringify(debug));
    } catch (e) {
      /* ignore storage failures */
    }
    console.warn("[APP] redirectToLogin()", { path });
    console.trace();
    window.location.href = "/";
  }

  // Getters for convenience
  getSupabase() {
    return this.supabase;
  }

  getCurrentUser() {
    return this.currentUser;
  }

  getUserId() {
    return this.userId;
  }
}

// Create and freeze singleton instance
const appState = new AppState();

// Export both the instance, class, and config
// Usage: Always import { appState } and use appState.getCurrentUser(), appState.getUserId(), appState.getSupabase()
export { appState, AppState, APP_CONFIG };
