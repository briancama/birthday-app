// js/login.js
// Handles login form logic for index.html (Firebase phone auth + Supabase user creation)

import { appState } from "./app.js";
import { BasePage } from "./base-page.js";
import { firebaseAuth } from "./services/firebase-auth.js";
import { formatPhoneInput, toE164Format, isValidUSPhone } from "./utils/phone-format.js";

class LoginPage extends BasePage {
  constructor() {
    super();
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
  }

  async onReady() {
    await firebaseAuth.init();
    this.phoneInput.addEventListener("input", (e) => {
      e.target.value = formatPhoneInput(e.target.value);
    });

    this.sendOTPBtn.addEventListener("click", async (e) => {
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
          this.errorDiv.textContent = "Setup failed: " + err.message;
          this.sendOTPBtn.disabled = false;
          this.sendOTPBtn.textContent = ">>> SEND CODE <<<";
          return;
        }
      }
      this.phoneNumber = this.phoneInput.value.trim();
      if (!this.phoneNumber) {
        this.errorDiv.textContent = "Please enter a phone number";
        return;
      }
      try {
        this.phoneNumber = toE164Format(this.phoneNumber);
      } catch (err) {
        this.errorDiv.textContent = err.message;
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
        this.errorDiv.textContent = err.message || "Failed to send code. Try again.";
        this.sendOTPBtn.disabled = false;
        this.sendOTPBtn.textContent = ">>> SEND CODE <<<";
      }
    });

    this.backBtn.addEventListener("click", (e) => {
      e.preventDefault();
      this.phoneStep.style.display = "block";
      this.otpStep.style.display = "none";
      this.phoneInput.required = true;
      this.errorDiv.textContent = "";
      this.otpInput.value = "";
      this.sendOTPBtn.disabled = false;
      this.sendOTPBtn.textContent = ">>> SEND CODE <<<";
    });

    this.form.addEventListener("submit", async (e) => {
      e.preventDefault();
      this.errorDiv.textContent = "";
      const code = this.otpInput.value.trim();
      if (!code || code.length !== 6) {
        this.errorDiv.textContent = "Please enter a valid 6-digit code";
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
          this.errorDiv.textContent = message;
          this.verifyOTPBtn.disabled = false;
          this.verifyOTPBtn.textContent = ">>> VERIFY CODE <<<";
          return;
        }
        if (!userCredential?.user?.uid) {
          this.errorDiv.textContent = "Firebase verification failed. Please try again.";
          this.verifyOTPBtn.disabled = false;
          this.verifyOTPBtn.textContent = ">>> VERIFY CODE <<<";
          return;
        }
        const firebaseUid = userCredential.user.uid;
        const supabase = appState.getSupabase();
        let idToken = null;
        for (let i = 0; i < 10; i++) {
          idToken = await firebaseAuth.getIdToken();
          if (idToken) break;
          await new Promise((res) => setTimeout(res, 200));
        }
        if (!idToken) {
          this.errorDiv.textContent = "Failed to obtain authentication token. Please try again.";
          this.verifyOTPBtn.disabled = false;
          this.verifyOTPBtn.textContent = ">>> VERIFY CODE <<<";
          return;
        }
        await supabase.auth.setSession({ access_token: idToken, refresh_token: idToken });
        console.log("ID Token set for Supabase session:", idToken);
        const { data: existingUser, error: selectErr } = await supabase
          .from("users")
          .select("*")
          .eq("phone_number", this.phoneNumber)
          .maybeSingle();
        if (selectErr) throw selectErr;
        let user = existingUser;
        if (existingUser) {
          const { error: updateErr } = await supabase
            .from("users")
            .update({ firebase_uid: firebaseUid })
            .eq("id", existingUser.id);
          if (updateErr) throw updateErr;
          user = { ...existingUser, firebase_uid: firebaseUid };
        } else {
          const { data: newUser, error: insertErr } = await supabase
            .from("users")
            .insert([
              {
                firebase_uid: firebaseUid,
                phone_number: this.phoneNumber,
                display_name: this.phoneNumber,
                username: this.phoneNumber,
              },
            ])
            .select()
            .single();
          if (insertErr) throw insertErr;
          user = newUser;
        }
        localStorage.setItem("firebase_uid", firebaseUid);
        localStorage.setItem("phone_number", this.phoneNumber);
        appState.emit("user:loaded", {
          id: user.id,
          firebase_uid: firebaseUid,
          username: user.username,
          display_name: user.display_name,
          name: user.display_name || user.username,
          created_at: user.created_at,
          isAdmin: user.isAdmin || false,
        });
        window.location.href = "dashboard";
      } catch (err) {
        console.error("Verify OTP error:", err);
        this.errorDiv.textContent = err.message || "Verification failed. Try again.";
        this.verifyOTPBtn.disabled = false;
        this.verifyOTPBtn.textContent = ">>> VERIFY CODE <<<";
      }
    });

    // If already signed in, redirect
    if (appState.getCurrentUser() && appState.getUserId()) {
      window.location.href = "dashboard";
    }
  }

  cleanup() {
    // Add any event cleanup if needed
  }
}

// Instantiate LoginPage on DOMContentLoaded
window.addEventListener("DOMContentLoaded", () => {
  const loginPage = new LoginPage();
  loginPage.init();
});
verifyOTPBtn.textContent = ">>> VERIFY CODE <<<";
