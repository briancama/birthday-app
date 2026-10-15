// My Entry page: sign in → (register as entrant) → recipe editor.
import {
  readKitData,
  refreshKitData,
  apiJson,
  KitModal,
  escapeHtml,
} from "../components/comp-kit/kit-utils.js";
import { mountPhoneSignIn } from "../components/comp-kit/phone-sign-in.js";
import { RecipeEditor } from "../components/comp-kit/recipe-editor.js";

export class EnterPage {
  constructor() {
    this.data = readKitData();
    this.root = document.getElementById("enterRoot");
    this.landing = this.root.dataset.landing || null;
    this.editor = null;
    this.onClick = (e) => this.handleClick(e);
  }

  init() {
    this.root.addEventListener("click", this.onClick);
    this.render();
  }

  cleanup() {
    this.root.removeEventListener("click", this.onClick);
    this.editor?.destroy();
  }

  get isEntrant() {
    const r = this.data.registration;
    return !!(r && r.status === "active" && r.role === "entrant");
  }

  async reload() {
    this.data = await refreshKitData(this.data.competition.slug);
    this.render();
  }

  render() {
    this.editor?.destroy();
    this.editor = null;
    const { signedIn, myEntry, competition, registration } = this.data;

    if (!signedIn) {
      this.root.innerHTML = `
        <div class="kit-card kit-gate">
          <p>Sign in with your phone to write up your entry.</p>
          <button type="button" class="kit-btn" data-act="sign-in">Sign in</button>
        </div>`;
      return;
    }

    if (!myEntry && !this.isEntrant) {
      if (competition.voting_closed_at) {
        this.root.innerHTML = `<p class="kit-empty">Entries are closed.</p>`;
        return;
      }
      const withdrawn = registration && registration.status === "withdrawn";
      this.root.innerHTML = `
        <div class="kit-card kit-gate">
          <p>${
            registration && !withdrawn
              ? "You're signed up as a judge. Switch to competing to write up an entry."
              : "You're not signed up to compete yet."
          }</p>
          ${
            this.landing
              ? `<a class="kit-btn" href="${escapeHtml(this.landing)}">Sign up on the event page</a>`
              : `<button type="button" class="kit-btn" data-act="register">I'm competing</button>`
          }
          <p class="kit-error" data-error></p>
        </div>`;
      return;
    }

    this.root.innerHTML = `
      <p class="kit-entry-links" data-entry-links></p>
      <div data-editor></div>`;
    this.editor = new RecipeEditor(this.root.querySelector("[data-editor]"), {
      competitionId: competition.id,
      entry: myEntry,
      allergens: this.data.allergens,
      defaultTitle: registration && registration.dish_working_title,
    });
    this.editor.addEventListener("saved", (e) => {
      this.data.myEntry = e.detail.entry;
      this.renderLinks();
    });
    this.editor.mount();
    this.renderLinks();
  }

  renderLinks() {
    const el = this.root.querySelector("[data-entry-links]");
    const entry = this.data.myEntry;
    if (!el) return;
    el.innerHTML = entry
      ? `<a href="/competitions/${encodeURIComponent(this.data.competition.slug)}/recipes/${encodeURIComponent(entry.recipe_slug)}">See your recipe page &rarr;</a>`
      : "";
    if (entry && this.data.registration && this.data.registration.status === "withdrawn") {
      el.insertAdjacentHTML(
        "afterbegin",
        `<span class="kit-notice">You withdrew, so judges won't see this entry. </span>`
      );
    }
  }

  async handleClick(e) {
    const btn = e.target.closest("[data-act]");
    if (!btn) return;
    if (btn.dataset.act === "sign-in") {
      const modal = new KitModal("Sign in");
      mountPhoneSignIn(modal.open(), {
        onSignedIn: async () => {
          modal.close();
          await this.reload();
        },
      });
    } else if (btn.dataset.act === "register") {
      btn.disabled = true;
      try {
        await apiJson(`/api/competitions/${this.data.competition.id}/register`, {
          method: "POST",
          body: { role: "entrant" },
        });
        await this.reload();
      } catch (err) {
        btn.disabled = false;
        const el = this.root.querySelector("[data-error]");
        if (el) el.textContent = err.message;
      }
    }
  }
}
