import { BasePage } from "./base-page.js";
import { ChallengeCard } from "../components/challenge-card.js";
import { CocktailEntryModal } from "../components/cocktail-entry-modal.js";
import { EventBus } from "../events/event-bus.js";
import { featureFlags } from "../utils/feature-flags.js";
import { initNavigation } from "../components/navigation.js";
import { appState, APP_CONFIG } from "../app.js";
import { UserEventsSection } from "../components/user-events-section.js";
import { firebaseAuth } from "../services/firebase-auth.js";

class DashboardPage extends BasePage {
  constructor() {
    super();
    this.revealedChallengeId = null;
    this.refreshInterval = null;
    this.eventCleanup = [];
    this.cocktailModal = null;
    this.activeCompetition = null;
  }

  async onReady() {
    // Ensure Firebase session is valid before proceeding
    await firebaseAuth.init();
    const sdkUser = firebaseAuth.getCurrentUser();
    if (!sdkUser || !sdkUser.uid) {
      this.showError("Authentication required. Please log in.");
      window.location.href = "/";
      return;
    }

    // Load user profile from appState
    await appState.init();
    this.currentUser = appState.getCurrentUser();
    this.userId = appState.getUserId();

    this.setupEventListeners();
    initNavigation();
    this.setPageTitle("Dashboard");
    this.updateMarqueeUsername();

    // Listen for user:loaded and user:error events for centralized feedback
    this.userLoadedCleanup = appState.on("user:loaded", (e) => {
      this.currentUser = e.detail;
      this.userId = e.detail.id;
      this.updateMarqueeUsername();
      if (!this.userEventsSection) {
        this.userEventsSection = new UserEventsSection("userEventsSection");
      }
      this.userEventsSection.render();
    });
    // Render RSVP'd events section if user already loaded
    if (this.currentUser && this.userId) {
      if (!this.userEventsSection) {
        this.userEventsSection = new UserEventsSection("userEventsSection");
      }
      this.userEventsSection.render();
    }
    this.userErrorCleanup = appState.on("user:error", (e) => {
      this.showError(e.detail.error || "Authentication error");
    });
    console.log("DashboardPage ready, checking feature flags...");

    // Initialize cocktail entry modal
    try {
      this.cocktailModal = new CocktailEntryModal();
      await this.cocktailModal.init();
    } catch (err) {
      console.error("✖️ Failed to initialize cocktail modal:", err);
    }

    // Setup cocktail registration button
    const registerBtn = document.getElementById("registerCocktailBtn");
    if (registerBtn) {
      registerBtn.addEventListener("click", () => {
        if (this.cocktailModal) {
          this.cocktailModal.open();
        } else {
          console.error("✖️ Modal not initialized");
          alert("Cocktail modal failed to initialize. Please refresh the page.");
        }
      });
    }

    // Check event status once and store it
    this.eventStarted = await featureFlags.isEventStarted(this.supabase);

    // If event started, show stats and load data
    if (this.eventStarted) {
      await this.loadPersonalStats();

      // Set up refresh interval only if event started
      if (APP_CONFIG.enableAutoRefresh) {
        this.refreshInterval = setInterval(
          () => this.loadPersonalStats(),
          APP_CONFIG.refreshInterval
        );
      }
    }

    await this.loadPageData();
  }

