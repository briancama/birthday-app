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
import {
  scoreMeterHtml,
  updateScoreMeter,
  setMeterStatus,
} from "../components/comp-kit/score-meter.js";

const MISSING_LABELS = {
  title: "name",
  description: "description",
  allergens: "allergens",
  ingredients: "ingredients",
};

const AUTOSAVE_MS = 900;
const ARROW_PATHS = { prev: "M15 5 L8 12 L15 19", next: "M9 5 L16 12 L9 19" };

export class JudgePage {
  constructor() {
    this.data = readKitData();
    this.view = document.getElementById("judgeView");
    this.banner = document.getElementById("judgeBanner");
    this.status = document.getElementById("judgeStatus");
    // Unsaved scores per entry, kept across entries and reloads until saved
    this.draftKey = `kit-judge-drafts:${this.data.competition.id}`;
    this.drafts = this.loadDrafts();
    this.autosave = null;
    this.handlers = {
      hashchange: () => {
        this.flushAutosave();
        this.renderView();
      },
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
    this.flushAutosave();
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

  isScored(entryId) {
    const j = this.data.myJudgments[entryId];
    return !!j && this.data.categories.every((c) => j.scores?.[c.key] >= 1);
  }

  isComplete(scores) {
    return this.data.categories.every((c) => scores?.[c.key] >= 1);
  }

  // What the scorer shows: an unsaved draft wins over the saved judgment
  current(entryId) {
    return this.drafts[entryId] || this.data.myJudgments[entryId] || null;
  }

  loadDrafts() {
    try {
      return JSON.parse(localStorage.getItem(this.draftKey)) || {};
    } catch {
      return {};
    }
  }

  persistDrafts() {
    try {
      if (Object.keys(this.drafts).length)
        localStorage.setItem(this.draftKey, JSON.stringify(this.drafts));
      else localStorage.removeItem(this.draftKey);
    } catch {
      // private mode / storage full: drafts still live in memory
    }
  }

  total(scores) {
    return this.data.categories.reduce((sum, c) => sum + (scores?.[c.key] || 0) * c.weight, 0);
  }

  focusedId() {
    const m = location.hash.match(/^#entry-([0-9a-f-]{36})$/i);
    return m && this.judgeable.some((e) => e.id === m[1]) ? m[1] : null;
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
    const ranks = this.ranks();
    this.view.innerHTML = `<ol class="kit-entries">${this.listOrder()
      .map((entry) => this.cardHtml(entry, ranks))
      .join("")}</ol>`;
  }

  // Highest score first, then not-yet-scored (submission order), your own entry last
  listOrder() {
    const rank = (entry) =>
      entry.is_own
        ? -2
        : this.isScored(entry.id)
          ? this.total(this.data.myJudgments[entry.id].scores)
          : -1;
    return this.data.entries
      .map((entry, i) => ({ entry, i, rank: rank(entry) }))
      .sort((a, b) => b.rank - a.rank || a.i - b.i)
      .map(({ entry }) => entry);
  }

  // Judge's own ranking of the entries they've scored; ties share a place
  ranks() {
    const totals = this.judgeable
      .filter((e) => this.isScored(e.id))
      .map((e) => [e.id, this.total(this.data.myJudgments[e.id].scores)]);
    return new Map(
      totals.map(([id, t]) => [id, 1 + totals.filter(([, other]) => other > t).length])
    );
  }

  // Star = your entry, number = your rank, empty circle = not scored yet
  badgeHtml(entry, ranks) {
    if (entry.is_own)
      return `<span class="kit-entry__num kit-entry__num--own" title="Your entry"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5 L14.9 8.6 L21.5 9.4 L16.6 14 L17.9 20.6 L12 17.3 L6.1 20.6 L7.4 14 L2.5 9.4 L9.1 8.6 Z" /></svg></span>`;
    const rank = ranks.get(entry.id);
    return rank
      ? `<span class="kit-entry__num"><span class="kit-sr">Your rank </span>${rank}</span>`
      : `<span class="kit-entry__num kit-entry__num--open" aria-hidden="true"></span>`;
  }

  cardHtml(entry, ranks) {
    const scored = this.isScored(entry.id);
    const judgment = this.data.myJudgments[entry.id];
    const fav = this.favoritesOn && this.data.myFavoriteEntryId === entry.id;
    const stateText = entry.is_own
      ? "Your entry"
      : this.drafts[entry.id]
        ? "Not saved"
        : scored
          ? `Scored ${this.total(judgment.scores)}`
          : this.canJudge
            ? "Not scored"
            : "";
    const classes = ["kit-entry", entry.is_own && "is-own", scored && "is-scored"]
      .filter(Boolean)
      .join(" ");
    // Your own entry is listed but never opened in the scorer
    const tag = entry.is_own ? "div" : "a";
    const href = entry.is_own ? "" : ` href="#entry-${entry.id}"`;
    return `
      <li>
        <${tag} class="${classes}"${href}>
          ${this.badgeHtml(entry, ranks)}
          <span class="kit-entry__main">
            <span class="kit-entry__title">${escapeHtml(entry.title)}${fav ? ' <span class="kit-fav-mark" aria-label="Your favorite">★</span>' : ""}</span>
            <span class="kit-entry__by">by ${escapeHtml(entry.author)}</span>
            ${allergenChips(entry, this.data.allergens)}
            ${entry.missing.length ? `<span class="kit-flag">Details missing</span>` : ""}
          </span>
          ${stateText ? `<span class="kit-entry__state">${stateText}</span>` : ""}
        </${tag}>
      </li>`;
  }

  renderFocus(id) {
    const entries = this.judgeable;
    const index = entries.findIndex((e) => e.id === id);
    const entry = entries[index];
    const prev = entries[index - 1];
    const next = entries[index + 1];
    const missing = entry.missing.map((k) => MISSING_LABELS[k] || k);
    const step = (target, dir, label) => {
      const icon = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${ARROW_PATHS[dir]}" /></svg>`;
      return target
        ? `<a class="kit-icon-btn kit-focus__arrow" href="#entry-${target.id}" aria-label="${label}">${icon}</a>`
        : `<span class="kit-icon-btn kit-focus__arrow" aria-disabled="true">${icon}</span>`;
    };

    this.view.innerHTML = `
      <div class="kit-focus">
        <nav class="kit-focus__nav" aria-label="Entries">
          <a class="kit-btn kit-btn--plain kit-focus__all" href="#" data-act="list">All entries</a>
          <span class="kit-focus__step">
            ${step(prev, "prev", "Previous entry")}
            <span class="kit-focus__count">${index + 1} of ${entries.length}</span>
            ${step(next, "next", "Next entry")}
          </span>
        </nav>
        <article class="kit-card kit-dish">
          <h2 class="kit-dish__title">${this.badgeHtml(entry, this.ranks())} ${escapeHtml(entry.title)}</h2>
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
        ${this.scorerHtml(entry)}
        ${this.canJudge && !entry.is_own ? this.meterHtml(entry) : ""}
      </div>`;
    window.scrollTo({ top: 0 });
  }

  meterHtml(entry) {
    const judgment = this.current(entry.id);
    const label = this.isScored(entry.id) ? "Update" : "Save";
    return scoreMeterHtml(this.data.categories, judgment?.scores, {
      saved: !this.drafts[entry.id] && !!judgment,
      actionHtml: `<button type="submit" form="judge-form-${entry.id}" class="kit-btn kit-btn--primary" data-save>${label}</button>`,
    });
  }

  scorerHtml(entry) {
    if (entry.is_own)
      return `<p class="kit-card kit-empty">This is your entry. You can't score it.</p>`;
    if (!this.canJudge) return "";
    const judgment = this.current(entry.id);
    const fav = this.data.myFavoriteEntryId === entry.id;
    return `
      <form class="kit-card kit-scorer" id="judge-form-${entry.id}" data-judge-form="${entry.id}" novalidate>
        ${this.data.categories.map((c) => scoreInputHtml(c, judgment?.scores?.[c.key])).join("")}
        <label class="kit-field">
          <span class="kit-label">Notes (only you see these)</span>
          <textarea class="kit-input" name="notes" rows="2" maxlength="2000">${escapeHtml(judgment?.notes || "")}</textarea>
        </label>
        ${
          this.favoritesOn
            ? `<div class="kit-scorer__actions">
          <button type="button" class="kit-btn kit-btn--plain kit-fav-btn${fav ? " is-favorite" : ""}" data-act="favorite" data-entry="${entry.id}" aria-pressed="${fav}">
            ${fav ? "★ My favorite" : "☆ Make this my favorite"}
          </button>
        </div>`
            : ""
        }
      </form>`;
  }

  // ── Events ──
  handleChange(e) {
    const form = e.target.closest("[data-judge-form]");
    if (!form || (e.target.type !== "radio" && e.target.name !== "notes")) return;
    const entryId = form.dataset.judgeForm;
    const draft = { scores: this.readScores(form), notes: form.elements.notes.value };
    this.drafts[entryId] = draft;
    this.persistDrafts();

    const meter = this.view.querySelector("[data-meter]");
    if (e.target.type === "radio") {
      const category = this.data.categories.find((c) => c.key === e.target.name);
      if (category) updateLevelText(form, category);
      updateScoreMeter(meter, this.data.categories, draft.scores);
    } else {
      setMeterStatus(meter, "not saved");
    }
    this.queueAutosave(entryId);
  }

  readScores(form) {
    const scores = {};
    this.data.categories.forEach((c) => {
      const picked = form.querySelector(`input[name="${CSS.escape(c.key)}"]:checked`);
      if (picked) scores[c.key] = Number(picked.value);
    });
    return scores;
  }

  // A fully scored card saves itself shortly after the last tap
  queueAutosave(entryId) {
    clearTimeout(this.autosave?.timer);
    this.autosave = null;
    if (!this.isComplete(this.drafts[entryId]?.scores)) return;
    this.autosave = {
      entryId,
      timer: setTimeout(() => {
        this.autosave = null;
        this.saveJudgment(entryId);
      }, AUTOSAVE_MS),
    };
  }

  flushAutosave() {
    if (!this.autosave) return;
    clearTimeout(this.autosave.timer);
    const { entryId } = this.autosave;
    this.autosave = null;
    this.saveJudgment(entryId);
  }

  // Meter of the scorer currently on screen, if it belongs to this entry
  meterFor(entryId) {
    return this.view.querySelector(`#judge-form-${entryId}`)
      ? this.view.querySelector("[data-meter]")
      : null;
  }

  handleSubmit(e) {
    const form = e.target.closest("[data-judge-form]");
    if (!form) return;
    e.preventDefault();
    const entryId = form.dataset.judgeForm;
    clearTimeout(this.autosave?.timer);
    this.autosave = null;
    const scores = this.readScores(form);
    const unscored = this.data.categories.find((c) => !scores[c.key]);
    if (unscored) {
      setMeterStatus(this.meterFor(entryId), `Score ${unscored.label} first`, "error");
      form
        .querySelector(`#score-${CSS.escape(unscored.key)}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    this.drafts[entryId] = { scores, notes: form.elements.notes.value };
    this.persistDrafts();
    this.saveJudgment(entryId);
  }

  async saveJudgment(entryId) {
    const draft = this.drafts[entryId];
    if (!draft || !this.isComplete(draft.scores)) return;
    const btn = this.meterFor(entryId)?.querySelector("[data-save]");
    if (btn) btn.disabled = true;
    setMeterStatus(this.meterFor(entryId), "saving...");
    try {
      await apiJson(`/api/competitions/${this.data.competition.id}/entries/${entryId}/judgment`, {
        method: "POST",
        body: draft,
      });
      this.data.myJudgments[entryId] = draft;
      // a newer tap may have replaced the draft while this one was saving
      const stillCurrent = this.drafts[entryId] === draft;
      if (stillCurrent) {
        delete this.drafts[entryId];
        this.persistDrafts();
      }
      const meter = this.meterFor(entryId);
      if (meter) {
        updateScoreMeter(meter, this.data.categories, this.current(entryId).scores, {
          saved: stillCurrent,
        });
        meter.querySelector("[data-save]").textContent = "Update";
      }
      this.renderStatus();
      if (!this.focusedId()) this.renderList();
    } catch (err) {
      setMeterStatus(this.meterFor(entryId), err.message, "error");
    } finally {
      const live = this.meterFor(entryId)?.querySelector("[data-save]");
      if (live) live.disabled = false;
    }
  }

  async handleClick(e) {
    const btn = e.target.closest("[data-act]");
    if (!btn) return;
    const act = btn.dataset.act;
    if (act === "list") {
      e.preventDefault();
      this.flushAutosave();
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
      const el = this.banner.querySelector("[data-error]");
      if (el) el.textContent = msg;
      else setMeterStatus(this.view.querySelector("[data-meter]"), msg, "error");
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
