// Registration modal for the On a Stick landing page.
// The page stays static: two [data-stick-cta] buttons open this modal and a
// [data-stick-status] line hydrates quietly. All reads/writes happen in here.
// Auth: Firebase phone OTP → POST /auth/login → signed cookie.
import { mountPhoneSignIn } from "../components/comp-kit/phone-sign-in.js";

const SLUG = "on-a-stick";
const PLACEHOLDER_USERNAME = /^visitor_[a-z0-9]+$/i;

// Geometric loader: square/circle/triangle sliding along a toothpick.
// Timing knobs live in CSS (--loader-*).
const LOADER_HTML = `
  <div class="stick-loader" role="status" aria-label="Loading">
    <svg viewBox="0 0 120 40" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <line x1="6" y1="20" x2="114" y2="20" class="loader-pick" />
      <rect class="loader-shape loader-shape--square" x="-7" y="13" width="14" height="14" />
      <circle class="loader-shape loader-shape--circle" cx="0" cy="20" r="8" />
      <path class="loader-shape loader-shape--triangle" d="M0 11 L9 27 L-9 27 Z" />
    </svg>
  </div>`;

class StickRegistrationModal {
  constructor() {
    this.root = document.getElementById("stickModalRoot");
    this.me = null; // /auth/me user row or null
    this.competition = null;
    this.registration = null;
    this.loaded = false;
  }

