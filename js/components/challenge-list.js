import { ChallengeCard } from "./challenge-card.js";

/**
 * Render or update a list of assignment challenge cards into `container`.
 * Options:
 * - revealedId: assignment id that should be shown as revealed
 * - onReveal(detail): handler when card emits reveal
 * - onComplete(detail): handler when card emits complete
 * - cardOptions: options passed to ChallengeCard constructor
 */
export function renderChallengeList(container, data, options = {}) {
  if (!container) return;
  const {
    revealedId = null,
    onReveal = () => {},
    onComplete = () => {},
    cardOptions = {},
  } = options;

  // Preserve scroll position and existing card states
  const existingCards = Array.from(container.querySelectorAll(".challenge-card"));
  const existingCardMap = new Map();
  existingCards.forEach((card) => {
    const assignmentId = card.dataset.assignmentId;
    if (assignmentId) existingCardMap.set(assignmentId, card);
  });

  const validAssignmentIds = new Set(data.map((a) => a.id));

  data.forEach((assignment, index) => {
    const isCompleted = !!assignment.completed_at;
    const outcome = assignment.outcome;
    const brianMode = assignment.challenges.brian_mode;
    const isTriggered = !!assignment.triggered_at;
    const isRevealed = revealedId === assignment.id;
    // Any triggered incomplete challenge is revealable; dormant ones are locked
    const canReveal = !isCompleted && isTriggered;
    const isLocked = !isCompleted && !isTriggered;

    const state = { isCompleted, outcome, brianMode, isRevealed, canReveal, isLocked };

    const existingCard = existingCardMap.get(assignment.id);

    if (existingCard && isSameCardState(existingCard, state)) {
      existingCardMap.delete(assignment.id);
    } else if (existingCard) {
      const challengeCard = new ChallengeCard(assignment, index, cardOptions);
      challengeCard.addEventListener("reveal", (e) => onReveal(e.detail));
      challengeCard.addEventListener("complete", (e) => onComplete(e.detail));
      const newCard = challengeCard.create(state);
      existingCard.replaceWith(newCard);
      existingCardMap.delete(assignment.id);
    } else {
      const challengeCard = new ChallengeCard(assignment, index, cardOptions);
      challengeCard.addEventListener("reveal", (e) => onReveal(e.detail));
      challengeCard.addEventListener("complete", (e) => onComplete(e.detail));
      const el = challengeCard.create(state);
      container.appendChild(el);
    }
  });

  existingCardMap.forEach((card, assignmentId) => {
    if (!validAssignmentIds.has(assignmentId)) card.remove();
  });

  // Ensure container has the challenge-list class without clobbering other classes
  try {
    container.classList.add("challenge-list");
  } catch (e) {
    container.className = "challenge-list";
  }

  // Do not alter scroll position; updates should not move the viewport
}

function isSameCardState(cardElement, newState) {
  const hasCompleted = cardElement.classList.contains("completed");
  const hasRevealed = cardElement.classList.contains("revealed");
  const hasLocked = cardElement.classList.contains("locked");
  return (
    hasCompleted === newState.isCompleted &&
    hasRevealed === newState.isRevealed &&
    hasLocked === newState.isLocked
  );
}

export { isSameCardState };