  async loadPageData() {
    if (this.eventStarted) {
      await this.loadChallenges();
    } else {
      console.log("Event has not started yet, showing preview message");
      const preview = document.getElementById("challengesList");
      if (preview) {
        preview.innerHTML = `
                    <div class="feature-preview" style="text-align: center;">
                        <img style="margin-top:-25px;" src="images/construction.gif" alt="Under Construction" class="preview-gif">
                        <div style="text-align: left; padding: 1rem;">
                            <h3 style="margin-top: 0; text-align: center;">What are Challenges?</h3>
                            <p style="margin: 0.5rem 0;">Challenges are quick, fun activities that take <strong>30 seconds to 1 minute</strong> to complete. During the weekend, anyone can challenge you to perform one of these predetermined tasks—check the app and give it your best shot!</p>

                            <p style="margin: 0.5rem 0;"><strong>Have an idea?</strong> We've got plenty of challenges already created, but feel free to submit your own! Whether it's a general challenge for anyone or a specific one tailored for a particular person, <a href="challenges-submit.html" style="color: #0000FF; text-decoration: underline;">submit a challenge here</a>.</p>

                            <p style="margin: 0.5rem 0; text-align: center; font-style: italic; font-size: 0.9rem;">Once the event starts, be ready to accept some challenges and climb the leaderboard!</p>
                        </div>
                    </div>
                `;
        preview.className = "feature-preview";
      }
    }
    await this.loadCocktailCompetitionStatus();
  }

  async loadPersonalStats() {
    try {
      const { userStats, rank, assignmentStats } = await this.loadUserStats();

      if (!userStats) {
        document.getElementById("personalStats").innerHTML =
          '<div class="empty">No stats yet. Complete some challenges!</div>';
        return;
      }

      this.updateStatsValues(document.getElementById("personalStats"), {
        userStats,
        rank,
        assignmentStats,
      });
    } catch (err) {
      this.showError("Failed to load stats: " + err.message);
    }
  }

  // Keep existing updateStatsValues and triggerStatAnimation methods as-is

  updateMarqueeUsername() {
    const marqueeUsername = document.getElementById("marqueeUsername");
    if (marqueeUsername && this.currentUser && typeof this.currentUser.name === "string") {
      marqueeUsername.textContent = `, ${this.currentUser.name.toUpperCase()}`;
      // Fade in the username
      setTimeout(() => {
        marqueeUsername.style.transition = "opacity 0.5s ease-in";
        marqueeUsername.style.opacity = "1";
      }, 100);
    } else if (marqueeUsername) {
      marqueeUsername.textContent = "";
      marqueeUsername.style.opacity = "0";
    }
  }

  setupEventListeners() {
    // Listen for global challenge events
    const revealCleanup = EventBus.instance.listen(EventBus.EVENTS.CHALLENGE.REVEAL, async (e) => {
      await this.handleChallengeReveal(e.detail);
    });

    const completeCleanup = EventBus.instance.listen(
      EventBus.EVENTS.CHALLENGE.COMPLETE,
      async (e) => {
        await this.handleChallengeComplete(e.detail);
      }
    );

    // Store cleanup functions for later removal
    this.eventCleanup.push(revealCleanup, completeCleanup);
  }

  async handleChallengeReveal(detail) {
    const { assignmentId, element } = detail;

    // Just toggle the revealed state on the card element
    if (element) {
      element.classList.remove("unrevealed");
      element.classList.add("revealed");

      // Update the reveal prompt to action buttons
      const actionsContainer = element.querySelector(".challenge-actions, .reveal");
      if (actionsContainer) {
        // Get challenge details from the assignment data stored on the card
        const challengeId = element.dataset.challengeId;
        const brianMode = element.dataset.brianMode;

        actionsContainer.outerHTML = `
                    <div class="challenge-actions">
                        <button class="success-btn" data-id="${assignmentId}" data-challenge-id="${challengeId}" data-brian-mode="${brianMode}" data-sound="success" data-outcome="success">
                            <img src="images/green-checkmark.gif" class="icon-gif icon-gif--with-text hide-mobile" alt="checkmark">SUCCESS
                        </button>
                        <button class="failure-btn" data-id="${assignmentId}" data-challenge-id="${challengeId}" data-brian-mode="${brianMode}" data-sound="failure" data-outcome="failure">
                            <img src="images/failure.gif" class="icon-gif icon-gif--with-text hide-mobile" alt="cross">FAILURE
                        </button>
                    </div>
                `;

        // Re-attach event listeners to new buttons
        element.querySelectorAll("button").forEach((btn) => {
          btn.dataset.originalText = btn.textContent;
          btn.addEventListener("click", (e) => {
            e.stopPropagation();
            const outcome = btn.dataset.outcome;
            const assignmentId = btn.dataset.id;
            const challengeId = btn.dataset.challengeId;
            const brianMode = btn.dataset.brianMode;

            EventBus.instance.emit(EventBus.EVENTS.CHALLENGE.COMPLETE, {
              assignmentId,
              challengeId,
              outcome,
              brianMode,
              button: btn,
              element: element,
            });
          });
        });
      }

      // Remove the click handler from the card
      element.style.cursor = "";
    }

    this.revealedChallengeId = assignmentId;
  }

