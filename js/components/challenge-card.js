import { appState } from '../app.js';
import { EventBus } from '../events/event-bus.js';

class ChallengeCard {
    constructor(assignment, index, options = {}) {
        // Add EventTarget capabilities for event emission
        Object.assign(this, EventTarget.prototype);
        EventTarget.call(this);

        this.assignment = assignment;
        this.index = index;
        this.options = {
            showActions: true,
            allowReveal: true,
            showBrianMode: true,
            showIndex: true,
            ...options
        };
        this.supabase = appState.getSupabase();
        this.userId = appState.getUserId();

        // Legacy callback support for backward compatibility
        this.onReveal = null;
        this.onComplete = null;
    }

    create(state) {
        const { isCompleted, outcome, brianMode, isRevealed, canReveal, isLocked } = state;

        const card = document.createElement('div');
        let cardClass = 'challenge-card';

        if (isCompleted) {
            cardClass += ` completed ${outcome}`;
        } else if (isLocked) {
            cardClass += ' locked';
        } else if (isRevealed) {
            cardClass += ' revealed';
        } else if (canReveal) {
            cardClass += ' unrevealed';
        }

        card.className = cardClass;
        card.innerHTML = this.getCardHTML(state);
        this.addEventListeners(card, state);

        return card;
    }

    getCardHTML(state) {
        const { isCompleted, outcome, brianMode, isRevealed, canReveal, isLocked } = state;

        const brianBadge = (brianMode && this.options.showBrianMode && (isCompleted || isRevealed))
            ? `<span class="brian-mode-badge">${brianMode === 'vs' ? '<img src="images/vs.gif" class="icon-gif" alt="VS Brian">' : '<img src="images/with.gif" class="icon-gif" alt="With Brian">'}</span>`
            : '';

        const displayTitle = this.getDisplayTitle(state, brianBadge);
        const displayDescription = this.getDisplayDescription(state);
        const actionsHTML = this.getActionsHTML(state);

        return `
            <div class="challenge-info">
                <div class="challenge-title">${displayTitle}${brianBadge}</div>
                ${displayDescription ? `<div class="challenge-description">${displayDescription}</div>` : ''}
            </div>
            ${actionsHTML}
        `;
    }

    getDisplayTitle(state, brianBadge) {
        const { isCompleted, isRevealed } = state;

        if (isCompleted || isRevealed) {
            return `${this.assignment.challenges.title}`;
        }

        return this.options.showIndex
            ? `Challenge ${this.index + 1}`
            : 'Hidden Challenge';
    }

    getDisplayDescription(state) {
        const { isCompleted, isRevealed } = state;

        if (isCompleted || isRevealed) {
            let html = '';
            
            // Add description
            if (this.assignment.challenges.description) {
                html += `<p>${this.assignment.challenges.description}</p>`;
            }
            
            // Add success metric if it exists
            if (this.assignment.challenges.success_metric) {
                html += `<details class="success-metric">
                    <summary><strong>Success Metric</strong></summary>
                    <p>${this.assignment.challenges.success_metric}</p>
                </details>`;
            }
            
            return html || '<p>No description</p>';
        }

        return '';
    }

    getActionsHTML(state) {
        const { isCompleted, outcome, isRevealed, canReveal, isLocked } = state;

        if (!this.options.showActions) {
            return this.getStatusBadge(state);
        }

        if (isCompleted) {
            return this.getCompletedBadge(outcome);
        } else if (!isCompleted && isRevealed) {
            return this.getActionButtons();
        } else if (!isCompleted && canReveal && !isRevealed && this.options.allowReveal) {
            return this.getRevealPrompt();
        } else if (isLocked) {
            return this.getLockedBadge();
        }

        return '';
    }

    getStatusBadge(state) {
        const { isCompleted, outcome, isRevealed, canReveal, isLocked } = state;

        if (isCompleted) {
            return this.getCompletedBadge(outcome);
        } else if (!isCompleted && canReveal && !isRevealed && this.options.allowReveal) {
            return this.getRevealPrompt();
        } else if (isLocked) {
            return this.getLockedBadge();
        }

        return '';
    }

