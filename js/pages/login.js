// Handles login form logic for index.html (Firebase phone auth + Supabase user creation)
import { appState } from "../app.js";
import { BasePage } from "./base-page.js";
import { firebaseAuth } from "../services/firebase-auth.js";
import { formatPhoneInput, toE164Format, isValidUSPhone } from "../utils/phone-format.js";
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.94.1/+esm";
import { SUPABASE_CONFIG } from "../config.js";

class LoginPage extends BasePage {
  constructor() {
    super({ requiresAuth: false });
    this.phoneNumber = null;
    this.recaptchaReady = false;
    this.form = document.getElementById("loginForm");
    this.phoneInput = document.getElementById("phoneInput");
    this.otpInput = document.getElementById("otpInput");
    this.phoneStep = document.getElementById("phoneStep");
    this.otpStep = document.getElementById("otpStep");
    this.sendOTPBtn = document.getElementById("sendOTPBtn");
    this.verifyOTPBtn = document.getElementById("verifyOTPBtn");
    this.backBtn = document.getElementById("backBtn");
    this.errorDiv = document.getElementById("error");
    this.recaptchaContainer = document.getElementById("recaptchaContainer");
    // Store handler references for cleanup
    this._phoneInputHandler = (e) => {
      e.target.value = formatPhoneInput(e.target.value);
    };

    this._phoneKeyHandler = (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        // Trigger the same flow as clicking the send OTP button
        this._sendOTPHandler(e);
      }
    };
    this._sendOTPHandler = async (e) => {
      e.preventDefault();
      this.errorDiv.textContent = "";
      if (!this.recaptchaReady) {
        try {
          this.sendOTPBtn.disabled = true;
          this.sendOTPBtn.textContent = "Setting up...";
          await firebaseAuth.setupRecaptcha("recaptchaContainer");
          this.recaptchaReady = true;
          this.sendOTPBtn.disabled = false;
          this.sendOTPBtn.textContent = ">>> SEND CODE <<<";
        } catch (err) {
          this.showError("Setup failed: " + err.message);
          this.sendOTPBtn.disabled = false;
          this.sendOTPBtn.textContent = ">>> SEND CODE <<<";
          return;
        }
      }
      this.phoneNumber = this.phoneInput.value.trim();
      if (!this.phoneNumber) {
        this.showError("Please enter a phone number");
        return;
      }
      try {
        this.phoneNumber = toE164Format(this.phoneNumber);
      } catch (err) {
        this.showError(err.message);
        return;
      }
      // Pre-check: ensure phone number exists in our users table before sending OTP
      try {
        const supabase = createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.key);
        const { data: userMatch, error: userErr } = await supabase
          .from("users")
          .select("id")
          .eq("phone_number", this.phoneNumber)
          .maybeSingle();
        if (userErr) {
          console.warn("Supabase lookup error:", userErr);
          // If lookup fails for unexpected reasons, allow OTP flow to continue
        }
        if (!userMatch) {
          this.showError(
            "Sorry — that phone number is not authorized. Contact Brian if you'd like access."
          );
          return;
        }
      } catch (lookupErr) {
        console.error("Phone lookup failed:", lookupErr);
        // Don't block OTP on lookup infrastructure errors; continue
      }
      this.sendOTPBtn.disabled = true;
      this.sendOTPBtn.textContent = "Sending...";
      try {
        await firebaseAuth.sendOTP(this.phoneNumber);
        this.phoneStep.style.display = "none";
        this.phoneInput.required = false;
        this.otpStep.style.display = "block";
        this.otpInput.focus();
      } catch (err) {
        console.error("Send OTP error:", err);
        this.showError(err.message || "Failed to send code. Try again.");
        this.sendOTPBtn.disabled = false;
        this.sendOTPBtn.textContent = ">>> SEND CODE <<<";
      }
    };
    this._backBtnHandler = (e) => {
      e.preventDefault();
      this.phoneStep.style.display = "block";
      this.otpStep.style.display = "none";
      this.phoneInput.required = true;
      this.errorDiv.textContent = "";
      this.otpInput.value = "";
      this.sendOTPBtn.disabled = false;
      this.sendOTPBtn.textContent = ">>> SEND CODE <<<";
    };
    this._formSubmitHandler = async (e) => {
      console.log("Form submit event fired");
      e.preventDefault();
      // If we're still on the phone step, route submit to send OTP
      if (this.phoneStep && this.phoneStep.style.display !== "none") {
        await this._sendOTPHandler(e);
        return;
      }
      this.errorDiv.textContent = "";
      const code = this.otpInput.value.trim();
      if (!code || code.length !== 6) {
        this.showError("Please enter a valid 6-digit code");
        return;
      }
      this.verifyOTPBtn.disabled = true;
      this.verifyOTPBtn.textContent = "Verifying...";
      try {
        let userCredential;
        try {
          userCredential = await firebaseAuth.verifyOTP(code);
        } catch (otpErr) {
          let message = "Verification failed. Try again.";
          if (otpErr.code === "auth/invalid-verification-code") {
            message = "The code you entered is incorrect. Please try again.";
          } else if (otpErr.code === "auth/code-expired") {
            message = "This code has expired. Please request a new one.";
          } else if (otpErr.code === "auth/too-many-requests") {
            message = "Too many attempts. Please wait and try again later.";
          } else if (otpErr.code) {
            message = `Verification error: ${otpErr.message}`;
          }
          this.showError(message);
          this.verifyOTPBtn.disabled = false;
          this.verifyOTPBtn.textContent = ">>> VERIFY CODE <<<";
          return;
        }
        if (!userCredential?.user?.uid) {
          this.showError("Firebase verification failed. Please try again.");
          this.verifyOTPBtn.disabled = false;
          this.verifyOTPBtn.textContent = ">>> VERIFY CODE <<<";
          return;
        }
        const firebaseUid = userCredential.user.uid;
        localStorage.setItem("firebase_uid", firebaseUid);
        localStorage.setItem("phone_number", this.phoneNumber);
        // Exchange token with server and initialize app state
        const authSuccess = await this.serverLoginAndInit();
        if (authSuccess) {
          window.location.href = "dashboard";
        } else {
          this.showError("Authentication failed. Please try again.");
          this.verifyOTPBtn.disabled = false;
          this.verifyOTPBtn.textContent = ">>> VERIFY CODE <<<";
        }
      } catch (err) {
        console.error("Verify OTP error:", err);
        this.showError(err.message || "Verification failed. Try again.");
        this.verifyOTPBtn.disabled = false;
        this.verifyOTPBtn.textContent = ">>> VERIFY CODE <<<";
      }
    };
  }

  // Exchanges the Firebase ID token with the server to set a signed cookie,
  // then initializes `appState`. Returns `true` on success, `false` on failure.
  async serverLoginAndInit() {
    const sdkUser = firebaseAuth.getCurrentUser();
    if (!sdkUser) {
      this.showError("No Firebase user found after verification.");
      return false;
    }
    try {
      // Force-refresh token to ensure freshness and avoid expired tokens
      const idToken = await sdkUser.getIdToken(true);
      const resp = await fetch("/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ idToken }),
      });
      if (!resp.ok) {
        const err = await resp.text().catch(() => resp.statusText);
        this.showError("Server login failed: " + err);
        return false;
      }
    } catch (loginErr) {
      console.error("Server /auth/login error:", loginErr);
      this.showError("Failed to establish session with server.");
      return false;
    }

    try {
      const authSuccess = await appState.init();
      return Boolean(authSuccess);
    } catch (e) {
      console.error("appState.init() failed:", e);
      this.showError("Failed to initialize app state.");
      return false;
    }
  }

  async onReady() {
    await firebaseAuth.init();

    // Surface any previous auth redirect reason (helpful for debugging)
    try {
      const redirectRaw = sessionStorage.getItem("auth:redirect");
      if (redirectRaw) {
        const info = JSON.parse(redirectRaw);
        console.warn("[LOGIN] previous auth redirect info:", info);
        if (this.errorDiv) {
          this.errorDiv.textContent = `Auth redirect: ${info.reason || info.message || JSON.stringify(info)}`;
        }
        sessionStorage.removeItem("auth:redirect");
      }
    } catch (e) {
      console.warn("Failed to read auth redirect info", e);
    }

    // Clear stale localStorage if Firebase SDK does not have an active user
    try {
      const storedUid = localStorage.getItem("firebase_uid");
      const sdkUser = firebaseAuth.getCurrentUser();
      if (storedUid && !sdkUser) {
        console.warn("[LOGIN] Clearing stale localStorage.firebase_uid (no SDK user)", storedUid);
        localStorage.removeItem("firebase_uid");
        localStorage.removeItem("phone_number");
        if (this.errorDiv) {
          this.errorDiv.textContent = "Cleared stale local session data - please sign in.";
        }
      }

      // Show if auth redirects are currently suppressed for debugging
      const redirectsSuppressed = sessionStorage.getItem("auth:disableRedirect") === "true";
      if (redirectsSuppressed && this.errorDiv) {
        this.errorDiv.textContent =
          (this.errorDiv.textContent ? this.errorDiv.textContent + " | " : "") +
          "Redirects are currently DISABLED (debug)";
        console.warn("[LOGIN] Auth redirects are suppressed (auth:disableRedirect=true)");
      }
    } catch (e) {
      console.warn("Failed to validate/clear stale localStorage", e);
    }

    // Attach event listeners with handler references
    this.phoneInput.addEventListener("input", this._phoneInputHandler);
    this.phoneInput.addEventListener("keydown", this._phoneKeyHandler);
    this.sendOTPBtn.addEventListener("click", this._sendOTPHandler);
    this.backBtn.addEventListener("click", this._backBtnHandler);
    this.form.addEventListener("submit", this._formSubmitHandler);

    // If already signed in, validate session before redirecting
    const sdkUser = firebaseAuth.getCurrentUser();
    if (sdkUser && sdkUser.uid) {
      const profile = appState.getCurrentUser();
      if (profile && profile.id) {
        window.location.href = "dashboard";
        return;
      }
    }
  }

  cleanup() {
    // Remove all event listeners to prevent stale state
    this.phoneInput?.removeEventListener("input", this._phoneInputHandler);
    this.phoneInput?.removeEventListener("keydown", this._phoneKeyHandler);
    this.sendOTPBtn?.removeEventListener("click", this._sendOTPHandler);
    this.backBtn?.removeEventListener("click", this._backBtnHandler);
    this.form?.removeEventListener("submit", this._formSubmitHandler);
    // Add more cleanup as needed
  }
}

export { LoginPage };
