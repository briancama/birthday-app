/**
 * Firebase Phone Authentication Service
 * Handles phone verification via OTP and linking with Supabase users
 * Uses Firebase compat SDK (global firebase object loaded via script tags)
 */

import { FIREBASE_CONFIG } from "../config.js";

class FirebaseAuthService {
  constructor() {
    this.app = null;
    this.auth = null;
    this.recaptchaVerifier = null;
    this.confirmationResult = null;
  }

  /**
   * Initialize Firebase app and auth
   */
  async init() {
    try {
      // Firebase compat API - firebase is global from script tags
      if (!window.firebase) {
        throw new Error("Firebase SDK not loaded globally. Check script tags in HTML.");
      }

      this.app = firebase.initializeApp(FIREBASE_CONFIG);
      this.auth = firebase.auth();

      // Ensure persistence so sessions survive reloads (LOCAL persistence)
      try {
        if (this.auth.setPersistence) {
          await this.auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
          console.log("✅ Firebase auth persistence set to LOCAL");
        }
      } catch (pErr) {
        console.warn("⚠️ Could not set Firebase persistence:", pErr);
      }

      // Wait for Firebase Auth initial state to be determined
      await new Promise((resolve) => {
        const unsub = this.auth.onAuthStateChanged((user) => {
          console.log("[firebaseAuth] initial auth state:", !!user);
          unsub();
          resolve();
        });
      });

      console.log("✅ Firebase initialized", { currentUser: this.auth.currentUser });
      return this;
    } catch (err) {
      console.error("✖️ Firebase init failed:", err);
      throw err;
    }
  }

  /**
   * Setup reCAPTCHA verifier for phone auth
   * @param {string} containerId - ID of element to render reCAPTCHA
   */
  async setupRecaptcha(containerId) {
    try {
      if (!this.auth) {
        throw new Error("Firebase auth not initialized. Call init() first.");
      }
      const container = document.getElementById(containerId);
      if (!container) {
        const errorMsg = `Container with ID "${containerId}" not found`;
        console.error("✖️ reCAPTCHA setup failed:", errorMsg);
        throw new Error(errorMsg);
      }
      // Create RecaptchaVerifier once
      if (!this.recaptchaVerifier) {
        try {
          this.recaptchaVerifier = new firebase.auth.RecaptchaVerifier(containerId, {
            size: "invisible",
            callback: (token) => {
              console.log("✅ reCAPTCHA verified");
            },
            "expired-callback": () => {
              console.warn("⚠️ reCAPTCHA expired");
              if (this.recaptchaVerifier) {
                this.recaptchaVerifier.clear();
                this.recaptchaVerifier = null;
              }
            },
          });
        } catch (verifierErr) {
          console.error("✖️ reCAPTCHA verifier creation failed:", verifierErr);
          throw verifierErr;
        }
      }
      return this;
    } catch (err) {
      console.error("✖️ reCAPTCHA setup failed:", err);
      throw err;
    }
  }