    // Shared template builders
    getCompletedBadge(outcome) {
        return `
            <span class="outcome-badge ${outcome}">
                ${outcome === 'success' ? '<img src="images/green-checkmark.gif" class="icon-gif" alt="checkmark">SUCCESS!' : '<img src="images/failure.gif" class="icon-gif" alt="cross">FAILURE!'}
            </span>
        `;
    }

    getActionButtons() {
        return `
            <div class="challenge-actions">
                <button class="success-btn" data-id="${this.assignment.id}" data-outcome="success">
                    <img src="images/green-checkmark.gif" class="icon-gif" alt="checkmark">SUCCESS
                </button>
                <button class="failure-btn" data-id="${this.assignment.id}" data-outcome="failure">
                    <img src="images/failure.gif" class="icon-gif" alt="cross">FAILURE
                </button>
            </div>
        `;
    }

    getRevealPrompt() {
        return `<span class="reveal"><img src="images/reveal.gif" class="icon-gif" alt="detective looking through magnifying glass"> CLICK TO REVEAL <img src="images/reveal.gif" class="icon-gif"alt="detective looking through magnifying glass"></span>`;
    }

    getLockedBadge() {
        return `<span class="locked-badge">🔒 LOCKED</span>`;
    }

    addEventListeners(card, state) {
        const { isCompleted, canReveal, isRevealed } = state;

        // Click to reveal for unrevealed challenges
        if (!isCompleted && canReveal && !isRevealed && this.options.allowReveal) {
            card.style.cursor = 'pointer';
            card.addEventListener('click', () => {
                const eventDetail = {
                    assignmentId: this.assignment.id,
                    challengeId: this.assignment.challenges.id,
                    element: card,
                    component: this
                };

                // Emit new event
                this.dispatchEvent(new CustomEvent('reveal', {
                    detail: eventDetail,
                    bubbles: true
                }));

                // Also emit to global event bus
                EventBus.instance.emit(EventBus.EVENTS.CHALLENGE.REVEAL, eventDetail);

                // Legacy callback support
                this.onReveal?.(this.assignment.id);
            });
        }

        // Action buttons for revealed challenges
        if (isRevealed && this.options.showActions) {
            card.querySelectorAll('button').forEach(btn => {
                // Store original text for error recovery
                btn.dataset.originalText = btn.textContent;

                btn.addEventListener('click', (e) => {
                    e.stopPropagation();

                    const outcome = btn.dataset.outcome;
                    const eventDetail = {
                        assignmentId: this.assignment.id,
                        challengeId: this.assignment.challenges.id,
                        outcome,
                        brianMode: this.assignment.challenges.brian_mode,
                        element: card,
                        button: btn,
                        component: this
                    };

                    // Emit new event
                    this.dispatchEvent(new CustomEvent('complete', {
                        detail: eventDetail,
                        bubbles: true
                    }));

                    // Also emit to global event bus
                    EventBus.instance.emit(EventBus.EVENTS.CHALLENGE.COMPLETE, eventDetail);

                    // Legacy callback support
                    this.onComplete?.(this.assignment.id, this.assignment.challenges.id, outcome, this.assignment.challenges.brian_mode);
                });
            });
        }
    }

    // Callback setters - DEPRECATED: Use addEventListener instead
    setOnReveal(callback) {
        console.warn('ChallengeCard.setOnReveal() is deprecated. Use addEventListener("reveal", handler) instead.');
        this.onReveal = callback;
        return this;
    }

    setOnComplete(callback) {
        console.warn('ChallengeCard.setOnComplete() is deprecated. Use addEventListener("complete", handler) instead.');
        this.onComplete = callback;
        return this;
    }

    /**
     * Cleanup method to remove event listeners and prevent memory leaks
     */
    cleanup() {
        // Remove any event listeners if needed
        // This will be important if we store references to DOM elements
    }
}

export { ChallengeCard };