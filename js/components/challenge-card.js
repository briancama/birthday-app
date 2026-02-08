import { appState } from '../app.js';
import { EventBus } from '../events/event-bus.js';
import { formatAndEscapeText } from '../utils/text-format.js';

class ChallengeCard extends EventTarget {
    constructor(assignment, index, options = {}) {
        super(); // Call EventTarget constructor

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
        card.dataset.assignmentId = this.assignment.id; // Add data attribute for tracking
        card.dataset.challengeId = this.assignment.challenges.id; // Store challenge ID
        card.dataset.brianMode = this.assignment.challenges.brian_mode || ''; // Store brian mode
        card.innerHTML = this.getCardHTML(state);
        this.addEventListeners(card, state);

        return card;
    }

    getCardHTML(state) {
        const { isCompleted, outcome, brianMode, isRevealed, canReveal, isLocked } = state;

        const brianBadge = (brianMode && this.options.showBrianMode)
            ? `<span class="brian-mode-badge">${brianMode === 'vs' ? '<img src="images/vs.gif" class="icon-gif" alt="VS Brian">' : '<img src="images/with.gif" class="icon-gif" alt="With Brian">'}</span>`
            : '';

        // Always include full title and description, just hide with CSS
        const fullTitle = `${this.assignment.challenges.title}`;
        const hiddenTitle = this.options.showIndex ? `Challenge ${this.index + 1}` : 'Hidden Challenge';

        const displayDescription = this.getFullDescription();
        const actionsHTML = this.getActionsHTML(state);

        return `
            <div class="challenge-info">
                <div class="challenge-title">
                    <span class="title-hidden">${hiddenTitle}</span>
                    <span class="title-revealed">${fullTitle}</span>
                    ${brianBadge}
                </div>
                <div class="challenge-description">${displayDescription}</div>
            </div>
            ${actionsHTML}
        `;
    }

    getFullDescription() {
        // Always render full description - CSS will control visibility
        let html = '';

        // Add description - format text to preserve spacing and line breaks
        if (this.assignment.challenges.description) {
            const formattedDesc = formatAndEscapeText(this.assignment.challenges.description);
            console.log('Formatted Description:', formattedDesc); // Debug log to verify formatting
            html += `<p>${formattedDesc}</p>`;
        }

        // Add success metric if it exists - format text for display
        if (this.assignment.challenges.success_metric) {
            const formattedMetric = formatAndEscapeText(this.assignment.challenges.success_metric);
            html += `<details class="success-metric">
                <summary><strong>Success Metric</strong></summary>
                <p>${formattedMetric}</p>
            </details>`;
        }

        return html || '<p>No description</p>';
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
                <button class="success-btn" data-id="${this.assignment.id}" data-sound="success" data-outcome="success">
                    <img src="images/green-checkmark.gif" class="icon-gif icon-gif--with-text hide-mobile" alt="checkmark">SUCCESS
                </button>
                <button class="failure-btn" data-id="${this.assignment.id}" data-sound="failure" data-outcome="failure">
                    <img src="images/failure.gif" class="icon-gif icon-gif--with-text hide-mobile" alt="cross">FAILURE
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
     * Update the card state without recreating the entire DOM structure
     */
    updateState(newState, element = null) {
        const card = element || document.querySelector(`[data-assignment-id="${this.assignment.id}"]`);
        if (!card) {
            console.warn(`Card not found for assignment ${this.assignment.id}`);
            return;
        }

        const { isCompleted, outcome, isRevealed } = newState;

        // Update CSS classes for visual state
        card.className = 'challenge-card';
        if (isCompleted) {
            card.className += ` completed ${outcome}`;
        } else if (isRevealed) {
            card.className += ' revealed';
        }

        // Update the actions section (buttons -> badge)
        const actionsContainer = card.querySelector('.challenge-actions, .outcome-badge, .reveal, .locked-badge');
        if (actionsContainer) {
            if (isCompleted) {
                // Replace action buttons with completion badge
                actionsContainer.outerHTML = this.getCompletedBadge(outcome);
            }
        }

        // Update visibility of title and description if moving from hidden to revealed
        if (isRevealed) {
            this.showRevealedContent(card);
        }

        return card;
    }

    /**
     * Show revealed content using CSS visibility changes
     */
    showRevealedContent(card) {
        const hiddenTitle = card.querySelector('.title-hidden');
        const revealedTitle = card.querySelector('.title-revealed');
        const description = card.querySelector('.challenge-description');

        if (hiddenTitle) hiddenTitle.style.display = 'none';
        if (revealedTitle) revealedTitle.style.display = 'inline';
        if (description) description.style.display = 'block';
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