  async handleChallengeComplete(detail) {
    const { assignmentId, challengeId, outcome, brianMode, element } = detail;

    // Optimistic update - immediately update the UI assuming success
    this.updateCardAfterCompletion(assignmentId, outcome, element);

    // Reset revealed challenge
    this.revealedChallengeId = null;

    // Optimistically update stats (we'll reload after backend confirms)
    this.updateStatsOptimistically(outcome);

    // Emit optimistic event
    EventBus.instance.emit(EventBus.EVENTS.CHALLENGE.COMPLETED_SUCCESS, {
      assignmentId,
      challengeId,
      outcome,
      brianMode,
      optimistic: true,
    });

    try {
      // Make the backend call in the background
      await this.markChallengeComplete(assignmentId, challengeId, outcome, brianMode);

      // Backend succeeded - reload stats to get accurate data
      await this.loadPersonalStats();
    } catch (err) {
      // Backend failed - rollback the optimistic update
      console.error("Challenge completion failed, rolling back:", err);

      // Reload the entire challenge list to restore accurate state
      await this.loadChallenges();
      await this.loadPersonalStats();

      // Emit error event
      EventBus.instance.emit(EventBus.EVENTS.CHALLENGE.COMPLETED_ERROR, {
        assignmentId,
        challengeId,
        error: err.message,
        originalError: err,
      });

      this.showError("Failed to mark complete: " + err.message);
    }
  }

  /**
   * Optimistically update stats before backend confirms
   */
  updateStatsOptimistically(outcome) {
    const totalChallenges = document.querySelector('[data-stat="total-challenges"]');
    const completedChallenges = document.querySelector('[data-stat="completed-challenges"]');
    const successRate = document.querySelector('[data-stat="success-rate"]');
    const totalPoints = document.querySelector('[data-stat="total-points"]');

    if (completedChallenges) {
      const current = parseInt(completedChallenges.textContent) || 0;
      completedChallenges.textContent = current + 1;
    }

    if (totalPoints && outcome === "success") {
      const current = parseInt(totalPoints.textContent) || 0;
      totalPoints.textContent = current + 1;
    }

    // Update success rate if we have the data
    if (successRate && completedChallenges && totalPoints) {
      const completed = parseInt(completedChallenges.textContent) || 0;
      const points = parseInt(totalPoints.textContent) || 0;
      if (completed > 0) {
        const rate = Math.round((points / completed) * 100);
        successRate.textContent = `${rate}%`;
      }
    }
  }

  /**
   * Update a specific card after completion without rebuilding the entire list
   */
  updateCardAfterCompletion(assignmentId, outcome, cardElement) {
    if (!cardElement) {
      // Fallback: find the card by assignment ID
      cardElement = document.querySelector(`[data-assignment-id="${assignmentId}"]`);
    }

    if (!cardElement) {
      console.warn(`Could not find card element for assignment ${assignmentId}`);
      // Fallback to full reload if we can't find the card
      this.loadChallenges();
      return;
    }

    // Find the action buttons container
    const actionsContainer = cardElement.querySelector(".challenge-actions");
    if (actionsContainer) {
      // Add fade-out class to trigger animation
      actionsContainer.classList.add("fading-out");

      // Wait for fade-out animation to complete (200ms)
      setTimeout(() => {
        // Update card classes for completed state
        cardElement.className = `challenge-card completed ${outcome}`;

        // Replace action buttons with completion badge
        const badgeHTML =
          outcome === "success"
            ? '<span class="outcome-badge success"><img src="images/green-checkmark.gif" class="icon-gif" alt="checkmark">SUCCESS!</span>'
            : '<span class="outcome-badge failure"><img src="images/failure.gif" class="icon-gif" alt="cross">FAILURE!</span>';

        actionsContainer.outerHTML = badgeHTML;

        // Unlock next challenge card if this was successful
        if (outcome === "success") {
          this.unlockNextChallenge(cardElement);
        }
      }, 200); // Match the fadeOut animation duration
    } else {
      // No actions container, just update classes directly
      cardElement.className = `challenge-card completed ${outcome}`;

      if (outcome === "success") {
        this.unlockNextChallenge(cardElement);
      }
    }
  }

