import { BasePage } from "./base-page.js";

class RegisterPage extends BasePage {
  constructor() {
    super({ requiresAuth: false, siteAward: false });
  }

  // Override initUI to skip the site award
  initUI() {}

  async onReady() {
    // If not logged in, send back to login
    if (!this.userId) {
      window.location.href = "index.html";
      return;
    }

    // If user has already completed onboarding (has a display_name), skip this page
    if (this.currentUser?.display_name) {
      const dest =
        this.currentUser.user_type === "participant"
          ? "dashboard.html"
          : `/users/${this.currentUser.username}`;
      window.location.href = dest;
      return;
    }

    const form = document.getElementById("registerForm");
    const btn = document.getElementById("registerBtn");
    const errEl = document.getElementById("registerError");

    const showErr = (msg) => {
      errEl.textContent = msg;
      errEl.style.display = "block";
    };
    const hideErr = () => {
      errEl.style.display = "none";
    };

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      hideErr();

      const displayName = document.getElementById("displayNameInput").value.trim();
      if (!displayName) {
        showErr("Please enter a name.");
        return;
      }

      btn.disabled = true;
      btn.textContent = "Setting up...";

      try {
        const resp = await fetch(`/api/users/${this.userId}/register`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ display_name: displayName }),
        });

        const data = await resp.json().catch(() => ({}));

        if (!resp.ok) {
          showErr(data.error || "Something went wrong. Please try again.");
          btn.disabled = false;
          btn.textContent = ">>> LET'S GO <<<";
          return;
        }

        // Registration complete — land on their new profile
        window.location.href = `/users/${data.username}`;
      } catch (err) {
        console.error("Registration error:", err);
        showErr("Network error. Please try again.");
        btn.disabled = false;
        btn.textContent = ">>> LET'S GO <<<";
      }
    });
  }
}

const page = new RegisterPage();
window.addEventListener("DOMContentLoaded", () => page.init());
