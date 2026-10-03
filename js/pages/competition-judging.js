import { BasePage } from "./base-page.js";

// Data-driven judging page: categories, labels, and weights come from the
// competition payload — nothing here is competition-specific.
class CompetitionJudgingPage extends BasePage {
  constructor() {
    super({ requiresAuth: true });
    this.slug = document.body.dataset.competitionSlug;
    this.competition = null;
    this.categories = [];
    this.entries = [];
    this.myJudgments = {};
    this.myFavoriteEntryId = null;
    this.registration = null;
  }

  async onReady() {
    await this.loadData();
    this.render();

    const entriesDiv = document.getElementById("entriesList");
    const bannerDiv = document.getElementById("judgingBanner");
    const onClick = (e) => this.handleClick(e);
    const onChange = (e) => this.handleScoreChange(e);
    const onSubmit = (e) => this.handleSubmit(e);
    entriesDiv.addEventListener("click", onClick);
    entriesDiv.addEventListener("change", onChange);
    entriesDiv.addEventListener("submit", onSubmit);
    bannerDiv.addEventListener("click", onClick);
    this.eventCleanup.push(() => {
      entriesDiv.removeEventListener("click", onClick);
      entriesDiv.removeEventListener("change", onChange);
      entriesDiv.removeEventListener("submit", onSubmit);
      bannerDiv.removeEventListener("click", onClick);
    });
  }

  async loadData() {
    const res = await fetch(`/api/competitions/${encodeURIComponent(this.slug)}`);
    if (!res.ok) throw new Error("Failed to load competition");
    const payload = await res.json();
    this.competition = payload.competition;
    this.categories = payload.categories;
    this.entries = payload.entries;
    this.myJudgments = payload.myJudgments || {};
    this.myFavoriteEntryId = payload.myFavoriteEntryId;
    this.registration = payload.registration;
  }

  get canJudge() {
    return (
      this.competition?.voting_open &&
      this.registration &&
      this.registration.status === "active"
    );
  }

  isComplete(entryId) {
    const judgment = this.myJudgments[entryId];
    return !!judgment && this.categories.every((c) => judgment.scores?.[c.key] >= 1);
  }

  weightedTotal(scores) {
    return this.categories.reduce((sum, c) => sum + (scores?.[c.key] || 0) * c.weight, 0);
  }

  get maxTotal() {
    return this.categories.reduce((sum, c) => sum + 5 * c.weight, 0);
  }

  render() {
    this.renderBanner();
    this.renderStatus();
    this.renderEntries();
  }

  renderBanner() {
    const banner = document.getElementById("judgingBanner");
    if (!this.competition.voting_open) {
      banner.innerHTML = `<div class="judging-banner">Judging isn't open yet. Check back when the competition starts!</div>`;
      return;
    }
    if (!this.registration || this.registration.status !== "active") {
      banner.innerHTML = `
        <div class="judging-banner">
          You need to be registered to judge.
          <button class="btn btn-primary" data-action="register-judge">REGISTER AS A JUDGE</button>
        </div>`;
      return;
    }
    banner.innerHTML = "";
  }

  renderStatus() {
    const statusDiv = document.getElementById("judgingStatus");
    const judgable = this.entries.filter((e) => e.recipes?.user_id !== this.userId);
    const completed = judgable.filter((e) => this.isComplete(e.id)).length;
    statusDiv.innerHTML = `<p style="margin: 0">Progress: ${completed}/${judgable.length} completed ${
      this.myFavoriteEntryId ? "&#9733; Favorite picked!" : "&#9734; Pick favorite"
    }</p>`;
  }

  renderEntries() {
    const entriesDiv = document.getElementById("entriesList");
    if (this.entries.length === 0) {
      entriesDiv.innerHTML = '<p class="text-center">No entries submitted yet.</p>';
      return;
    }
    entriesDiv.innerHTML = this.entries.map((entry) => this.renderCard(entry)).join("");
  }

  renderCard(entry) {
    const recipe = entry.recipes || {};
    const isOwn = recipe.user_id === this.userId;
    const judgment = this.myJudgments[entry.id];
    const isFavorite = this.myFavoriteEntryId === entry.id;
    const complete = this.isComplete(entry.id);
    const status = isOwn ? "own" : complete ? "completed" : judgment ? "in-progress" : "not-started";

    return `
      <div class="comp-entry-card status-${status}" data-entry-id="${entry.id}">
        <div class="comp-entry-header">
          <div>
            <h3 class="comp-entry-title">${escapeHtml(recipe.title || "Untitled")}</h3>
            ${recipe.description ? `<p class="comp-entry-desc">${escapeHtml(recipe.description)}</p>` : ""}
          </div>
          ${
            isOwn
              ? `<div class="own-entry-badge">YOUR ENTRY</div>`
              : `<button class="comp-fav-btn ${isFavorite ? "is-favorite" : ""}"
                   data-action="toggle-favorite" data-entry-id="${entry.id}"
                   title="${isFavorite ? "Remove favorite" : "Pick as favorite"}">
                   ${isFavorite ? "&#9733;" : "&#9734;"}
                 </button>`
          }
        </div>
        ${!isOwn && judgment ? this.renderScoreSummary(entry.id) : ""}
        ${
          !isOwn && this.canJudge
            ? `<button class="btn btn-primary comp-judge-toggle" data-action="toggle-form" data-entry-id="${entry.id}">
                 ${complete ? "EDIT SCORES" : judgment ? "CONTINUE JUDGING" : "START JUDGING"}
               </button>
               <div class="comp-judge-form-wrap" data-form-for="${entry.id}" style="display: none">
                 ${this.renderForm(entry.id)}
               </div>`
            : ""
        }
      </div>`;
  }

