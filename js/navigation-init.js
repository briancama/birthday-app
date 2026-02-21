// Navigation initialization and user management

import { SiteNavigation } from "./components/navigation.js";
import { appState } from "./app.js";

// Initialize navigation with current user (driven by appState; guest-friendly)
document.addEventListener("DOMContentLoaded", () => {
  const navigation = document.querySelector("site-navigation");
  if (!navigation) return;

  // Immediately set whatever appState currently has (may be null -> guest)
  navigation.setCurrentUser(appState.getCurrentUser() || null);

  // Keep navigation in sync with global state changes
  appState.on("user:loaded", (e) => navigation.setCurrentUser(e.detail));
  appState.on("user:logout", () => navigation.setCurrentUser(null));
  appState.on("user:error", () => navigation.setCurrentUser(null));
});

// Export navigation utilities
export function updateNavigationUser(userData) {
  const navigation = document.querySelector("site-navigation");
  if (navigation) {
    navigation.setCurrentUser(userData);
  }
}

export function clearNavigationUser() {
  const navigation = document.querySelector("site-navigation");
  if (navigation) {
    navigation.setCurrentUser(null);
  }
}
