// Handles login form logic for index.html (Firebase phone auth + Supabase user creation)
import { appState } from "../app.js";
import { BasePage } from "./base-page.js";
import { firebaseAuth } from "../services/firebase-auth.js";
import { formatPhoneInput, toE164Format, isValidUSPhone } from "../utils/phone-format.js";

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
        // Wait for appState.init() to confirm auth and user profile
        const authSuccess = await appState.init();
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
    this.sendOTPBtn?.removeEventListener("click", this._sendOTPHandler);
    this.backBtn?.removeEventListener("click", this._backBtnHandler);
    this.form?.removeEventListener("submit", this._formSubmitHandler);
    // Add more cleanup as needed
  }
}

export { LoginPage };