  /**
   * Unlock the next challenge card after a successful completion
   */
  unlockNextChallenge(completedCardElement) {
    // Find the next card in the list
    const nextCard = completedCardElement.nextElementSibling;
    if (
      nextCard &&
      nextCard.classList.contains("challenge-card") &&
      nextCard.classList.contains("locked")
    ) {
      // Remove locked class and add unrevealed class
      nextCard.classList.remove("locked");
      nextCard.classList.add("unrevealed");

      // Update the locked badge to reveal prompt
      const lockedBadge = nextCard.querySelector(".locked-badge");
      if (lockedBadge) {
        lockedBadge.outerHTML =
          '<span class="reveal"><img src="images/reveal.gif" class="icon-gif" alt="detective looking through magnifying glass"> CLICK TO REVEAL <img src="images/reveal.gif" class="icon-gif" alt="detective looking through magnifying glass"></span>';

        // Add click listener for revealing
        nextCard.style.cursor = "pointer";
        nextCard.addEventListener(
          "click",
          () => {
            // Get assignment details from card dataset
            const assignmentId = nextCard.dataset.assignmentId;
            const challengeId = nextCard.dataset.challengeId;
            const brianMode = nextCard.dataset.brianMode;

            if (assignmentId) {
              const eventDetail = {
                assignmentId,
                challengeId,
                brianMode,
                element: nextCard,
              };

              // Emit to global event bus
              EventBus.instance.emit(EventBus.EVENTS.CHALLENGE.REVEAL, eventDetail);
            }
          },
          { once: true }
        ); // Only allow one reveal
      }
    }
  }

  async loadChallenges() {
    const container = document.getElementById("challengesList");
    this.setLoadingState("challengesList", true);

    try {
      const { data, error } = await this.supabase
        .from("assignments")
        .select(
          `
                    id,
                    completed_at,
                    outcome,
                    challenges (id, title, description, brian_mode, success_metric)
                `
        )
        .eq("user_id", this.userId)
        .eq("active", true)
        .order("assigned_at", { ascending: true });

      if (error) throw error;

      // Clear loading state
      this.setLoadingState("challengesList", false);

      if (!data || data.length === 0) {
        container.innerHTML = '<div class="empty">No challenges assigned yet.</div>';
        container.className = "";
        return;
      }

      this.renderChallenges(container, data);
    } catch (err) {
      this.setLoadingState("challengesList", false);
      container.innerHTML = `<div class="empty">Error loading challenges: ${err.message}</div>`;
      container.className = "";
    }
  }

