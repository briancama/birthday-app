// Phone OTP sign-in steps (Firebase → POST /auth/login → signed cookie).
// Shared by the On a Stick registration modal and Competition Kit pages.
import { firebaseAuth } from "../../services/firebase-auth.js";

const DEFAULT_COPY = {
  phoneTitle: "Sign In",
  phoneNote: "Confirm your phone number. No account setup, no passwords.",
  codeTitle: "Check Your Texts",
  codeNote: "Enter the 6-digit code we sent you.",
};

let firebaseReady = null;

export function mountPhoneSignIn(
  container,
  { buttonClass = "kit-btn", copy = {}, onSignedIn } = {}
) {
  const text = { ...DEFAULT_COPY, ...copy };
  const recaptchaId = `recaptcha-${Math.random().toString(36).slice(2, 8)}`;

  const showError = (message) => {
    const el = container.querySelector("[data-reg-error]");
    if (el) el.textContent = message || "Something went wrong.";
  };

  const stepPhone = () => {
    container.innerHTML = `
      <h3>${text.phoneTitle}</h3>
      <p class="reg-note">${text.phoneNote}</p>
      <form class="reg-form" data-phone-form>
        <input type="tel" name="phone" placeholder="Phone number" autocomplete="tel" required />
        <button type="submit" class="${buttonClass}">SEND CODE</button>
      </form>
      <div id="${recaptchaId}"></div>
      <p class="reg-error" data-reg-error></p>`;
    container.querySelector("[data-phone-form]").addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = e.target.querySelector("button");
      btn.disabled = true;
      btn.textContent = "SENDING...";
      try {
        firebaseReady = firebaseReady || firebaseAuth.init();
        await firebaseReady;
        await firebaseAuth.setupRecaptcha(recaptchaId);
        await firebaseAuth.sendOTP(e.target.elements.phone.value);
        stepCode();
      } catch (err) {
        btn.disabled = false;
        btn.textContent = "SEND CODE";
        showError(err.message);
      }
    });
  };

  const stepCode = () => {
    container.innerHTML = `
      <h3>${text.codeTitle}</h3>
      <p class="reg-note">${text.codeNote}</p>
      <form class="reg-form" data-code-form>
        <input type="text" name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="123456" required />
        <button type="submit" class="${buttonClass}">VERIFY</button>
      </form>
      <button class="reg-linklike" type="button" data-back>Wrong number? Go back</button>
      <p class="reg-error" data-reg-error></p>`;
    container.querySelector("[data-back]").addEventListener("click", stepPhone);
    container.querySelector("[data-code-form]").addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = e.target.querySelector("button[type=submit]");
      btn.disabled = true;
      btn.textContent = "VERIFYING...";
      try {
        const credential = await firebaseAuth.verifyOTP(e.target.elements.code.value.trim());
        const idToken = await credential.user.getIdToken();
        const login = await fetch("/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ idToken }),
        });
        if (!login.ok) throw new Error("Sign-in failed. Please try again.");
        await onSignedIn?.();
      } catch (err) {
        btn.disabled = false;
        btn.textContent = "VERIFY";
        showError(err.message || "Invalid code. Try again.");
      }
    });
  };

  stepPhone();
}
