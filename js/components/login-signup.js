// LoginSignupForm component: renders phone auth form for login/signup
// Usage: createLoginSignupForm({ onSuccess }) => HTMLElement
import { firebaseAuth } from "../services/firebase-auth.js";
import { formatPhoneInput, toE164Format } from "../utils/phone-format.js";

export function createLoginSignupForm({ onSuccess }) {
  const container = document.createElement("div");
  container.className = "login-signup-form";

  // Step 1: Phone input
  const phoneStep = document.createElement("div");
  phoneStep.className = "login-signup-step";
  const phoneLabel = document.createElement("label");
  phoneLabel.textContent = "Enter your phone number";
  const phoneInput = document.createElement("input");
  phoneInput.type = "tel";
  phoneInput.placeholder = "(555) 123-4567";
  phoneInput.maxLength = 14;
  phoneInput.required = true;
  phoneStep.appendChild(phoneLabel);
  phoneStep.appendChild(phoneInput);
  const sendBtn = document.createElement("button");
  sendBtn.textContent = "Send Code";
  phoneStep.appendChild(sendBtn);
  container.appendChild(phoneStep);

  // Step 2: OTP input
  const otpStep = document.createElement("div");
  otpStep.className = "login-signup-step";
  otpStep.style.display = "none";
  const otpLabel = document.createElement("label");
  otpLabel.textContent = "Enter the code from your text";
  const otpInput = document.createElement("input");
  otpInput.type = "text";
  otpInput.placeholder = "000000";
  otpInput.maxLength = 6;
  otpInput.required = true;
  otpStep.appendChild(otpLabel);
  otpStep.appendChild(otpInput);
  const verifyBtn = document.createElement("button");
  verifyBtn.textContent = "Verify Code";
  otpStep.appendChild(verifyBtn);
  const backBtn = document.createElement("button");
  backBtn.textContent = "Back";
  backBtn.type = "button";
  otpStep.appendChild(backBtn);
  container.appendChild(otpStep);

  // Error message
  const errorDiv = document.createElement("div");
  errorDiv.className = "login-signup-error";
  container.appendChild(errorDiv);

  // Recaptcha container
  const recaptchaDiv = document.createElement("div");
  recaptchaDiv.id = "recaptchaContainer";
  container.appendChild(recaptchaDiv);

  // State
  let recaptchaReady = false;

  // Format phone input in real-time
  phoneInput.addEventListener("input", (e) => {
    e.target.value = formatPhoneInput(e.target.value);
  });

  // Allow Enter key to submit phone step
  phoneInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      sendBtn.click();
    }
  });

  // Back button resets to phone step
  backBtn.onclick = (e) => {
    e.preventDefault();
    phoneStep.style.display = "block";
    otpStep.style.display = "none";
    otpInput.value = "";
    errorDiv.textContent = "";
    sendBtn.disabled = false;
    sendBtn.textContent = "Send Code";
  };

  sendBtn.onclick = async (e) => {
    e.preventDefault();
    errorDiv.textContent = "";
    sendBtn.disabled = true;
    sendBtn.textContent = "Sending...";
    try {
      // Setup recaptcha only once
      if (!recaptchaReady) {
        await firebaseAuth.setupRecaptcha("recaptchaContainer");
        recaptchaReady = true;
      }
      // Format and validate phone before sending
      let formatted;
      try {
        formatted = toE164Format(phoneInput.value.trim());
      } catch (fmtErr) {
        errorDiv.textContent = fmtErr.message || "Invalid phone number.";
        return;
      }
      await firebaseAuth.sendOTP(formatted);
      phoneStep.style.display = "none";
      otpStep.style.display = "block";
      otpInput.focus();
    } catch (err) {
      errorDiv.textContent = err.message || "Failed to send code.";
      recaptchaReady = false; // reset so recaptcha can be re-initialized on retry
    } finally {
      sendBtn.disabled = false;
      sendBtn.textContent = "Send Code";
    }
  };

  verifyBtn.onclick = async (e) => {
    e.preventDefault();
    errorDiv.textContent = "";

    const code = otpInput.value.trim();
    if (!code || code.length !== 6) {
      errorDiv.textContent = "Please enter a valid 6-digit code.";
      return;
    }

    verifyBtn.disabled = true;
    verifyBtn.textContent = "Verifying...";
    try {
      // verifyOTP uses internal confirmationResult — don't pass it as an argument
      const userCredential = await firebaseAuth.verifyOTP(code);

      if (!userCredential?.user?.uid) {
        errorDiv.textContent = "Verification failed. Please try again.";
        return;
      }

      // Exchange Firebase token with server to set HttpOnly session cookie
      const idToken = await userCredential.user.getIdToken(true);
      const resp = await fetch("/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ idToken }),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: resp.statusText }));
        errorDiv.textContent = "Server login failed: " + (err.error || resp.statusText);
        return;
      }

      // Only persist client-side markers after server accepts the token
      try {
        localStorage.setItem("firebase_uid", userCredential.user.uid);
      } catch (_) {}

      if (onSuccess) onSuccess();
    } catch (err) {
      let message = "Verification failed. Try again.";
      if (err.code === "auth/invalid-verification-code") {
        message = "The code you entered is incorrect. Please try again.";
      } else if (err.code === "auth/code-expired") {
        message = "This code has expired. Please request a new one.";
      } else if (err.code === "auth/too-many-requests") {
        message = "Too many attempts. Please wait and try again later.";
      } else if (err.code === "auth/network-request-failed") {
        message = "Network error — check your connection and try again.";
      } else if (err.message) {
        message = err.message;
      }
      errorDiv.textContent = message;
    } finally {
      verifyBtn.disabled = false;
      verifyBtn.textContent = "Verify Code";
    }
  };

  return container;
}