  renderChallenges(container, data) {
    // Preserve scroll position and existing card states
    const existingCards = Array.from(container.querySelectorAll(".challenge-card"));
    const existingCardMap = new Map();

    // Map existing cards by assignment ID
    existingCards.forEach((card) => {
      const assignmentId = card.dataset.assignmentId;
      if (assignmentId) {
        existingCardMap.set(assignmentId, card);
      }
    });

    // Find first incomplete challenge
    const firstIncompleteIndex = data.findIndex((a) => !a.completed_at);

    // Track which cards should exist
    const validAssignmentIds = new Set(data.map((a) => a.id));

    data.forEach((assignment, index) => {
      const isCompleted = !!assignment.completed_at;
      const outcome = assignment.outcome;
      const brianMode = assignment.challenges.brian_mode;
      const isRevealed = this.revealedChallengeId === assignment.id;
      const canReveal = !isCompleted && (firstIncompleteIndex === index || isRevealed);
      const isLocked = !isCompleted && firstIncompleteIndex < index && !isRevealed;

      const state = {
        isCompleted,
        outcome,
        brianMode,
        isRevealed,
        canReveal,
        isLocked,
      };

      const existingCard = existingCardMap.get(assignment.id);

      if (existingCard && this.isSameCardState(existingCard, state)) {
        // Card state unchanged - do nothing (leave in place)
        existingCardMap.delete(assignment.id); // Mark as still valid
      } else if (existingCard) {
        // Card exists but needs update - replace it
        const challengeCard = new ChallengeCard(assignment, index, {
          showActions: true,
          allowReveal: true,
          showBrianMode: true,
          showIndex: true,
        });

        challengeCard.addEventListener("reveal", (e) => {
          this.handleChallengeReveal(e.detail);
        });

        challengeCard.addEventListener("complete", (e) => {
          this.handleChallengeComplete(e.detail);
        });

        const newCard = challengeCard.create(state);
        existingCard.replaceWith(newCard);
        existingCardMap.delete(assignment.id);
      } else {
        // New card needed - append it
        const challengeCard = new ChallengeCard(assignment, index, {
          showActions: true,
          allowReveal: true,
          showBrianMode: true,
          showIndex: true,
        });

        challengeCard.addEventListener("reveal", (e) => {
          this.handleChallengeReveal(e.detail);
        });

        challengeCard.addEventListener("complete", (e) => {
          this.handleChallengeComplete(e.detail);
        });

        const cardElement = challengeCard.create(state);
        container.appendChild(cardElement);
      }
    });

    // Remove cards that no longer exist in data
    existingCardMap.forEach((card, assignmentId) => {
      if (!validAssignmentIds.has(assignmentId)) {
        card.remove();
      }
    });

    // Ensure container has proper class
    container.className = "challenge-list";
  }

  isSameCardState(cardElement, newState) {
    // Check if card state matches to avoid unnecessary re-renders
    const hasCompleted = cardElement.classList.contains("completed");
    const hasRevealed = cardElement.classList.contains("revealed");
    const hasLocked = cardElement.classList.contains("locked");

    return (
      hasCompleted === newState.isCompleted &&
      hasRevealed === newState.isRevealed &&
      hasLocked === newState.isLocked
    );
  }

  /**
   * Render stats data to the DOM with animations
   */
  updateStatsDisplay({ userStats, rank, assignmentStats }) {
    const container = document.getElementById("personalStats");

    const rankEl = container.querySelector('[data-stat="rank"]');
    const pointsEl = container.querySelector('[data-stat="total-points"]');
    const challengesEl = container.querySelector('[data-stat="challenges"]');
    const competitionEl = container.querySelector('[data-stat="competition-points"]');

    if (rankEl) {
      rankEl.textContent = `#${rank}`;
      this.triggerStatAnimation(rankEl);
    }
    if (pointsEl) {
      pointsEl.textContent = userStats.total_points;
      this.triggerStatAnimation(pointsEl);
    }
    if (challengesEl) {
      challengesEl.textContent = `${assignmentStats.totalCompleted}/${assignmentStats.totalAssigned}`;
      this.triggerStatAnimation(challengesEl);
    }
    if (competitionEl) {
      competitionEl.textContent = userStats.competition_points;
      this.triggerStatAnimation(competitionEl);
    }
  }

  renderStatsEmpty() {
    document.getElementById("personalStats").innerHTML =
      '<div class="empty">No stats yet. Complete some challenges!</div>';
  }

  renderStatsError(message) {
    const statsSection = document.getElementById("personalStatsSection");
    const previewContainer = document.getElementById("leaderboardPreview");

    statsSection.style.visibility = "hidden";
    previewContainer.style.visibility = "visible";
    this.showError("Failed to load stats: " + message);
  }

