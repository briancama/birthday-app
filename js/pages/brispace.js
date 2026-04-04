import { BasePage } from "./base-page.js";
import { firebaseAuth } from "../services/firebase-auth.js";
import { YTMNDEasterEgg } from "../components/ytmnd-easter-egg.js";
import { appState } from "../app.js";

class BrispacePage extends BasePage {
  constructor() {
    super({ requiresAuth: false });
    this.ytmndEgg = null;
  }

  async onReady() {
    await firebaseAuth.init();

    // Initialize YTMND easter egg, but only enable it if user is logged in
    this.ytmndEgg = new YTMNDEasterEgg({ enabled: !!appState.getCurrentUser() });
    this.ytmndEgg.init();

    // Listen for auth changes and update easter egg state
    const userLoadedCleanup = appState.on("user:loaded", () => {
      if (this.ytmndEgg) {
        this.ytmndEgg.setEnabled(!!appState.getCurrentUser());
      }
    });

    const userLogoutCleanup = appState.on("user:logout", () => {
      if (this.ytmndEgg) {
        this.ytmndEgg.setEnabled(false);
      }
    });

    // Store cleanup functions for lifecycle management
    this.authCleanups = [userLoadedCleanup, userLogoutCleanup];
  }

  cleanup() {
    super.cleanup();
    if (this.ytmndEgg) {
      this.ytmndEgg.destroy();
      this.ytmndEgg = null;
    }
    if (this.authCleanups) {
      this.authCleanups.forEach((cleanup) => cleanup?.());
      this.authCleanups = [];
    }
  }
}

export { BrispacePage };