  /**
   * Send OTP to phone number (E.164 format: +16175551234)
   * @param {string} phoneNumber - Phone in E.164 format
   * @returns {Promise<Object>} Confirmation result for verification
   */
  async sendOTP(phoneNumber) {
    try {
      // Validate phone number input and convert to E.164 format
      let formattedNumber = phoneNumber;
      try {
        // Remove all non-digit characters
        const digits = phoneNumber.replace(/\D/g, "");
        if (digits.length === 10) {
          // Assume US number, add country code
          formattedNumber = "+1" + digits;
        } else if (digits.length === 11 && digits.startsWith("1")) {
          formattedNumber = "+" + digits;
        } else if (digits.length > 10 && digits.startsWith("")) {
          formattedNumber = "+" + digits;
        } else {
          const errorMsg = "Invalid phone number format. Please enter a valid 10-digit US number.";
          console.error("✖️ Phone number validation failed:", errorMsg);
          throw new Error(errorMsg);
        }
      } catch (formatErr) {
        console.error("✖️ Phone number validation failed:", formatErr);
        throw formatErr;
      }

      // Use existing RecaptchaVerifier
      if (!this.recaptchaVerifier) {
        const errorMsg = "reCAPTCHA not initialized. Call setupRecaptcha() first.";
        console.error("✖️ sendOTP error:", errorMsg);
        throw new Error(errorMsg);
      }

      // Log formatted phone number for debugging
      console.log("📞 Formatted phone number:", formattedNumber);

      // Ensure reCAPTCHA is rendered and ready
      try {
        await this.recaptchaVerifier.render();
      } catch (renderErr) {
        console.error("✖️ reCAPTCHA render failed:", renderErr);
        throw new Error("reCAPTCHA render failed. Please refresh and try again.");
      }

      // Optionally, force reCAPTCHA to resolve before sending OTP
      let recaptchaToken;
      try {
        recaptchaToken = await this.recaptchaVerifier.verify();
        if (!recaptchaToken) {
          const errorMsg = "reCAPTCHA verification failed. Please try again.";
          console.error("✖️ reCAPTCHA verify failed:", errorMsg);
          throw new Error(errorMsg);
        }
      } catch (verifyErr) {
        console.error("✖️ reCAPTCHA verify failed:", verifyErr);
        throw new Error("reCAPTCHA verify failed. Please refresh and try again.");
      }

      // signInWithPhoneNumber returns a ConfirmationResult
      try {
        this.confirmationResult = await this.auth.signInWithPhoneNumber(
          formattedNumber,
          this.recaptchaVerifier
        );
      } catch (otpErr) {
        console.error("✖️ Failed to send OTP:", otpErr);
        // Clear reCAPTCHA on error so it can be tried again
        if (this.recaptchaVerifier) {
          this.recaptchaVerifier.clear();
          this.recaptchaVerifier = null;
        }
        throw new Error("Failed to send OTP. Please check your phone number and try again.");
      }

      console.log("✅ OTP sent to", formattedNumber);

      return this.confirmationResult;
    } catch (err) {
      // Top-level catch for any error
      console.error("✖️ sendOTP error:", err);
      throw new Error(
        "An unexpected error occurred during phone authentication. Please try again or contact support."
      );
    }
  }

  /**
   * Verify OTP code entered by user
   * @param {string} code - 6-digit code from SMS
   * @returns {Promise<Object>} Firebase user credential with uid
   */
  async verifyOTP(code) {
    try {
      if (!this.confirmationResult) {
        throw new Error("No confirmation result. Send OTP first.");
      }

      const userCredential = await this.confirmationResult.confirm(code);

      console.log("✅ OTP verified successfully");

      return userCredential;
    } catch (err) {
      console.error("✖️ Failed to verify OTP:", err);
      throw err;
    }
  }

  /**
   * Get current Firebase user
   * @returns {Object|null} Firebase user object or null
   */
  getCurrentUser() {
    return this.auth?.currentUser || null;
  }

  /**
   * Sign out from Firebase
   */
  async signOut() {
    try {
      await this.auth.signOut();
      this.confirmationResult = null;
      console.log("✅ Signed out from Firebase");
    } catch (err) {
      console.error("✖️ Sign out failed:", err);
      throw err;
    }
  }

  /**
   * On auth state changed listener
   * @param {Function} callback - Called with user object or null
   * @returns {Function} Unsubscribe function
   */
  onAuthStateChanged(callback) {
    return this.auth.onAuthStateChanged(callback);
  }

  /**
   * Get current user's Firebase ID token
   * @returns {Promise<string|null>} ID token or null if not logged in
   */
  async getIdToken() {
    const user = this.getCurrentUser();
    if (!user) return null;
    return await user.getIdToken();
  }
}

export const firebaseAuth = new FirebaseAuthService();
