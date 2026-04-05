// AuthManager: Centralized authentication/session logic
import { firebaseAuth } from "./firebase-auth.js";
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.94.1/+esm";
import { EventBus } from "../events/event-bus.js";
import { SUPABASE_CONFIG } from "../config.js";

class AuthManager extends EventTarget {
  constructor() {
    super();
    this.supabase = createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.key);
    this.currentUser = null;
    this.userId = null;
    this.userType = null;
  }

  async init() {
    await firebaseAuth.init();
    await new Promise((resolve) => {
      const unsub = firebaseAuth.onAuthStateChanged((user) => {
        unsub();
        resolve();
      });
    });
    let firebaseUid =
      localStorage.getItem("firebase_uid") || firebaseAuth.getCurrentUser()?.uid || null;
    if (!firebaseUid) {
      this.emitError("missing_firebase_uid");
      this.redirectToLogin();
      return false;
    }
    await this.loadUserProfile(firebaseUid);
    // Return false if loadUserProfile failed (user not found, redirectToLogin already called)
    return !!this.userId;
  }

  async loadUserProfile(firebaseUid) {
    try {
      const { data, error } = await this.supabase
        .from("users")
        .select("*")
        .eq("firebase_uid", firebaseUid)
        .single();
      if (error || !data) throw new Error(error?.message || "User not found");
      this.currentUser = data;
      this.userId = data.id;
      this.userType = data.user_type || "visitor";
      this.emit("user:loaded", this.currentUser);
    } catch (error) {
      this.emitError(error.message);
      this.redirectToLogin();
    }
  }

  /**
   * Like init() but never redirects to login — used by pages that don't require auth
   * but still want to know who the user is (e.g. to award achievements).
   */
  async softInit() {
    try {
      await firebaseAuth.init();
      await new Promise((resolve) => {
        const unsub = firebaseAuth.onAuthStateChanged((user) => {
          unsub();
          resolve();
        });
      });
      const firebaseUid =
        localStorage.getItem("firebase_uid") || firebaseAuth.getCurrentUser()?.uid || null;
      if (!firebaseUid) return false;
      const { data } = await this.supabase
        .from("users")
        .select("*")
        .eq("firebase_uid", firebaseUid)
        .maybeSingle();
      if (data) {
        this.currentUser = data;
        this.userId = data.id;
        this.userType = data.user_type || "visitor";
        this.emit("user:loaded", this.currentUser);
        // Silently refresh the server-side session cookie so that authenticated
        // API routes (e.g. PATCH profile-fields) work without a full login page visit.
        this._syncServerCookie().catch(() => {});
      }
      return !!this.userId;
    } catch {
      return false;
    }
  }

  async _syncServerCookie() {
    try {
      const idToken = await firebaseAuth.getIdToken();
      if (!idToken) return;
      await fetch("/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ idToken }),
      });
    } catch {
      // Non-fatal — cookie sync is best-effort
    }
  }

  async logout() {
    try {
      // Attempt to clear server-side session cookie first
      try {
        await fetch("/auth/logout", { method: "POST", credentials: "include" });
      } catch (srvErr) {
        console.warn("Server logout failed:", srvErr);
      }

      // Ensure Firebase SDK signs out the client; no need to re-init the SDK here.
      await firebaseAuth.signOut();
    } catch (err) {
      this.emitError("Logout failed. Please refresh the page or try again.");
    }
    // Clear all localStorage except site-awards-clicked
    const siteAwardsClicked = localStorage.getItem("site-awards-clicked");
    localStorage.clear();
    if (siteAwardsClicked !== null) {
      localStorage.setItem("site-awards-clicked", siteAwardsClicked);
    }
    // Clear cookies (client-side, only those accessible via JS)
    document.cookie.split(";").forEach((cookie) => {
      const eqPos = cookie.indexOf("=");
      const name = eqPos > -1 ? cookie.substr(0, eqPos).trim() : cookie.trim();
      // Set expiration in past for each cookie
      document.cookie = name + "=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/";
    });
    this.currentUser = null;
    this.userId = null;
    this.supabase = null;
    this.emit("user:logout", {});
    this.redirectToLogin();
  }

  emit(eventType, detail) {
    this.dispatchEvent(new CustomEvent(eventType, { detail }));
    EventBus.instance.emit(eventType, detail);
  }

  emitError(message) {
    this.emit("user:error", { error: message });
  }

  redirectToLogin() {
    window.location.href = "/";
  }

  getCurrentUser() {
    return this.currentUser;
  }

  getUserId() {
    return this.userId;
  }

  getUserType() {
    return this.userType;
  }

  getSupabase() {
    return this.supabase;
  }
}

export const authManager = new AuthManager();
