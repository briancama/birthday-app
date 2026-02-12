// js/login.js
// Handles login form logic for index.html (Firebase phone auth + Supabase user creation)

import { appState } from "./app.js";
import { firebaseAuth } from "./services/firebase-auth.js";
import { formatPhoneInput, toE164Format, isValidUSPhone } from "./utils/phone-format.js";

const form = document.getElementById("loginForm");
const phoneInput = document.getElementById("phoneInput");
const otpInput = document.getElementById("otpInput");
const phoneStep = document.getElementById("phoneStep");
const otpStep = document.getElementById("otpStep");
const sendOTPBtn = document.getElementById("sendOTPBtn");
const verifyOTPBtn = document.getElementById("verifyOTPBtn");
const backBtn = document.getElementById("backBtn");
const errorDiv = document.getElementById("error");
const recaptchaContainer = document.getElementById("recaptchaContainer");

let phoneNumber = null;
let recaptchaReady = false;

// Format phone number as user types: (XXX) XXX-XXXX
phoneInput.addEventListener("input", (e) => {
  e.target.value = formatPhoneInput(e.target.value);
});

// Initialize Firebase
await firebaseAuth.init();
console.log("Firebase initialized, waiting for first interaction...");

// Send OTP
sendOTPBtn.addEventListener("click", async (e) => {
  e.preventDefault();
  errorDiv.textContent = "";

  // Setup reCAPTCHA on first click if not already done
  if (!recaptchaReady) {
    try {
      sendOTPBtn.disabled = true;
      sendOTPBtn.textContent = "Setting up...";
      await firebaseAuth.setupRecaptcha("recaptchaContainer");
      recaptchaReady = true;
      sendOTPBtn.disabled = false;
      sendOTPBtn.textContent = ">>> SEND CODE <<<";
    } catch (err) {
      errorDiv.textContent = "Setup failed: " + err.message;
      sendOTPBtn.disabled = false;
      sendOTPBtn.textContent = ">>> SEND CODE <<<";
      return;
    }
  }

  phoneNumber = phoneInput.value.trim();
  if (!phoneNumber) {
    errorDiv.textContent = "Please enter a phone number";
    return;
  }

  // Validate and convert to E.164 format
  try {
    phoneNumber = toE164Format(phoneNumber);
  } catch (err) {
    errorDiv.textContent = err.message;
    return;
  }

  sendOTPBtn.disabled = true;
  sendOTPBtn.textContent = "Sending...";

  try {
    await firebaseAuth.sendOTP(phoneNumber);
    // Switch to OTP step
    phoneStep.style.display = "none";
    phoneInput.required = false;
    otpStep.style.display = "block";
    otpInput.focus();
  } catch (err) {
    console.error("Send OTP error:", err);
    errorDiv.textContent = err.message || "Failed to send code. Try again.";
    sendOTPBtn.disabled = false;
    sendOTPBtn.textContent = ">>> SEND CODE <<<";
  }
});

// Back button
backBtn.addEventListener("click", (e) => {
  e.preventDefault();
  phoneStep.style.display = "block";
  otpStep.style.display = "none";
  phoneInput.required = true;
  errorDiv.textContent = "";
  otpInput.value = "";
  sendOTPBtn.disabled = false;
  sendOTPBtn.textContent = ">>> SEND CODE <<<";
});

// Verify OTP
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  errorDiv.textContent = "";

  const code = otpInput.value.trim();
  if (!code || code.length !== 6) {
    errorDiv.textContent = "Please enter a valid 6-digit code";
    return;
  }

  verifyOTPBtn.disabled = true;
  verifyOTPBtn.textContent = "Verifying...";

  try {
    // Actually verify the OTP with Firebase
    const userCredential = await firebaseAuth.verifyOTP(code);

    if (!userCredential?.user?.uid) {
      throw new Error("Firebase verification failed");
    }

    const firebaseUid = userCredential.user.uid;
    const supabase = appState.getSupabase();

    // Look for existing user by phone number
    const { data: existingUser, error: selectErr } = await supabase
      .from("users")
      .select("*")
      .eq("phone_number", phoneNumber)
      .maybeSingle();

    if (selectErr) throw selectErr;

    let user = existingUser;

    if (existingUser) {
      // Update firebase_uid on existing user
      const { error: updateErr } = await supabase
        .from("users")
        .update({ firebase_uid: firebaseUid })
        .eq("id", existingUser.id);

      if (updateErr) throw updateErr;
      user = { ...existingUser, firebase_uid: firebaseUid };
    } else {
      // Create new user
      const { data: newUser, error: insertErr } = await supabase
        .from("users")
        .insert([
          {
            firebase_uid: firebaseUid,
            phone_number: phoneNumber,
            display_name: phoneNumber,
            username: phoneNumber, // Use phone as fallback username
          },
        ])
        .select()
        .single();

      if (insertErr) throw insertErr;
      user = newUser;
    }

    // Store firebase_uid in localStorage
    localStorage.setItem("firebase_uid", firebaseUid);
    localStorage.setItem("phone_number", phoneNumber);

    const idToken = await firebaseAuth.getIdToken();
    console.log("ID Token obtained:", idToken);

    // Redirect to dashboard
    window.location.href = "dashboard";
  } catch (err) {
    console.error("Verify OTP error:", err);
    errorDiv.textContent = err.message || "Verification failed. Try again.";
    verifyOTPBtn.disabled = false;
    verifyOTPBtn.textContent = ">>> VERIFY CODE <<<";
  }
});

// Check if already signed in
if (localStorage.getItem("firebase_uid")) {
  window.location.href = "dashboard";
}
