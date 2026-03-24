// js/services/challenge-loader.js
// Shared challenge loading logic for dashboard and challenges pages
import { featureFlags } from "../utils/feature-flags.js";
import { getChallengeCardOptions } from "../utils/challenge-state.js";

/**
 * Loads and renders challenges into a container using the provided render function.
 * Handles SSR hydration, feature flags, sorting, and empty/error states.
 * @param {Object} params
 *   - supabase: Supabase client
 *   - userId: User ID
 *   - revealedChallengeId: Currently revealed challenge ID
 *   - container: DOM element to render into
 *   - renderChallengeList: Function to render the challenge list
 *   - onReveal: Reveal handler
 *   - onComplete: Complete handler
 *   - onSwap: (optional) Swap handler
 *   - getServerAssignments: (optional) Function to get SSR assignments (default: window.__SERVER_ASSIGNMENTS__)
 */
export async function loadAndRenderChallenges({
  supabase,
  userId,
  revealedChallengeId = null,
  container,
  renderChallengeList,
  onReveal,
  onComplete,
  onSwap,
  getServerAssignments,
}) {
  // Check if challenges are enabled
  const challengesEnabled = await featureFlags.isChallengesEnabled(supabase);
  if (!container) return;
  // Set loading state if available
  if (typeof this?.setLoadingState === "function") {
    this.setLoadingState("challengesList", true);
  }
  try {
    // SSR hydration logic
    const serverAssignments =
      (typeof getServerAssignments === "function"
        ? getServerAssignments()
        : window.__SERVER_ASSIGNMENTS__) || [];
    if (
      serverAssignments &&
      Array.isArray(serverAssignments) &&
      serverAssignments.length > 0 &&
      !window.__SERVER_ASSIGNMENTS_HYDRATED__
    ) {
      if (challengesEnabled || container.querySelectorAll(".challenge-card").length === 0) {
        if (typeof this?.setLoadingState === "function") {
          this.setLoadingState("challengesList", false);
        }
        renderChallengeList(container, serverAssignments, {
          revealedId: revealedChallengeId,
          onReveal,
          onComplete,
          onSwap,
          cardOptions: getChallengeCardOptions({ challengesEnabled }),
          challengesEnabled,
        });
        window.__SERVER_ASSIGNMENTS_HYDRATED__ = true;
        return;
      }
    }
    // Fetch from DB
    const { data: rawData, error } = await supabase
      .from("assignments")
      .select(
        `id, completed_at, outcome, triggered_at, challenges (id, title, description, brian_mode, success_metric, vs_user, vs_user_profile:users!vs_user(display_name, username))`
      )
      .eq("user_id", userId)
      .eq("active", true)
      .order("assigned_at", { ascending: true });
    if (error) throw error;
    let data = rawData;
    if (data) {
      if (!challengesEnabled) {
        // Completed first, then incomplete (revealed), then dormant
        data = data.slice().sort((a, b) => {
          if (!!a.completed_at !== !!b.completed_at) return a.completed_at ? -1 : 1;
          return 0;
        });
      } else {
        // Default: triggered+incomplete first, then dormant, then completed
        data = data.slice().sort((a, b) => {
          const grp = (r) => (r.completed_at ? 2 : r.triggered_at ? 0 : 1);
          return grp(a) - grp(b);
        });
      }
    }
    if (typeof this?.setLoadingState === "function") {
      this.setLoadingState("challengesList", false);
    }
    if (!data || data.length === 0) {
      container.innerHTML = '<div class="empty">No challenges assigned yet.</div>';
      container.className = "";
      return;
    }
    renderChallengeList(container, data, {
      revealedId: revealedChallengeId,
      onReveal,
      onComplete,
      onSwap,
      cardOptions: getChallengeCardOptions({ challengesEnabled }),
      challengesEnabled,
    });
  } catch (err) {
    if (typeof this?.setLoadingState === "function") {
      this.setLoadingState("challengesList", false);
    }
    container.innerHTML = `<div class="empty">Error loading challenges: ${err.message}</div>`;
    container.className = "";
  }
}