  renderScoreSummary(entryId) {
    const judgment = this.myJudgments[entryId];
    const cells = this.categories
      .map(
        (c) => `
        <div class="score-compact">
          <span class="score-label">${escapeHtml(c.label)}</span>
          <span class="score-value">${judgment.scores?.[c.key] ?? "&mdash;"}</span>
        </div>`
      )
      .join("");
    const total = this.isComplete(entryId)
      ? `<div class="score-compact score-total">
           <span class="score-label">Total</span>
           <span class="score-value">${this.weightedTotal(judgment.scores)}</span>
         </div>`
      : "";
    return `<div class="comp-entry-scores">${cells}${total}</div>`;
  }

  renderForm(entryId) {
    const judgment = this.myJudgments[entryId];
    const selects = this.categories
      .map((c) => {
        const current = judgment?.scores?.[c.key];
        const options = [1, 2, 3, 4, 5]
          .map((n) => `<option value="${n}" ${current === n ? "selected" : ""}>${n}</option>`)
          .join("");
        return `
          <div class="score-input">
            <label>${escapeHtml(c.label)} (x${c.weight})</label>
            <select name="${escapeHtml(c.key)}" required>
              <option value="">Select...</option>
              ${options}
            </select>
          </div>`;
      })
      .join("");

    return `
      <form class="comp-judgment-form" data-entry-id="${entryId}">
        <div class="comp-scoring-grid">${selects}</div>
        <div class="comp-total-preview" data-total-for="${entryId}">
          Total: ${judgment ? this.weightedTotal(judgment.scores) : 0}/${this.maxTotal}
        </div>
        <div class="notes-input">
          <label>Notes (optional)</label>
          <textarea name="notes" rows="2" placeholder="Any feedback...">${escapeHtml(judgment?.notes || "")}</textarea>
        </div>
        <button type="submit" class="btn btn-primary" data-sound="save">SUBMIT SCORES</button>
      </form>`;
  }

  async handleClick(e) {
    const actionEl = e.target.closest("[data-action]");
    if (!actionEl) return;
    const action = actionEl.dataset.action;

    if (action === "toggle-form") {
      const wrap = document.querySelector(`[data-form-for="${actionEl.dataset.entryId}"]`);
      if (wrap) wrap.style.display = wrap.style.display === "none" ? "" : "none";
      return;
    }

    if (action === "register-judge") {
      actionEl.disabled = true;
      try {
        const res = await fetch(`/api/competitions/${this.competition.id}/register`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role: "judge" }),
        });
        if (!res.ok) throw new Error((await res.json()).error || "Failed to register");
        await this.loadData();
        this.render();
        this.showSuccessToast("You're registered as a judge!");
      } catch (err) {
        actionEl.disabled = false;
        this.showErrorToast(err.message);
      }
      return;
    }

    if (action === "toggle-favorite") {
      const entryId = actionEl.dataset.entryId;
      if (!this.canJudge) {
        this.showErrorToast("You need to be registered to pick a favorite.");
        return;
      }
      actionEl.disabled = true;
      try {
        const isRemoving = this.myFavoriteEntryId === entryId;
        const res = await fetch(`/api/competitions/${this.competition.id}/favorite`, {
          method: isRemoving ? "DELETE" : "POST",
          headers: { "Content-Type": "application/json" },
          body: isRemoving ? undefined : JSON.stringify({ entryId }),
        });
        if (!res.ok) throw new Error((await res.json()).error || "Failed to update favorite");
        this.myFavoriteEntryId = isRemoving ? null : entryId;
        this.render();
      } catch (err) {
        actionEl.disabled = false;
        this.showErrorToast(err.message);
      }
    }
  }

  handleScoreChange(e) {
    const form = e.target.closest(".comp-judgment-form");
    if (!form || e.target.tagName !== "SELECT") return;
    const scores = {};
    this.categories.forEach((c) => {
      const value = parseInt(form.elements[c.key]?.value, 10);
      if (value) scores[c.key] = value;
    });
    const preview = document.querySelector(`[data-total-for="${form.dataset.entryId}"]`);
    if (preview) preview.textContent = `Total: ${this.weightedTotal(scores)}/${this.maxTotal}`;
  }

  async handleSubmit(e) {
    const form = e.target.closest(".comp-judgment-form");
    if (!form) return;
    e.preventDefault();

    const entryId = form.dataset.entryId;
    const scores = {};
    for (const c of this.categories) {
      const value = parseInt(form.elements[c.key]?.value, 10);
      if (!value) {
        this.showErrorToast(`Please score ${c.label}.`);
        return;
      }
      scores[c.key] = value;
    }

    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = "Saving...";
    try {
      const res = await fetch(
        `/api/competitions/${this.competition.id}/entries/${entryId}/judgment`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scores, notes: form.elements.notes.value }),
        }
      );
      if (!res.ok) throw new Error((await res.json()).error || "Failed to save judgment");
      this.myJudgments[entryId] = { notes: form.elements.notes.value, scores };
      this.render();
      this.showSuccessToast("Scores saved!");
    } catch (err) {
      submitBtn.disabled = false;
      submitBtn.textContent = "SUBMIT SCORES";
      this.showErrorToast(err.message);
    }
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export { CompetitionJudgingPage };
