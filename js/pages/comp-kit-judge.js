// Judging page: list of dish cards + focused one-at-a-time scorer (#entry-<id>).
// Categories, weights, and rubric levels all come from the payload.
import {
  readKitData,
  refreshKitData,
  apiJson,
  KitModal,
  escapeHtml,
  allergenChips,
  ingredientList,
} from "../components/comp-kit/kit-utils.js";
import { mountPhoneSignIn } from "../components/comp-kit/phone-sign-in.js";
import { scoreInputHtml, updateLevelText } from "../components/comp-kit/score-input.js";

const MISSING_LABELS = {
  title: "name",
  description: "description",
  allergens: "allergens",
  ingredients: "ingredients",
};

export class JudgePage {
  constructor() {
    this.data = readKitData();
    this.view = document.getElementById("judgeView");
    this.banner = document.getElementById("judgeBanner");
    this.status = document.getElementById("judgeStatus");
    this.handlers = {
      hashchange: () => this.renderView(),
      click: (e) => this.handleClick(e),
      change: (e) => this.handleChange(e),
      submit: (e) => this.handleSubmit(e),
    };
  }

  init() {
    window.addEventListener("hashchange", this.handlers.hashchange);
    [this.view, this.banner].forEach((el) => el.addEventListener("click", this.handlers.click));
    this.view.addEventListener("change", this.handlers.change);
    this.view.addEventListener("submit", this.handlers.submit);
    this.render();
  }

  cleanup() {
    window.removeEventListener("hashchange", this.handlers.hashchange);
    [this.view, this.banner].forEach((el) => el.removeEventListener("click", this.handlers.click));
    this.view.removeEventListener("change", this.handlers.change);
    this.view.removeEventListener("submit", this.handlers.submit);
  }

  // ── State helpers ──
  get isActive() {
    const r = this.data.registration;
    return !!(r && r.status === "active");
  }

  get canJudge() {
    return this.data.state === "judging" && this.data.competition.voting_open && this.isActive;
  }

  get judgeable() {
    return this.data.entries.filter((e) => !e.is_own);
  }

  get maxTotal() {
    return this.data.categories.reduce((sum, c) => sum + 5 * c.weight, 0);
  }

  isScored(entryId) {
    const j = this.data.myJudgments[entryId];
    return !!j && this.data.categories.every((c) => j.scores?.[c.key] >= 1);
  }

  total(scores) {
    return this.data.categories.reduce((sum, c) => sum + (scores?.[c.key] || 0) * c.weight, 0);
  }

