import { BasePage } from "./base-page.js";
import { FavoriteButton } from "../components/favorite-button.js";
import { featureFlags } from "../utils/feature-flags.js";
import { firebaseAuth } from "../services/firebase-auth.js";
import { EventBus } from "../events/event-bus.js";

class CocktailJudgingPage extends BasePage {
  constructor() {
    super();
    this.activeCompetition = null;
    this.entries = [];
    this.myJudgments = new Map();
    this.myFavorite = null;
  }

  async onReady() {
    this.setPageTitle("Cocktail Judging");
    await this.loadCompetitionData();
  }

  async loadCompetitionData() {
    try {
      // Check if event has started
      const eventStarted = await featureFlags.isEventStarted(this.supabase);

      if (!eventStarted) {
        this.showVotingNotStarted();
        return;
      }

      // Load active competition
      const { data: competitions, error: compError } = await this.supabase
        .from("cocktail_competitions")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1);

      if (compError) throw compError;

      if (!competitions || competitions.length === 0) {
        this.showNoCompetition();
        return;
      }

      this.activeCompetition = competitions[0];

      // Check if voting is open
      if (!this.activeCompetition.voting_open) {
        this.showVotingClosed();
        return;
      }

      // Load all entries for this competition
      await this.loadEntries();

      // Load user's judgments
      await this.loadMyJudgments();

      // Load user's favorite
      await this.loadMyFavorite();

      // Render entries
      this.renderEntries();
    } catch (err) {
      console.error("Error loading competition data:", err);
      this.showError("Failed to load competition data. Please refresh the page.");
    }
  }

  showVotingNotStarted() {
    document.getElementById("judgingStatus").innerHTML = `
            <p style="margin: 0;">Judging will open once the event starts.</p>
        `;
    document.getElementById("entriesList").innerHTML = `
            <div class="feature-preview" style="text-align: center;">
                <img style="margin-top:-25px;" src="images/construction.gif" alt="Under Construction" class="preview-gif">
                <div style="text-align: left; padding: 1rem;">
                    <h3 style="margin-top: 0; text-align: center;">Cocktail Competition</h3>
                    <p style="margin: 0.5rem 0;">Get ready to judge some amazing cocktails! Once the event starts, you'll be able to vote on entries and pick your favorite creation.</p>
                    <p style="margin: 0.5rem 0; text-align: center; font-style: italic; font-size: 0.9rem;">Check back when the event begins to start judging! 🍹</p>
                </div>
            </div>
        `;
  }

  showNoCompetition() {
    document.getElementById("judgingStatus").innerHTML = `
            <p style="margin: 0;">⚠️ No Active Competition</p>
        `;
    document.getElementById("entriesList").innerHTML =
      '<p class="text-center">There is no cocktail competition available for judging at this time.</p>';
  }

  showVotingClosed() {
    document.getElementById("judgingStatus").innerHTML = `
            <p style="margin: 0;">🔒 Judging Closed</p>
        `;
    document.getElementById("entriesList").innerHTML =
      '<p class="text-center">Judging for this competition has ended.</p>';
  }

  renderEntries() {
    const statusDiv = document.getElementById("judgingStatus");
    const completedCount = Array.from(this.myJudgments.values()).filter((j) =>
      this.isJudgmentComplete(j)
    ).length;
    const totalCount = this.entries.length;
    const favoriteIcon = this.myFavorite ? "⭐" : "☆";

    statusDiv.innerHTML = `
            <p style="margin: 0;">Progress: ${completedCount}/${totalCount} completed ${favoriteIcon} ${this.myFavorite ? "Favorite picked!" : "Pick favorite"}</p>
        `;

    const entriesDiv = document.getElementById("entriesList");

    if (this.entries.length === 0) {
      entriesDiv.innerHTML = '<p class="text-center">No entries submitted yet.</p>';
      return;
    }

    entriesDiv.innerHTML = this.entries
      .map((entry) => {
        return this.renderCompactCard(entry);
      })
      .join("");

    // Attach event listeners
    this.attachEntryListeners();
  }

  isJudgmentComplete(judgment) {
    return (
      judgment &&
      judgment.taste_score &&
      judgment.presentation_score &&
      judgment.workmanship_score &&
      judgment.creativity_score
    );
  }

  getEntryStatus(entry) {
    const judgment = this.myJudgments.get(entry.id);
    if (!judgment) return "not-started";
    if (this.isJudgmentComplete(judgment)) return "completed";
    return "in-progress";
  }

  renderCompactCard(entry) {
    const judgment = this.myJudgments.get(entry.id);
    const isFavorite = this.myFavorite === entry.id;
    const status = this.getEntryStatus(entry);
    const isComplete = status === "completed";

    // Calculate weighted total score (out of 100)
    const weightedTotal = judgment
      ? (judgment.taste_score || 0) * 10 +
        (judgment.presentation_score || 0) * 4 +
        (judgment.workmanship_score || 0) * 3 +
        (judgment.creativity_score || 0) * 3
      : 0;

    return `
            <div class="entry-card-compact status-${status}" data-entry-id="${entry.id}">
                <div class="entry-compact-header">
                    <div class="entry-compact-info">
                        <h3 class="entry-compact-title">
                            ${entry.entry_name}
                        </h3>
                        <p class="entry-compact-author">
                            by ${entry.users?.display_name || entry.users?.username || "Unknown"}
                            <button class="btn-info-icon"
                                    data-action="toggle-description"
                                    data-entry-id="${entry.id}"
                                    title="View description"
                                    aria-label="View description">
                                <img class="icon-gif icon-gif--with-text" src="images/info.gif" alt="info">
                            </button>
                        </p>
                    </div>
                    <div class="entry-compact-actions">
                        ${FavoriteButton.toHTML({ entryId: entry.id, isFavorite, style: "icon" })}
                        ${
                          isComplete
                            ? `
                            <button class="btn-edit-icon"
                                    data-action="open-judging-modal"
                                    data-entry-id="${entry.id}"
                                    title="Edit scores"
                                    aria-label="Edit scores">
                                ✏️
                            </button>
                        `
                            : ""
                        }
                    </div>
                </div>

                <div class="entry-description-collapse" data-entry-id="${entry.id}" style="display: none;">
                    <div class="description-content">
                        <strong>Description:</strong>
                        <p>${entry.description}</p>
                    </div>
                </div>

                ${
                  status !== "not-started"
                    ? `
                    <div class="entry-compact-scores">
                        <div class="score-compact">
                            <span class="score-label">Taste</span>
                            <span class="score-value">${judgment.taste_score || "—"}</span>
                        </div>
                        <div class="score-compact">
                            <span class="score-label">Present.</span>
                            <span class="score-value">${judgment.presentation_score || "—"}</span>
                        </div>
                        <div class="score-compact">
                            <span class="score-label">Work.</span>
                            <span class="score-value">${judgment.workmanship_score || "—"}</span>
                        </div>
                        <div class="score-compact">
                            <span class="score-label">Creative</span>
                            <span class="score-value">${judgment.creativity_score || "—"}</span>
                        </div>
                        ${
                          isComplete
                            ? `
                            <div class="score-compact score-total">
                                <span class="score-label">Total</span>
                                <span class="score-value">${weightedTotal}</span>
                            </div>
                        `
                            : ""
                        }
                    </div>
                `
                    : ""
                }

                ${
                  !isComplete
                    ? `
                    <button class="btn-primary"
                            data-action="open-judging-modal"
                            data-entry-id="${entry.id}"
                            title="${status === "not-started" ? "Start judging" : "Continue judging"}"
                            aria-label="${status === "not-started" ? "Start judging" : "Continue judging"}">
                        ${status === "not-started" ? "START JUDGING" : "CONTINUE JUDGING"}
                    </button>
                `
                    : ""
                }
            </div>
        `;
  }

  renderJudgmentView(entry, judgment, isFavorite) {
    const totalScore =
      judgment.taste_score * 10 +
      judgment.presentation_score * 4 +
      judgment.workmanship_score * 3 +
      judgment.creativity_score * 3;

    return `
            <div class="judgment-view">
                <div class="scores-grid">
                    <div class="score-item">
                        <strong>Taste:</strong> ${judgment.taste_score}/5 (${judgment.taste_score * 10} pts)
                    </div>
                    <div class="score-item">
                        <strong>Presentation:</strong> ${judgment.presentation_score}/5 (${judgment.presentation_score * 4} pts)
                    </div>
                    <div class="score-item">
                        <strong>Workmanship:</strong> ${judgment.workmanship_score}/5 (${judgment.workmanship_score * 3} pts)
                    </div>
                    <div class="score-item">
                        <strong>Creativity:</strong> ${judgment.creativity_score}/5 (${judgment.creativity_score * 3} pts)
                    </div>
                </div>
                <div class="total-score">
                    <strong>Total:</strong> ${totalScore}/100 points
                </div>
                ${judgment.notes ? `<div class="judgment-notes"><strong>Notes:</strong> ${judgment.notes}</div>` : ""}
                <div class="judgment-actions">
                    <button class="btn-secondary edit-judgment-btn" data-entry-id="${entry.id}">
                        Edit Scores
                    </button>
                    ${!isFavorite ? FavoriteButton.toHTML({ entryId: entry.id, isFavorite: false, style: "button" }) : ""}
                </div>
            </div>
        `;
  }

  renderJudgmentForm(entry, isFavorite, existingJudgment = null) {
    return `
            <form class="judgment-form" data-entry-id="${entry.id}">
                <div class="scoring-grid">
                    <div class="score-input">
                        <label>Taste & Flavor (x10)</label>
                        <select name="taste_score">
                            <option value="">Select...</option>
                            <option value="1" ${existingJudgment?.taste_score === 1 ? "selected" : ""}>1 - Poor</option>
                            <option value="2" ${existingJudgment?.taste_score === 2 ? "selected" : ""}>2 - Not Great</option>
                            <option value="3" ${existingJudgment?.taste_score === 3 ? "selected" : ""}>3 - Good</option>
                            <option value="4" ${existingJudgment?.taste_score === 4 ? "selected" : ""}>4 - Very Good</option>
                            <option value="5" ${existingJudgment?.taste_score === 5 ? "selected" : ""}>5 - Amazing</option>
                        </select>
                    </div>

                    <div class="score-input">
                        <label>Presentation (x4)</label>
                        <select name="presentation_score">
                            <option value="">Select...</option>
                            <option value="1" ${existingJudgment?.presentation_score === 1 ? "selected" : ""}>1 - Basic</option>
                            <option value="2" ${existingJudgment?.presentation_score === 2 ? "selected" : ""}>2 - Some Effort</option>
                            <option value="3" ${existingJudgment?.presentation_score === 3 ? "selected" : ""}>3 - Nice</option>
                            <option value="4" ${existingJudgment?.presentation_score === 4 ? "selected" : ""}>4 - Impressive</option>
                            <option value="5" ${existingJudgment?.presentation_score === 5 ? "selected" : ""}>5 - Wow Factor</option>
                        </select>
                    </div>

                    <div class="score-input">
                        <label>Workmanship (x3)</label>
                        <select name="workmanship_score">
                            <option value="">Select...</option>
                            <option value="1" ${existingJudgment?.workmanship_score === 1 ? "selected" : ""}>1 - Poor</option>
                            <option value="2" ${existingJudgment?.workmanship_score === 2 ? "selected" : ""}>2 - Needs Work</option>
                            <option value="3" ${existingJudgment?.workmanship_score === 3 ? "selected" : ""}>3 - Good</option>
                            <option value="4" ${existingJudgment?.workmanship_score === 4 ? "selected" : ""}>4 - Skilled</option>
                            <option value="5" ${existingJudgment?.workmanship_score === 5 ? "selected" : ""}>5 - Perfect</option>
                        </select>
                    </div>

                    <div class="score-input">
                        <label>Creativity (x3)</label>
                        <select name="creativity_score">
                            <option value="">Select...</option>
                            <option value="1" ${existingJudgment?.creativity_score === 1 ? "selected" : ""}>1 - Basic</option>
                            <option value="2" ${existingJudgment?.creativity_score === 2 ? "selected" : ""}>2 - Slight Twist</option>
                            <option value="3" ${existingJudgment?.creativity_score === 3 ? "selected" : ""}>3 - Creative</option>
                            <option value="4" ${existingJudgment?.creativity_score === 4 ? "selected" : ""}>4 - Very Unique</option>
                            <option value="5" ${existingJudgment?.creativity_score === 5 ? "selected" : ""}>5 - Genius</option>
                        </select>
                    </div>
                </div>

                <div class="notes-input">
                    <label>Notes (optional)</label>
                    <textarea name="notes" rows="3" placeholder="Any additional feedback...">${existingJudgment?.notes || ""}</textarea>
                </div>

                <div class="form-actions">
                    <button type="submit" class="btn-primary" data-sound="save">
                        Submit Judgment
                    </button>
                </div>

                <div class="error-message" style="display: none;"></div>
            </form>

            <!-- Favorite toggle outside form for independent action -->
            <div style="margin-top: 1rem; text-align: center;">
                ${FavoriteButton.toHTML({ entryId: entry.id, isFavorite, style: "icon-with-text" })}
            </div>
        `;
  }

  attachEntryListeners() {
    // Judge entry buttons - open modal (using data-action, not class)
    document.querySelectorAll('[data-action="open-judging-modal"]').forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const entryId = e.target.dataset.entryId;
        this.openJudgingModal(entryId);
      });
    });

    // Favorite star icon clicks (using data-action, not class)
    document.querySelectorAll('[data-action="toggle-favorite"]').forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const entryId = e.target.dataset.entryId;

        // If clicking the already-favorited entry, unfavorite it
        if (this.myFavorite === entryId) {
          await this.handleUnfavorite(entryId, btn);
        } else {
          await this.handleMarkFavoriteFromCard(entryId, btn);
        }
      });
    });

    // Info icon clicks - toggle description
    document.querySelectorAll('[data-action="toggle-description"]').forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        // Get the button element (in case user clicks on the img inside)
        const button = e.target.closest('[data-action="toggle-description"]');
        const entryId = button.dataset.entryId;
        const descriptionDiv = document.querySelector(
          `.entry-description-collapse[data-entry-id="${entryId}"]`
        );

        if (descriptionDiv) {
          const isVisible = descriptionDiv.style.display !== "none";
          descriptionDiv.style.display = isVisible ? "none" : "block";
          button.title = isVisible ? "View description" : "Hide description";
          button.setAttribute("aria-label", isVisible ? "View description" : "Hide description");
        }
      });
    });
  }

  openJudgingModal(entryId) {
    const entry = this.entries.find((e) => e.id === entryId);
    if (!entry) return;

    const judgment = this.myJudgments.get(entryId);
    const isFavorite = this.myFavorite === entryId;

    // Create modal
    const modal = document.createElement("div");
    modal.id = "judgingModal";
    modal.className = "challenge-modal";
    modal.style.display = "block";
    modal.innerHTML = `
            <div class="challenge-modal-overlay"></div>
            <div class="challenge-modal-content">
                <button class="close-btn" id="closeJudgingModal">✖️</button>

                <h2 class="rainbow-text">
                    ${entry.entry_name}
                    <button class="btn-info-icon"
                            data-action="toggle-modal-description"
                            title="View description"
                            aria-label="View description">
                        <img class="icon-gif icon-gif--with-text" src="images/info.gif" alt="info">
                    </button>
                </h2>
                <p style="margin-bottom: 1rem;">by ${entry.users?.display_name || entry.users?.username || "Unknown"}</p>

                <div class="entry-description-collapse" id="modalDescription" style="display: none; margin-bottom: 1.5rem;">
                    <div class="description-content">
                        <strong>Description:</strong>
                        <p>${entry.description}</p>
                    </div>
                </div>

                ${this.renderJudgmentForm(entry, isFavorite, judgment)}
            </div>
        `;

    document.body.appendChild(modal);
    document.body.style.overflow = "hidden";

    // Close handlers
    const closeBtn = modal.querySelector("#closeJudgingModal");
    const overlay = modal.querySelector(".challenge-modal-overlay");

    const closeModal = () => {
      modal.remove();
      document.body.style.overflow = "auto";
    };

    closeBtn.addEventListener("click", closeModal);
    overlay.addEventListener("click", closeModal);

    // Info icon toggle in modal
    const infoBtn = modal.querySelector('[data-action="toggle-modal-description"]');
    const modalDescription = modal.querySelector("#modalDescription");

    infoBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      // Get the button element (in case user clicks on the img inside)
      const button = e.target.closest('[data-action="toggle-modal-description"]');
      const isVisible = modalDescription.style.display !== "none";
      modalDescription.style.display = isVisible ? "none" : "block";
      button.title = isVisible ? "View description" : "Hide description";
      button.setAttribute("aria-label", isVisible ? "View description" : "Hide description");
    });

    // Form submit handler
    const form = modal.querySelector(".judgment-form");
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      await this.handleJudgmentSubmit(e, closeModal);
    });

    // Favorite button handler (using data-action selector, don't close modal)
    const favoriteBtn = modal.querySelector('[data-action="toggle-favorite"]');
    if (favoriteBtn) {
      favoriteBtn.addEventListener("click", async (e) => {
        e.preventDefault();
        await this.handleMarkFavorite(e);
        // Modal stays open - button updates via FavoriteButton.update()
      });
    }
  }

  async handleJudgmentSubmit(e, closeModal = null) {
    e.preventDefault();
    const form = e.target;
    const entryId = form.dataset.entryId;
    const submitBtn = form.querySelector('button[type="submit"]');
    const errorDiv = form.querySelector(".error-message");

    submitBtn.disabled = true;
    submitBtn.textContent = "Saving...";
    errorDiv.style.display = "none";

    try {
      const formData = new FormData(form);
      const judgmentData = {
        entry_id: entryId,
        judge_user_id: this.userId,
        taste_score: parseInt(formData.get("taste_score")),
        presentation_score: parseInt(formData.get("presentation_score")),
        workmanship_score: parseInt(formData.get("workmanship_score")),
        creativity_score: parseInt(formData.get("creativity_score")),
        notes: formData.get("notes")?.trim() || null,
      };

      const existingJudgment = this.myJudgments.get(entryId);

      if (existingJudgment) {
        // Update existing judgment
        const { error } = await this.supabase
          .from("cocktail_judgments")
          .update(judgmentData)
          .eq("id", existingJudgment.id);

        if (error) throw error;
      } else {
        // Create new judgment
        const { error } = await this.supabase.from("cocktail_judgments").insert([judgmentData]);

        if (error) throw error;
      }

      // Reload data and re-render
      await this.loadMyJudgments();
      this.renderEntries();

      // Close modal if provided
      if (closeModal) {
        closeModal();
      }
    } catch (err) {
      console.error("Error saving judgment:", err);
      errorDiv.textContent = "Failed to save judgment. Please try again.";
      errorDiv.style.display = "block";
      submitBtn.disabled = false;
      submitBtn.textContent = "Submit Judgment";
    }
  }

  async handleEditJudgment(e) {
    const entryId = e.target.dataset.entryId;
    const judgment = this.myJudgments.get(entryId);

    // Find the entry card and replace judgment view with form
    const entryCard = document.querySelector(`[data-entry-id="${entryId}"]`);
    const judgmentView = entryCard.querySelector(".judgment-view");

    const form = document.createElement("div");
    form.innerHTML = this.renderJudgmentForm(
      this.entries.find((e) => e.id === entryId),
      this.myFavorite === entryId
    );

    // Pre-fill form with existing values
    const formElement = form.querySelector("form");
    formElement.querySelector('[name="taste_score"]').value = judgment.taste_score;
    formElement.querySelector('[name="presentation_score"]').value = judgment.presentation_score;
    formElement.querySelector('[name="workmanship_score"]').value = judgment.workmanship_score;
    formElement.querySelector('[name="creativity_score"]').value = judgment.creativity_score;
    if (judgment.notes) {
      formElement.querySelector('[name="notes"]').value = judgment.notes;
    }

    judgmentView.replaceWith(form.firstElementChild);

    // Re-attach listeners
    this.attachEntryListeners();
  }

  async handleMarkFavorite(e) {
    const entryId = e.target.closest('[data-action="toggle-favorite"]').dataset.entryId;
    const btn = e.target.closest('[data-action="toggle-favorite"]');
    const wasAlreadyFavorite = this.myFavorite === entryId;

    btn.disabled = true;

    try {
      if (wasAlreadyFavorite) {
        // Remove favorite
        await this.supabase
          .from("cocktail_favorites")
          .delete()
          .eq("judge_user_id", this.userId)
          .eq("competition_id", this.activeCompetition.id);

        this.myFavorite = null;
      } else {
        // Remove existing favorite if any
        if (this.myFavorite) {
          await this.supabase
            .from("cocktail_favorites")
            .delete()
            .eq("judge_user_id", this.userId)
            .eq("competition_id", this.activeCompetition.id);
        }

        // Add new favorite
        const { error } = await this.supabase.from("cocktail_favorites").insert([
          {
            competition_id: this.activeCompetition.id,
            judge_user_id: this.userId,
            entry_id: entryId,
          },
        ]);

        if (error) throw error;
        this.myFavorite = entryId;
      }

      // Update the button that was clicked using the component
      FavoriteButton.update(btn, this.myFavorite === entryId);
      btn.disabled = false;

      // Re-render all entries to update other favorite buttons
      this.renderEntries();
      // Emit favorite toggled event for achievements
      try {
        EventBus.instance.emit("cocktail:favorite:toggled", {
          userId: this.userId,
          entryId,
          favorited: this.myFavorite === entryId,
        });
      } catch (emitErr) {
        // noop
      }
    } catch (err) {
      console.error("Error toggling favorite:", err);
      alert("Failed to update favorite. Please try again.");
      btn.disabled = false;
    }
  }

  async handleMarkFavoriteFromCard(entryId, btn) {
    // Store previous state for rollback
    const previousFavorite = this.myFavorite;

    // Optimistic update: immediately update UI
    this.myFavorite = entryId;
    this.renderEntries();

    try {
      // If there's an existing favorite for a different entry, remove it first
      if (previousFavorite && previousFavorite !== entryId) {
        await this.supabase
          .from("cocktail_favorites")
          .delete()
          .eq("judge_user_id", this.userId)
          .eq("competition_id", this.activeCompetition.id);
      }

      // Add new favorite
      const { error } = await this.supabase.from("cocktail_favorites").insert([
        {
          competition_id: this.activeCompetition.id,
          judge_user_id: this.userId,
          entry_id: entryId,
        },
      ]);

      if (error) throw error;
      // Emit favorite toggled event for achievements
      try {
        EventBus.instance.emit("cocktail:favorite:toggled", {
          userId: this.userId,
          entryId,
          favorited: true,
        });
      } catch (emitErr) {
        // noop
      }
    } catch (err) {
      console.error("Error marking favorite:", err);

      // Rollback: revert to previous state
      this.myFavorite = previousFavorite;
      this.renderEntries();

      // Show user-friendly error
      this.showToast("Failed to mark as favorite. Please try again.", "error");
    }
  }

  async handleUnfavorite(entryId, btn) {
    // Store previous state for rollback
    const previousFavorite = this.myFavorite;

    // Optimistic update: immediately update UI
    this.myFavorite = null;
    this.renderEntries();

    try {
      const { error } = await this.supabase
        .from("cocktail_favorites")
        .delete()
        .eq("judge_user_id", this.userId)
        .eq("competition_id", this.activeCompetition.id)
        .eq("entry_id", entryId);

      if (error) throw error;
      // Emit favorite toggled event for achievements (unfavorite)
      try {
        EventBus.instance.emit("cocktail:favorite:toggled", {
          userId: this.userId,
          entryId,
          favorited: false,
        });
      } catch (emitErr) {
        // noop
      }
    } catch (err) {
      console.error("Error removing favorite:", err);

      // Rollback: revert to previous state
      this.myFavorite = previousFavorite;
      this.renderEntries();

      // Show user-friendly error
      this.showToast("Failed to remove favorite. Please try again.", "error");
    }
  }

  showError(message) {
    document.getElementById("judgingStatus").innerHTML = `
            <div class="error-message">
                <p>${message}</p>
            </div>
        `;
  }

  showToast(message, type = "info") {
    // Create toast notification
    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    toast.style.cssText = `
            position: fixed;
            bottom: 2rem;
            right: 2rem;
            background: ${type === "error" ? "#FF0000" : "#00FF00"};
            color: ${type === "error" ? "#FFFF00" : "#000000"};
            padding: 1rem 1.5rem;
            border: 3px solid #FFFFFF;
            box-shadow: 5px 5px 0 rgba(0, 0, 0, 0.3);
            font-weight: bold;
            z-index: 10000;
            animation: slideIn 0.3s ease;
        `;

    document.body.appendChild(toast);

    // Remove after 3 seconds
    setTimeout(() => {
      toast.style.animation = "slideOut 0.3s ease";
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }
}

export { CocktailJudgingPage };
