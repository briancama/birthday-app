import { authManager } from "./services/auth-manager.js";
import { EventBus } from "./events/event-bus.js";
import { VAPID_PUBLIC_KEY } from "./config.js";

// Environment detection
const isProduction =
  window.location.hostname !== "localhost" &&
  window.location.hostname !== "127.0.0.1" &&
  !window.location.hostname.includes("github.io");

// Application Configuration (moved from config.js since that's gitignored)
const APP_CONFIG = {
  // Auto-refresh disabled — use the manual refresh button on the leaderboard instead
  enableAutoRefresh: false,
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

// Expose VAPID public key for notification subscription flows
try {
  window.APP_VAPID_PUBLIC_KEY = VAPID_PUBLIC_KEY;
} catch (e) {
  /* ignore in non-browser environments */
}

class AppState extends EventTarget {
  async logout() {
    return await this.authManager.logout();
  }
  constructor() {
    super();
    this.authManager = authManager;
  }

  async init() {
    return await this.authManager.init();
  }

  getCurrentUser() {
    return this.authManager.getCurrentUser();
  }

  getUserId() {
    return this.authManager.getUserId();
  }

  getUserType() {
    return this.authManager.getUserType();
  }

  getSupabase() {
    return this.authManager.getSupabase();
  }

  async softInit() {
    return await this.authManager.softInit();
  }

  on(eventType, handler, options = {}) {
    this.authManager.addEventListener(eventType, handler, options);
    return () => this.authManager.removeEventListener(eventType, handler, options);
  }

  emit(eventType, detail) {
    this.authManager.emit(eventType, detail);
  }
}

const appState = new AppState();

export { appState, AppState, APP_CONFIG };
