// js/pages/challenges.js
import { BasePage } from "./base-page.js";
import { ChallengeCard } from "../components/challenge-card.js";
import { appState } from "../app.js";
import { createCharacterSelect } from "../components/character-select.js";
import { audioManager } from "../utils/audio.js";
import { EventBus } from "../events/event-bus.js";
import { renderChallengeList } from "../components/challenge-list.js";
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

    // Optional: example integration hook for character selector
    // Preload short SFX used on this page so Start plays promptly
    try {
      audioManager.preload("sf_choose", "/audio/sf_choose.mp3", false);
      // Preload the larger player-select SFX only on this page
      audioManager.preload("sf_player-select", "/audio/sf_player-select.mp3", false);
    } catch (e) {
      // ignore preload errors
    }

    this.initCharacterSelector();
    await this.loadChallenges();
  }

  // Example: initialize a character selector if a container exists.
  async initCharacterSelector() {
    const container = document.getElementById("characterSelectContainer");
    if (!container) return;

    // Prefer fetching real participant users from Supabase; fallback to embedded JSON
    let characters = [];
    try {
      if (this.supabase) {
        const { data: users, error } = await this.supabase
          .from("users")
          .select("id, username, display_name, headshot")
          .eq("user_type", "participant")
          .order("display_name", { ascending: true });
        if (!error && users && users.length) {
          characters = users.map((u) => ({
            id: u.id,
            name: u.display_name || u.username || "Player",
            image: u.headshot || "/images/headshot.jpg",
          }));
        }
      }
    } catch (err) {
      // ignore and fallback to DOM data-attributes
    }

    if (!characters || characters.length === 0) {
      try {
        const json = container.getAttribute("data-characters");
        if (json) characters = JSON.parse(json);
      } catch (e) {
        // ignore
      }
    }

    // Fetch active challenge counts so at-cap players are shown as busy
    let activeCounts = {};
    let incompleteCounts = {};
    try {
      const resp = await fetch("/api/users/active-challenge-counts", { credentials: "include" });
      if (resp.ok) {
        const body = await resp.json();
        activeCounts = body.counts || {};
        incompleteCounts = body.incompleteCounts || {};
      }
    } catch (e) {
      // ignore — selector will show all players as available
    }

    const selector = createCharacterSelect({ characters, size: 180, columns: 4, gap: 12, activeCounts, incompleteCounts });

    // Track selection on the page and show confirmation overlay
    this.selectedCharacter = null;
    const mapContainer =
      document.querySelector(".character-select__map-container") ||
      container.parentElement ||
      container;

    // Intro overlay Start handling: plays sf_choose then fades overlay and plays sf_perfect
    const introOverlay = document.querySelector(".character-select__intro-overlay");
    if (introOverlay) {
      const introStart = introOverlay.querySelector(".character-select__intro-start");
      if (introStart) {
        introStart.addEventListener("click", (ev) => {
          // Ensure audio subsystem initialized for mobile
          audioManager.initialize();
          // Play choose sound (global click handlers may also play via data-sound)
          audioManager.play("sf_choose");
          // Fade overlay out, then play perfect
          introOverlay.classList.add("fade-out");
          setTimeout(() => {
            introOverlay.style.display = "none";
            // Play the larger player-select here on Start
            try {
              audioManager.play("sf_player-select");
            } catch (e) {
              /* ignore */
            }
          }, 420);
        });
      }
    }

    // Create or reuse overlay element
    let overlay = mapContainer.querySelector(".character-confirm-overlay");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.className = "character-confirm-overlay";
      overlay.innerHTML = `
            <div class="character-confirm__info">
              <div class="character-confirm__name"></div>
                <button class="character-confirm__start btn btn-primary" data-sound="sf_perfect">Fight!</button>
            </div>
          `;
      mapContainer.appendChild(overlay);
    }

    const nameEl = overlay.querySelector(".character-confirm__name");
    const startBtn = overlay.querySelector(".character-confirm__start");
    overlay.style.display = "none";

    selector.addEventListener("character:selected", (e) => {
      const { id, name } = e.detail;
      this.selectedCharacter = { id, name };
      // show overlay with selected name
      nameEl.textContent = name || id || "Player";
      overlay.style.display = "flex";
    });

    startBtn.addEventListener("click", async () => {
      if (!this.selectedCharacter || !this.selectedCharacter.id) return;
      startBtn.disabled = true;
      startBtn.textContent = "Starting...";
      try {
        await this.performChallenge(this.selectedCharacter.id);
        // performChallenge emits a ui:toast and notification:created; just hide overlay
        overlay.style.display = "none";
      } catch (err) {
        this.showErrorToast("Failed to send challenge: " + err.message);
      } finally {
        startBtn.disabled = false;
        startBtn.textContent = "Fight!";
      }
    });

    container.innerHTML = "";
    container.appendChild(selector);
  }

  // Send challenge POST to server for selected target id
  async performChallenge(targetId) {
    if (!targetId) throw new Error("No target specified");
    const resp = await fetch(`/api/users/${encodeURIComponent(targetId)}/challenge`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
    });
    const body = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      throw new Error(body.error || resp.statusText || "Request failed");
    }

    // Notify other components/pages about the new notification so UI can update
    try {
      if (body && body.notification) {
        EventBus.instance.emit("notification:created", { notification: body.notification });
      }
      // If the server awarded an achievement (social_butterfly etc.), surface the toast.
      // Awarding already happened server-side — this is UI-only.
      if (body && body.achievement) {
        EventBus.instance.emit("achievement:awarded", {
          userId: this.userId,
          achievementKey: body.achievement.key,
          name: body.achievement.name,
          points: body.achievement.points,
        });
      }
      EventBus.instance.emit("ui:toast", {
        type: "success",
        message: "Notification sent!",
      });
    } catch (e) {
      // Ignore EventBus failures
    }

    return body;
  }

  // Deprecated: challenge via text input removed — selector-only flow

  async loadChallenges() {
    const container = this.challengesContainer;
    if (!container) return;
    this.setLoadingState("challengesList", true);

    try {
      const { data: rawData, error } = await this.supabase
        .from("assignments")
        .select(
          `id, completed_at, outcome, assigned_at, triggered_at, challenges (id, title, description, brian_mode, success_metric, vs_user, vs_user_profile:users!vs_user(display_name, username))`
        )
        .eq("user_id", this.userId)
        .eq("active", true)
        .order("assigned_at", { ascending: true });

      if (error) throw error;

      // Sort: triggered+incomplete first, then dormant, then completed
      const data = rawData
        ? rawData.slice().sort((a, b) => {
            const grp = (r) => r.completed_at ? 2 : r.triggered_at ? 0 : 1;
            return grp(a) - grp(b);
          })
        : rawData;

      this.setLoadingState("challengesList", false);

      if (!data || data.length === 0) {
        container.innerHTML = '<div class="empty">No one has challenged you yet!</div>';
        container.className = "";
        return;
      }

      renderChallengeList(container, data, {
        revealedId: this.revealedChallengeId,
        onReveal: (detail) => this.handleChallengeReveal(detail),
        onComplete: (detail) => this.handleChallengeComplete(detail),
        onSwap: (detail) => this.handleChallengeSwap(detail),
        cardOptions: { showActions: true, allowReveal: true, showBrianMode: true, showIndex: true },
      });
    } catch (err) {
      this.setLoadingState("challengesList", false);
      container.innerHTML = `<div class="empty">Error loading challenges: ${err.message}</div>`;
      container.className = "";
    }
  }

  // Render handled by shared `renderChallengeList` component

  async handleChallengeReveal(detail) {
    const { assignmentId, element } = detail;

    // If the card element is provided, perform an in-place reveal to avoid full reload
    if (element) {
      try {
        element.classList.remove("unrevealed");
        element.classList.add("revealed");

          const actionsContainer = element.querySelector(".challenge-actions, .reveal-actions, .reveal");
        if (actionsContainer) {
          const challengeId = element.dataset.challengeId;
          const brianMode = element.dataset.brianMode || "";
          const vsUser = element.dataset.vsUser || null;

          actionsContainer.outerHTML = `
            <div class="challenge-actions">
              <button class="success-btn" data-id="${assignmentId}" data-challenge-id="${challengeId}" data-brian-mode="${brianMode}" data-vs-user="${vsUser || ""}" data-sound="success" data-outcome="success">
                <img src="/images/green-checkmark.gif" class="icon-gif icon-gif--with-text hide-mobile" alt="checkmark">SUCCESS
              </button>
              <button class="failure-btn" data-id="${assignmentId}" data-challenge-id="${challengeId}" data-brian-mode="${brianMode}" data-vs-user="${vsUser || ""}" data-sound="failure" data-outcome="failure">
                <img src="/images/failure.gif" class="icon-gif icon-gif--with-text hide-mobile" alt="cross">FAILURE
              </button>
              <button class="swap-btn" data-action="swap" data-id="${assignmentId}" title="Swap this challenge for a different one">⇄ SWAP</button>
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
              const vsUser = btn.dataset.vsUser || null;

              if (btn.dataset.action === "swap") {
                EventBus.instance.emit(EventBus.EVENTS.CHALLENGE.SWAP, {
                  assignmentId,
                  element,
                  button: btn,
                });
                // Also call directly — challenges.js has no EventBus SWAP listener
                try {
                  this.handleChallengeSwap({ assignmentId, element, button: btn });
                } catch (err) {
                  console.warn("handleChallengeSwap error:", err);
                }
                return;
              }

              const detail = {
                assignmentId,
                challengeId,
                outcome,
                brianMode,
                vsUser,
                button: btn,
                element,
              };
              // Emit global event
              EventBus.instance.emit(EventBus.EVENTS.CHALLENGE.COMPLETE, detail);
              // Also call page handler directly so this page responds immediately
              try {
                this.handleChallengeComplete(detail);
              } catch (err) {
                console.warn("handleChallengeComplete error:", err);
              }
            });
          });
        }

        // Remove pointer cursor
        element.style.cursor = "";
      } catch (err) {
        console.warn("In-place reveal failed, falling back to full reload", err);
        this.revealedChallengeId = assignmentId;
        await this.loadChallenges();
        return;
      }
    } else {
      // No element provided — fall back to previous behavior
      this.revealedChallengeId = detail.assignmentId;
      await this.loadChallenges();
      return;
    }

    this.revealedChallengeId = assignmentId;
  }

  async handleChallengeSwap({ assignmentId, button }) {
    if (button) {
      button.disabled = true;
      button.textContent = "...";
    }
    try {
      const res = await fetch(`/api/assignments/${assignmentId}/swap`, {
        method: "POST",
        credentials: "include",
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Swap failed");

      // Two cards changed — reload the whole list
      this.revealedChallengeId = null;
      await this.loadChallenges();
    } catch (err) {
      console.error("Challenge swap failed:", err);
      if (button) {
        button.disabled = false;
        button.textContent = "\u21c4 SWAP";
      }
      this.showErrorToast(err.message || "Failed to swap challenge");
    }
  }

  async handleChallengeComplete(detail) {
    try {
      const { assignmentId, challengeId, outcome, button } = detail;
      if (button) {
        button.disabled = true;
        button.textContent = "Processing...";
      }
      await this.markChallengeComplete(
        assignmentId,
        challengeId,
        outcome,
        detail.brianMode,
        detail.vsUser
      );
      await this.loadChallenges();
      this.showSuccessToast("Challenge recorded");
    } catch (err) {
      this.showErrorToast("Failed to record challenge: " + err.message);
    }
  }
}

export { ChallengesPage };