  focusedId() {
    const m = location.hash.match(/^#entry-([0-9a-f-]{36})$/i);
    return m && this.data.entries.some((e) => e.id === m[1]) ? m[1] : null;
  }

  async reload() {
    this.data = await refreshKitData(this.data.competition.slug);
    this.render();
  }

  // ── Rendering ──
  render() {
    this.renderBanner();
    this.renderStatus();
    this.renderView();
  }

  renderBanner() {
    const { state, signedIn, myEntry } = this.data;
    let html = "";
    if (state === "hidden") {
      html = `<p>Judging opens on competition day. Entries stay secret until then.</p>
        ${myEntry || (this.data.registration?.role === "entrant" && this.isActive) ? `<a class="kit-btn" href="enter">Work on my entry</a>` : ""}`;
    } else if (!signedIn) {
      html = `<p>Sign in to see the entries${state === "judging" ? " and score them" : ""}.</p>
        <button type="button" class="kit-btn" data-act="sign-in">Sign in</button>`;
    } else if (state === "judging" && !this.isActive) {
      html = `<p>You need to be signed up to judge.</p>
        <button type="button" class="kit-btn" data-act="register-judge">Sign me up as a judge</button>`;
    } else if (state === "public") {
      html = `<p>Judging is closed.</p><a class="kit-btn" href="results">See the results</a>`;
    }
    this.banner.innerHTML = html
      ? `<div class="kit-card kit-banner">${html}<p class="kit-error" data-error></p></div>`
      : "";
  }

  renderStatus() {
    if (!this.canJudge) {
      this.status.textContent = "";
      return;
    }
    const done = this.judgeable.filter((e) => this.isScored(e.id)).length;
    const fav = this.data.myFavoriteEntryId ? "★ Favorite picked" : "☆ No favorite yet";
    this.status.textContent = `Scored ${done} of ${this.judgeable.length}${this.favoritesOn ? ` · ${fav}` : ""}`;
  }

  // favorite_bonus = 0 turns favorites off for a competition
  get favoritesOn() {
    return this.data.competition.favorite_bonus > 0;
  }

  renderView() {
    const id = this.focusedId();
    if (id) this.renderFocus(id);
    else this.renderList();
  }

  renderList() {
    const { entries } = this.data;
    if (!entries.length) {
      this.view.innerHTML =
        this.data.state === "hidden" || !this.data.signedIn
          ? ""
          : `<p class="kit-empty">No entries yet.</p>`;
      return;
    }
    this.view.innerHTML = `<ol class="kit-entries">${entries.map((e, i) => this.cardHtml(e, i)).join("")}</ol>`;
  }

  cardHtml(entry, index) {
    const scored = this.isScored(entry.id);
    const judgment = this.data.myJudgments[entry.id];
    const fav = this.favoritesOn && this.data.myFavoriteEntryId === entry.id;
    const stateText = entry.is_own
      ? "Your entry"
      : scored
        ? `Scored ${this.total(judgment.scores)}`
        : this.canJudge
          ? "Not scored"
          : "";
    const classes = ["kit-entry", entry.is_own && "is-own", scored && "is-scored"]
      .filter(Boolean)
      .join(" ");
    return `
      <li>
        <a class="${classes}" href="#entry-${entry.id}">
          <span class="kit-entry__num">${index + 1}</span>
          <span class="kit-entry__main">
            <span class="kit-entry__title">${escapeHtml(entry.title)}${fav ? ' <span class="kit-fav-mark" aria-label="Your favorite">★</span>' : ""}</span>
            <span class="kit-entry__by">by ${escapeHtml(entry.author)}</span>
            ${allergenChips(entry, this.data.allergens)}
            ${entry.missing.length ? `<span class="kit-flag">Details missing</span>` : ""}
          </span>
          ${stateText ? `<span class="kit-entry__state">${stateText}</span>` : ""}
        </a>
      </li>`;
  }

  renderFocus(id) {
    const entries = this.data.entries;
    const index = entries.findIndex((e) => e.id === id);
    const entry = entries[index];
    const prev = entries[index - 1];
    const next = entries[index + 1];
    const missing = entry.missing.map((k) => MISSING_LABELS[k] || k);

    this.view.innerHTML = `
      <div class="kit-focus">
        <nav class="kit-focus__nav" aria-label="Entries">
          <a href="#" data-act="list">&larr; All entries</a>
          <span>${index + 1} of ${entries.length}</span>
          <span class="kit-focus__step">
            ${prev ? `<a href="#entry-${prev.id}" aria-label="Previous entry">&lsaquo; Prev</a>` : ""}
            ${next ? `<a href="#entry-${next.id}" aria-label="Next entry">Next &rsaquo;</a>` : ""}
          </span>
        </nav>
        <article class="kit-card kit-dish">
          <h2 class="kit-dish__title"><span class="kit-entry__num">${index + 1}</span> ${escapeHtml(entry.title)}</h2>
          <p class="kit-dish__by">by ${escapeHtml(entry.author)}</p>
          ${entry.description ? `<p class="kit-dish__desc">${escapeHtml(entry.description)}</p>` : ""}
          ${allergenChips(entry, this.data.allergens)}
          ${missing.length ? `<p class="kit-flag">Still missing: ${missing.join(", ")}</p>` : ""}
          ${
            entry.ingredient_groups.length
              ? `<details class="kit-dish__ingredients"><summary>Ingredients</summary>${ingredientList(entry.ingredient_groups)}</details>`
              : ""
          }
        </article>
        ${this.scorerHtml(entry, next)}
      </div>`;
    window.scrollTo({ top: 0 });
  }

  scorerHtml(entry, next) {
    if (entry.is_own)
      return `<p class="kit-card kit-empty">This is your entry. You can't score it.</p>`;
    if (!this.canJudge) return "";
    const judgment = this.data.myJudgments[entry.id];
    const fav = this.data.myFavoriteEntryId === entry.id;
    return `
      <form class="kit-card kit-scorer" data-judge-form="${entry.id}">
        ${this.data.categories.map((c) => scoreInputHtml(c, judgment?.scores?.[c.key])).join("")}
        <p class="kit-total" data-total>Total ${this.total(judgment?.scores)} / ${this.maxTotal}</p>
        <label class="kit-field">
          <span class="kit-label">Notes (only you see these)</span>
          <textarea class="kit-input" name="notes" rows="2" maxlength="2000">${escapeHtml(judgment?.notes || "")}</textarea>
        </label>
        <div class="kit-scorer__actions">
          ${
            this.favoritesOn
              ? `<button type="button" class="kit-btn kit-btn--plain kit-fav-btn${fav ? " is-favorite" : ""}" data-act="favorite" data-entry="${entry.id}" aria-pressed="${fav}">
            ${fav ? "★ My favorite" : "☆ Make this my favorite"}
          </button>`
              : ""
          }
          <button type="submit" class="kit-btn">${this.isScored(entry.id) ? "Update scores" : "Save scores"}</button>
        </div>
        <p class="kit-scorer__saved" data-saved role="status"></p>
        ${next ? `<a class="kit-btn kit-btn--plain kit-next" href="#entry-${next.id}" hidden data-next>Next entry &rsaquo;</a>` : ""}
      </form>`;
  }

  // ── Events ──
  handleChange(e) {
    const form = e.target.closest("[data-judge-form]");
    if (!form || e.target.type !== "radio") return;
    const scores = this.readScores(form);
    const category = this.data.categories.find((c) => c.key === e.target.name);
    if (category) updateLevelText(form, category);
    form.querySelector("[data-total]").textContent =
      `Total ${this.total(scores)} / ${this.maxTotal}`;
  }

  readScores(form) {
    const scores = {};
    this.data.categories.forEach((c) => {
      const picked = form.querySelector(`input[name="${CSS.escape(c.key)}"]:checked`);
      if (picked) scores[c.key] = Number(picked.value);
    });
    return scores;
  }

  async handleSubmit(e) {
    const form = e.target.closest("[data-judge-form]");
    if (!form) return;
    e.preventDefault();
    const entryId = form.dataset.judgeForm;
    const scores = this.readScores(form);
    const saved = form.querySelector("[data-saved]");
    const unscored = this.data.categories.find((c) => !scores[c.key]);
    if (unscored) {
      saved.textContent = `Pick a score for ${unscored.label}.`;
      return;
    }
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    saved.textContent = "Saving...";
    try {
      const notes = form.elements.notes.value;
      await apiJson(`/api/competitions/${this.data.competition.id}/entries/${entryId}/judgment`, {
        method: "POST",
        body: { scores, notes },
      });
      this.data.myJudgments[entryId] = { scores, notes };
      btn.textContent = "Update scores";
      saved.textContent = `Saved. Total ${this.total(scores)}.`;
      const nextLink = form.querySelector("[data-next]");
      if (nextLink) nextLink.hidden = false;
      this.renderStatus();
    } catch (err) {
      saved.textContent = err.message;
    } finally {
      btn.disabled = false;
    }
  }

  async handleClick(e) {
    const btn = e.target.closest("[data-act]");
    if (!btn) return;
    const act = btn.dataset.act;
    if (act === "list") {
      e.preventDefault();
      history.pushState(null, "", location.pathname + location.search);
      this.renderView();
      return;
    }
    if (act === "sign-in") {
      const modal = new KitModal("Sign in");
      mountPhoneSignIn(modal.open(), {
        onSignedIn: async () => {
          modal.close();
          await this.reload();
        },
      });
      return;
    }
    const showError = (msg) => {
      const el =
        this.banner.querySelector("[data-error]") ||
        btn.closest("form")?.querySelector("[data-saved]");
      if (el) el.textContent = msg;
    };
    btn.disabled = true;
    try {
      if (act === "register-judge") {
        await apiJson(`/api/competitions/${this.data.competition.id}/register`, {
          method: "POST",
          body: { role: "judge" },
        });
        await this.reload();
        return;
      }
      if (act === "favorite") {
        const entryId = btn.dataset.entry;
        const removing = this.data.myFavoriteEntryId === entryId;
        await apiJson(`/api/competitions/${this.data.competition.id}/favorite`, {
          method: removing ? "DELETE" : "POST",
          body: removing ? undefined : { entryId },
        });
        this.data.myFavoriteEntryId = removing ? null : entryId;
        btn.classList.toggle("is-favorite", !removing);
        btn.setAttribute("aria-pressed", String(!removing));
        btn.textContent = removing ? "☆ Make this my favorite" : "★ My favorite";
        this.renderStatus();
      }
    } catch (err) {
      showError(err.message);
    } finally {
      btn.disabled = false;
    }
  }
}
