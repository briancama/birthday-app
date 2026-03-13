// js/pages/challenges.js
import { BasePage } from "./base-page.js";
import { ChallengeCard } from "../components/challenge-card.js";
import { appState } from "../app.js";
import { featureFlags } from "../utils/feature-flags.js";

class ChallengesPage extends BasePage {
  constructor() {
    super();
    this.challengesContainer = null;
  }

  async onReady() {
    this.setPageTitle("Challenges");
    this.challengesContainer = document.getElementById("challengesList");
    // Respect event flag: don't show challenge controls before event starts
    const started = await featureFlags.isEventStarted(this.supabase).catch(() => false);
    if (!started) {
      if (this.challengesContainer)
        this.challengesContainer.innerHTML =
          '<div class="empty">Challenges will be available once the event starts.</div>';
      return;
    }

    this.wireChallengeTarget();
    await this.loadChallenges();
  }

  async wireChallengeTarget() {
    const input = document.getElementById("challengeTargetInput");
    const btn = document.getElementById("challengeTargetBtn");
    if (!input || !btn) return;

    // Ensure feature flag still true before wiring
    const started = await featureFlags.isEventStarted(this.supabase).catch(() => false);
    if (!started) {
      input.disabled = true;
      btn.disabled = true;
      input.placeholder = "Challenges available once event starts";
      return;
    }

    btn.addEventListener("click", async () => {
      const value = input.value.trim();
      if (!value) return alert("Enter a username or user id to challenge");
      btn.disabled = true;
      btn.textContent = "Sending...";
      try {
        // Resolve identifier to a user id (try username first)
        let targetId = null;
        // If it's a UUID-ish string, try as id
        const uuidRegex =
          /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        if (uuidRegex.test(value)) {
          targetId = value;
        } else {
          const { data: user } = await this.supabase
            .from("users")
            .select("id")
            .eq("username", value)
            .maybeSingle();
          if (user && user.id) targetId = user.id;
        }

        if (!targetId) {
          throw new Error("User not found");
        }

        const resp = await fetch(`/api/users/${targetId}/challenge`, {
          method: "POST",
          credentials: "include",
        });
        if (!resp.ok) {
          const body = await resp.json().catch(() => ({}));
          throw new Error(body.error || resp.statusText || "Request failed");
        }
        this.showSuccessToast("Challenge sent!");
        input.value = "";
      } catch (err) {
        this.showErrorToast("Failed: " + err.message);
      } finally {
        btn.disabled = false;
        btn.textContent = "Challenge";
      }
    });
  }

  async loadChallenges() {
    const container = this.challengesContainer;
    if (!container) return;
    this.setLoadingState("challengesList", true);

    try {
      const { data, error } = await this.supabase
        .from("assignments")
        .select(
          `id, completed_at, outcome, assigned_at, challenges (id, title, description, brian_mode, success_metric)`
        )
        .eq("user_id", this.userId)
        .eq("active", true)
        .order("assigned_at", { ascending: true });

      if (error) throw error;

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
    container.innerHTML = "";
    const firstIncompleteIndex = data.findIndex((a) => !a.completed_at);
    data.forEach((assignment, index) => {
      const isCompleted = !!assignment.completed_at;
      const outcome = assignment.outcome;
      const brianMode = assignment.challenges.brian_mode;
      const isRevealed = false; // keep reveal managed by the page if needed
      const canReveal = !isCompleted && (firstIncompleteIndex === index || isRevealed);
      const isLocked = !isCompleted && firstIncompleteIndex < index && !isRevealed;

      const state = { isCompleted, outcome, brianMode, isRevealed, canReveal, isLocked };

      const challengeCard = new ChallengeCard(assignment, index, {
        showActions: true,
        allowReveal: true,
        showBrianMode: true,
        showIndex: true,
      });

      challengeCard.addEventListener("reveal", (e) => this.handleChallengeReveal(e.detail));
      challengeCard.addEventListener("complete", (e) => this.handleChallengeComplete(e.detail));

      const el = challengeCard.create(state);
      container.appendChild(el);
    });
    container.className = "challenge-list";
  }

  async handleChallengeReveal(detail) {
    // Basic reveal handling: set a local revealed id and reload for simplicity
    this.revealedChallengeId = detail.assignmentId;
    await this.loadChallenges();
  }

  async handleChallengeComplete(detail) {
    try {
      const { assignmentId, challengeId, outcome, button } = detail;
      if (button) {
        button.disabled = true;
        button.textContent = "Processing...";
      }
      await this.markChallengeComplete(assignmentId, challengeId, outcome, detail.brianMode);
      await this.loadChallenges();
      this.showSuccessToast("Challenge recorded");
    } catch (err) {
      this.showErrorToast("Failed to record challenge: " + err.message);
    }
  }
}

export { ChallengesPage };
