// Shared challenge state logic for both server (Node) and client (browser)
// Pure functions only! No DOM or browser-specific code.

/**
 * Compute the state for a challenge card.
 * @param {Object} assignment - Assignment object from DB
 * @param {Object} opts - Options: { revealedId, challengesEnabled }
 * @returns {Object} State: { isCompleted, outcome, brianMode, isTriggered, isRevealed, canReveal, isLocked, forceReveal, displayTitle }
 */
function computeChallengeState(assignment, opts = {}) {
  const { revealedId = null, challengesEnabled = true, showIndex = true, forceReveal: forceRevealOpt = null, index = 0 } = opts;
  const isCompleted = !!assignment.completed_at;
  const outcome = assignment.outcome;
  const brianMode = assignment.challenges?.brian_mode;
  const isTriggered = !!assignment.triggered_at;
  let isRevealed, canReveal, isLocked;

  // SSR/Client: when challenges are disabled, ALL incomplete challenges are revealed, locked, and have no actions
  let forceReveal = forceRevealOpt;
  if (forceReveal === null) forceReveal = !challengesEnabled && !isCompleted;

  if (forceReveal) {
    isRevealed = true;
    canReveal = false;
    isLocked = true;
  } else {
    isRevealed = revealedId === assignment.id;
    canReveal = !isCompleted && isTriggered;
    isLocked = !isCompleted && !isTriggered;
  }

  // Title logic
  const fullTitle = assignment.challenges?.title || '';
  const hiddenTitle = showIndex ? `Challenge ${index + 1}` : 'Hidden Challenge';
  const displayTitle = (forceReveal || isCompleted || isTriggered) ? fullTitle : hiddenTitle;

  return {
    isCompleted,
    outcome,
    brianMode,
    isTriggered,
    isRevealed,
    canReveal,
    isLocked,
    forceReveal,
    displayTitle,
  };
}


/**
 * Build the options object for challenge card rendering, given global flags.
 * Ensures SSR and hydration use the same logic for forceReveal, showIndex, etc.
 * @param {Object} params - { challengesEnabled: boolean }
 * @returns {Object} options for renderChallengeList/challenge-card
 */
function getChallengeCardOptions({ challengesEnabled }) {
  if (!challengesEnabled) {
    return {
      showActions: false,
      allowReveal: false,
      showBrianMode: true,
      showIndex: false,
      forceReveal: true,
      challengesEnabled: false,
    };
  }
  return {
    showActions: true,
    allowReveal: true,
    showBrianMode: true,
    showIndex: true,
    forceReveal: false,
    challengesEnabled: true,
  };
}

export { computeChallengeState, getChallengeCardOptions };