  init() {
    document.querySelectorAll("[data-stick-cta]").forEach((btn) => {
      btn.addEventListener("click", () => this.open());
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && this.isOpen()) this.close();
    });
    // Quiet background hydration — only button labels/status text change.
    const slot = document.querySelector("[data-stick-slot]");
    slot?.insertAdjacentHTML("afterbegin", LOADER_HTML);
    this.refreshState().then(() => {
      this.updatePage();
      slot?.querySelector(".stick-loader")?.remove();
      slot?.classList.remove("is-loading");
    });
  }

  async refreshState() {
    try {
      const meRes = await fetch("/auth/me");
      this.me = meRes.ok ? (await meRes.json()).user : null;
      const compRes = await fetch(`/api/competitions/${SLUG}`);
      if (!compRes.ok) throw new Error("Competition unavailable");
      const payload = await compRes.json();
      this.competition = payload.competition;
      this.registration = payload.registration;
      this.loaded = true;
    } catch (err) {
      console.warn("On a Stick registration state unavailable:", err);
      this.loaded = false;
    }
  }

  get isRegistered() {
    return !!(this.registration && this.registration.status === "active");
  }

  get isPlaceholderAccount() {
    return !!(this.me && PLACEHOLDER_USERNAME.test(this.me.username || ""));
  }

  // ── Page-level state (labels only, no layout change) ──
  updatePage() {
    const status = document.querySelector("[data-stick-status]");
    const role = document.querySelector("[data-stick-role]");
    const ctas = document.querySelectorAll("[data-stick-cta]");
    if (!this.loaded) return;
    if (role) role.hidden = !this.isRegistered;
    if (this.isRegistered) {
      if (status) status.textContent = "You're going";
      const isEntrant = this.registration.role === "entrant";
      const label = role?.querySelector("[data-stick-role-label]");
      if (label) label.textContent = isEntrant ? "Entrant" : "Judge";
      // Entrants have more than RSVP in the modal (their recipe), so keep the label generic
      ctas.forEach((b) => (b.textContent = isEntrant ? "MY REGISTRATION" : "CHANGE MY RSVP"));
    } else if (this.registration && this.registration.status === "withdrawn") {
      if (status) status.textContent = "You can't make it. Changed your mind?";
      ctas.forEach((b) => (b.textContent = "I CAN MAKE IT AFTER ALL"));
    }
  }

  // ── Modal shell ──
  isOpen() {
    return !!this.root.querySelector(".stick-modal-backdrop");
  }

  open() {
    if (this.isOpen()) return;
    this.root.innerHTML = `
      <div class="stick-modal-backdrop">
        <div class="stick-modal" role="dialog" aria-modal="true" aria-label="On a Stick registration">
          <button class="stick-modal-close" type="button" aria-label="Close">&times;</button>
          <div class="stick-modal-step"></div>
        </div>
      </div>`;
    document.body.classList.add("stick-modal-open");
    this.root.querySelector(".stick-modal-backdrop").addEventListener("click", (e) => {
      if (e.target === e.currentTarget) this.close();
    });
    this.root.querySelector(".stick-modal-close").addEventListener("click", () => this.close());
    this.route();
  }

  close() {
    this.root.innerHTML = "";
    document.body.classList.remove("stick-modal-open");
    this.updatePage();
  }

  setStep(html) {
    const step = this.root.querySelector(".stick-modal-step");
    if (step) step.innerHTML = html;
    return step;
  }

  showLoader() {
    this.setStep(LOADER_HTML);
  }

  showError(message) {
    const el = this.root.querySelector("[data-reg-error]");
    if (el) el.textContent = message || "Something went wrong.";
  }

  // Pick the right step from current state.
  async route({ refresh = false } = {}) {
    if (!this.isOpen()) return;
    if (refresh || !this.loaded) {
      this.showLoader();
      await this.refreshState();
    }
    if (!this.loaded) {
      this.setStep(`<p class="reg-note">Registration is napping. Try again in a minute.</p>`);
      return;
    }
    if (!this.me) return this.stepPhone();
    if (this.isRegistered) return this.stepManage();
    return this.stepChoose();
  }

  // ── Steps: phone + OTP code ──
  stepPhone() {
    mountPhoneSignIn(this.setStep(""), {
      buttonClass: "btn-stick",
      copy: {
        phoneTitle: "Are You Coming?",
        phoneNote: "Confirm your phone number to get started. No account setup, no passwords.",
      },
      onSignedIn: () => this.route({ refresh: true }),
    });
  }

  // ── Step: name + role ──
  stepChoose() {
    const withdrew = this.registration && this.registration.status === "withdrawn";
    const needsName = this.isPlaceholderAccount;
    const step = this.setStep(`
      <h3>${withdrew ? "Change of Heart?" : "Pick Your Part"}</h3>
      <form class="reg-form reg-form--stacked" data-choose-form>
        ${
          needsName
            ? `<label class="reg-label">What should we call you?
                 <input type="text" name="name" maxlength="80" placeholder="Your name" required />
               </label>`
            : ""
        }
        <div class="reg-choices">
          <label class="reg-role">
            <input type="radio" name="role" value="entrant" required />
            <span><strong>I'm competing</strong><br />Bring something on a stick, enough for every judge</span>
          </label>
          <label class="reg-role">
            <input type="radio" name="role" value="judge" required />
            <span><strong>I'm just judging</strong><br />Show up hungry, score everything</span>
          </label>
        </div>
        <button type="submit" class="btn-stick">LOCK IT IN</button>
      </form>
      <p class="reg-error" data-reg-error></p>`);
    step.querySelector("[data-choose-form]").addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = e.target.querySelector("button[type=submit]");
      const role = e.target.elements.role.value;
      const name = needsName ? e.target.elements.name.value.trim() : undefined;
      if (needsName && !name) {
        this.showError("We need a name for the roster (and your recipe).");
        return;
      }
      btn.disabled = true;
      btn.textContent = "SAVING...";
      try {
        const res = await fetch(`/api/competitions/${this.competition.id}/register`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role, displayName: name }),
        });
        if (!res.ok) throw new Error((await res.json()).error || "Failed to register");
        await this.route({ refresh: true });
      } catch (err) {
        btn.disabled = false;
        btn.textContent = "LOCK IT IN";
        this.showError(err.message);
      }
    });
  }

  // ── Step: registered / manage ──
  stepManage() {
    const isEntrant = this.registration.role === "entrant";
    const otherRole = isEntrant ? "judge" : "entrant";
    const step = this.setStep(`
      <h3>See You There</h3>
      <p class="reg-confirmed">${isEntrant ? "COMPETITOR" : "JUDGE"}</p>
      <p class="reg-note">Sat Dec 5, 3:00 arrival &middot; Nick &amp; Lori's, Kent.</p>
      ${isEntrant ? `<a class="btn-stick" href="/competitions/${SLUG}/enter">MY ENTRY</a>` : ""}
      <div class="reg-manage">
        <button class="reg-linklike" type="button" data-switch-role>
          ${isEntrant ? "Switch to just judging" : "Actually, I'll compete"}
        </button>
        <button class="reg-linklike reg-linklike--danger" type="button" data-withdraw>
          Can't make it anymore? Withdraw
        </button>
      </div>
      <p class="reg-error" data-reg-error></p>`);
    step.querySelector("[data-switch-role]").addEventListener("click", async (e) => {
      e.target.disabled = true;
      try {
        const res = await fetch(`/api/competitions/${this.competition.id}/register`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role: otherRole }),
        });
        if (!res.ok) throw new Error((await res.json()).error || "Failed to switch");
        await this.route({ refresh: true });
      } catch (err) {
        e.target.disabled = false;
        this.showError(err.message);
      }
    });
    step.querySelector("[data-withdraw]").addEventListener("click", async (e) => {
      e.target.disabled = true;
      try {
        const res = await fetch(`/api/competitions/${this.competition.id}/withdraw`, {
          method: "POST",
        });
        if (!res.ok) throw new Error((await res.json()).error || "Failed to withdraw");
        await this.route({ refresh: true });
      } catch (err) {
        e.target.disabled = false;
        this.showError(err.message);
      }
    });
  }
}

if (document.getElementById("stickModalRoot")) {
  new StickRegistrationModal().init();
}