  triggerStatAnimation(element) {
    element.classList.remove("animate");
    void element.offsetWidth;
    element.classList.add("animate");

    const label = element.closest(".stat-box")?.querySelector(".stat-label");
    if (label) {
      label.classList.remove("animate");
      void label.offsetWidth;
      label.classList.add("animate");
    }
  }

  updateStatsValues(container, { userStats, rank, assignmentStats }) {
    // Update only the data values, preserving all HTML structure and images
    const rankEl = container.querySelector('[data-stat="rank"]');
    const pointsEl = container.querySelector('[data-stat="total-points"]');
    const challengesEl = container.querySelector('[data-stat="challenges"]');
    const competitionEl = container.querySelector('[data-stat="competition-points"]');

    if (rankEl) {
      rankEl.textContent = `#${rank}`;
      this.triggerStatAnimation(rankEl);
    }
    if (pointsEl) {
      pointsEl.textContent = userStats.total_points;
      this.triggerStatAnimation(pointsEl);
    }
    if (challengesEl) {
      challengesEl.textContent = `${assignmentStats.totalCompleted}/${assignmentStats.totalAssigned}`;
      this.triggerStatAnimation(challengesEl);
    }
    if (competitionEl) {
      competitionEl.textContent = userStats.competition_points;
      this.triggerStatAnimation(competitionEl);
    }
  }

  triggerStatAnimation(element) {
    // Remove animation class if it exists
    element.classList.remove("animate");

    // Force reflow to restart animation
    void element.offsetWidth;

    // Add animation class
    element.classList.add("animate");

    // Also animate the label
    const label = element.closest(".stat-box")?.querySelector(".stat-label");
    if (label) {
      label.classList.remove("animate");
      void label.offsetWidth;
      label.classList.add("animate");
    }
  }

  cleanup() {
    super.cleanup();

    // Clear refresh interval
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
    }

    // Clean up event listeners
    this.eventCleanup.forEach((cleanup) => cleanup());
    this.eventCleanup = [];

    // Clean up appState event listeners
    if (this.userLoadedCleanup) this.userLoadedCleanup();
    if (this.userErrorCleanup) this.userErrorCleanup();
  }

  async loadCocktailCompetitionStatus() {
    const registerBtn = document.getElementById("registerCocktailBtn");
    const judgingLink = document.getElementById("cocktailJudgingLink");

    try {
      // Get most recent competition
      const { data: competitions, error } = await this.supabase
        .from("cocktail_competitions")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1);

      if (error) throw error;

      if (!competitions || competitions.length === 0) {
        // No competition exists - hide section entirely
        if (registerBtn) registerBtn.style.display = "none";
        return;
      }

      this.activeCompetition = competitions[0];

      // Check if user has already registered
      const { data: entry, error: entryError } = await this.supabase
        .from("cocktail_entries")
        .select("id")
        .eq("competition_id", this.activeCompetition.id)
        .eq("user_id", this.userId)
        .maybeSingle();

      if (entryError) throw entryError;

      // Update button text if user has registered
      if (registerBtn && entry) {
        registerBtn.textContent = "UPDATE COCKTAIL";
      }

      // Show judging link only if voting is open
      if (judgingLink && this.activeCompetition.voting_open) {
        judgingLink.style.display = "block";
      }

      // Trigger fade-in for cocktail buttons after content is set
      setTimeout(() => {
        document.querySelectorAll(".cocktail-button-fade-in").forEach((btn) => {
          btn.classList.add("loaded");
        });
      }, 50); // Small delay to ensure DOM is ready
    } catch (err) {
      console.error("Error loading cocktail competition status:", err);
      // Still fade in buttons even on error
      setTimeout(() => {
        document.querySelectorAll(".cocktail-button-fade-in").forEach((btn) => {
          btn.classList.add("loaded");
        });
      }, 50);
    }
  }
}

export { DashboardPage };
