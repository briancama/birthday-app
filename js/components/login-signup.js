// LoginSignupForm component: renders phone auth form for login/signup
// Usage: createLoginSignupForm({ onSuccess }) => HTMLElement

import { firebaseAuth } from "../services/firebase-auth.js";
import { formatPhoneInput, toE164Format } from "../utils/phone-format.js";
import { DialogChain } from "./DialogChain.js";
import { dialogChains } from "./dialog-chains.js";

export function createLoginSignupForm({
  onSuccess,
  heading: headingText,
  loginLabel,
  signupLabel,
  hideSignup,
  postLoginRedirect,
} = {}) {
  const hasCookie = (name) => {
    try {
      const prefix = `${name}=`;
      return document.cookie.split(";").some((part) => part.trim().startsWith(prefix));
    } catch (_) {
      return false;
    }
  };

  // --- Brian Trivia Dialog Chain (refactored) ---
  function runForgotPhoneDialogChain() {
    const chain = new DialogChain(dialogChains.forgotPhone);
    chain.start();
  }
  const container = document.createElement("div");
  container.className = "login-signup-form";

  // Step 1: Phone input
  const phoneStep = document.createElement("div");
  phoneStep.className = "login-signup-step";
  // Member Login heading
  const heading = document.createElement("h3");
  heading.textContent = headingText || "Member Login";
  heading.style.marginBottom = "0.5em";
  phoneStep.appendChild(heading);

  // Flex row for input and label
  const phoneRow = document.createElement("div");
  phoneRow.style.display = "flex";
  phoneRow.style.alignItems = "center";
  phoneRow.style.gap = "0.5em";

  // Right-aligned label
  const phoneLabel = document.createElement("label");
  phoneLabel.textContent = "Phone:";

  // Phone input
  const phoneInput = document.createElement("input");
  phoneInput.type = "tel";
  phoneInput.placeholder = "(555) 123-4567";
  phoneInput.maxLength = 14;
  phoneInput.required = true;
  phoneInput.style.flex = "1";

  phoneRow.appendChild(phoneLabel);
  phoneRow.appendChild(phoneInput);
  phoneStep.appendChild(phoneRow);

  // Flex row for input and label
  const buttonRow = document.createElement("div");
  buttonRow.style.display = "flex";
  buttonRow.style.alignItems = "center";
  buttonRow.style.justifyContent = "center";
  buttonRow.style.gap = "0.5em";
  // Two buttons: Login and Sign Up
  const loginBtn = document.createElement("button");
  loginBtn.classList.add("login-secondary-btn");
  loginBtn.textContent = loginLabel || "Login";
  const signupBtn = document.createElement("button");
  signupBtn.classList.add("login-primary-btn");
  signupBtn.textContent = signupLabel || "Sign Up";
  loginBtn.style.marginRight = "0.5em";

  // Shared send code handler
  const sendCodeHandler = async (e) => {
    e.preventDefault();
    errorDiv.textContent = "";
    loginBtn.disabled = signupBtn.disabled = true;
    loginBtn.textContent = signupBtn.textContent = "Sending...";
    try {
      if (!recaptchaReady) {
        await firebaseAuth.setupRecaptcha("recaptchaContainer");
        recaptchaReady = true;
      }
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
      recaptchaReady = false;
    } finally {
      loginBtn.disabled = signupBtn.disabled = false;
      loginBtn.textContent = loginLabel || "Login";
      signupBtn.textContent = signupLabel || "Sign Up";
    }
  };
  loginBtn.onclick = sendCodeHandler;
  signupBtn.onclick = sendCodeHandler;

  buttonRow.appendChild(loginBtn);
  if (!hideSignup) buttonRow.appendChild(signupBtn);
  phoneStep.appendChild(buttonRow);

  // Add 'Forgot your phone?' link below the buttons
  const forgotPhoneLink = document.createElement("a");
  forgotPhoneLink.id = "forgotPhoneLink";
  forgotPhoneLink.href = "#";
  forgotPhoneLink.textContent = "Forgot your phone number?";
  forgotPhoneLink.style.display = "block";
  forgotPhoneLink.style.textAlign = "center";
  forgotPhoneLink.style.marginTop = "0.75em";
  forgotPhoneLink.style.fontSize = "10px";
  forgotPhoneLink.style.fontWeight = "600";
  forgotPhoneLink.style.color = "#003399";
  forgotPhoneLink.style.textDecoration = "none";
  forgotPhoneLink.style.cursor = "pointer";
  forgotPhoneLink.addEventListener("click", (e) => {
    e.preventDefault();
    runForgotPhoneDialogChain();
  });
  // Only show the link if the flow hasn't been completed yet
  const forgotFlowDone = (() => {
    try {
      return hasCookie("brispace_forgot_phone_seen");
    } catch (_) {
      return hasCookie("brispace_forgot_phone_seen");
    }
  })();
  if (forgotFlowDone) forgotPhoneLink.style.display = "none";
  phoneStep.appendChild(forgotPhoneLink);

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
  const verifyButtonRow = document.createElement("div");
  verifyButtonRow.style.display = "flex";
  verifyButtonRow.style.alignItems = "center";
  verifyButtonRow.style.justifyContent = "center";
  verifyButtonRow.style.gap = "0.5em";
  const verifyBtn = document.createElement("button");
  verifyBtn.classList.add("login-primary-btn");
  verifyBtn.textContent = "Verify Code";
  verifyButtonRow.appendChild(verifyBtn);
  const backBtn = document.createElement("button");
  backBtn.classList.add("login-secondary-btn");
  backBtn.textContent = "Back";
  backBtn.type = "button";
  verifyButtonRow.appendChild(backBtn);
  otpStep.appendChild(verifyButtonRow);
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
      loginBtn.click();
    }
  });

  // Back button resets to phone step
  backBtn.onclick = (e) => {
    e.preventDefault();
    phoneStep.style.display = "block";
    otpStep.style.display = "none";
    otpInput.value = "";
    errorDiv.textContent = "";
    loginBtn.disabled = signupBtn.disabled = false;
    loginBtn.textContent = "Login";
    signupBtn.textContent = "Sign Up";
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

      if (postLoginRedirect) {
        window.location.href = postLoginRedirect;
        return;
      }

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
