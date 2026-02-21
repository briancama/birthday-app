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
    return true;
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
      this.emit("user:loaded", this.currentUser);
    } catch (error) {
      this.emitError(error.message);
      this.redirectToLogin();
    }
  }

  async logout() {
    try {
      await firebaseAuth.init();
      await firebaseAuth.signOut();
    } catch (err) {
      this.emitError("Logout failed. Please refresh the page or try again.");
    }
    localStorage.removeItem("firebase_uid");
    localStorage.removeItem("phone_number");
    this.currentUser = null;
    this.userId = null;
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
    window.location.href = "index.html";
  }

  getCurrentUser() {
    return this.currentUser;
  }

  getUserId() {
    return this.userId;
  }

  getSupabase() {
    return this.supabase;
  }
}

export const authManager = new AuthManager();
