import { appState } from '../app.js';

class ChallengeCard {
    constructor(assignment, index, options = {}) {
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

        const brianBadge = (brianMode && this.options.showBrianMode)
            ? `<span class="brian-mode-badge">${brianMode === 'vs' ? '⚔️ VS BRIAN' : '🤝 WITH BRIAN'}</span>`
            : '';

        const displayTitle = this.getDisplayTitle(state, brianBadge);
        const displayDescription = this.getDisplayDescription(state);
        const actionsHTML = this.getActionsHTML(state);

        return `
            <div class="challenge-info">
                <div class="challenge-title">${displayTitle}</div>
                ${displayDescription ? `<div class="challenge-description">${displayDescription}</div>` : ''}
            </div>
            ${actionsHTML}
        `;
    }

    getDisplayTitle(state, brianBadge) {
        const { isCompleted, isRevealed } = state;

        if (isCompleted || isRevealed) {
            return `${this.assignment.challenges.title}${brianBadge}`;
        }

        return this.options.showIndex
            ? `Challenge ${this.index + 1}`
            : 'Hidden Challenge';
    }

    getDisplayDescription(state) {
        const { isCompleted, isRevealed } = state;

        if (isCompleted || isRevealed) {
            return this.assignment.challenges.description
                ? `<p>${this.assignment.challenges.description}</p>`
                : '<p>No description</p>';
        }

        return '';
    }

    getActionsHTML(state) {
        const { isCompleted, outcome, isRevealed, canReveal, isLocked } = state;

        if (!this.options.showActions) {
            return this.getStatusBadge(state);
        }

        if (!isCompleted && isRevealed) {
            return `
                <div class="challenge-actions">
                    <button class="success-btn" data-id="${this.assignment.id}" data-outcome="success">
                        ✅ SUCCESS
                    </button>
                    <button class="failure-btn" data-id="${this.assignment.id}" data-outcome="failure">
                        ❌ FAILURE
                    </button>
                </div>
            `;
        }

        return this.getStatusBadge(state);
    }

    getStatusBadge(state) {
        const { isCompleted, outcome, isRevealed, canReveal, isLocked } = state;

        if (isCompleted) {
            return `
                <span class="outcome-badge ${outcome}">
                    ${outcome === 'success' ? '✅ SUCCESS!' : '❌ FAILURE!'}
                </span>
            `;
        } else if (!isCompleted && canReveal && !isRevealed && this.options.allowReveal) {
            return `<span class="reveal"><img src="images/reveal.gif" class="icon-gif" alt="detective looking through magnifying glass"> CLICK TO REVEAL <img src="images/reveal.gif" class="icon-gif"alt="detective looking through magnifying glass"></span>`;
        } else if (isLocked) {
            return `<span class="locked-badge">🔒 LOCKED</span>`;
        }

        return '';
    }

    addEventListeners(card, state) {
        const { isCompleted, canReveal, isRevealed } = state;

        // Click to reveal for unrevealed challenges
        if (!isCompleted && canReveal && !isRevealed && this.options.allowReveal) {
            card.style.cursor = 'pointer';
            card.addEventListener('click', () => {
                this.onReveal?.(this.assignment.id);
            });
        }

        // Action buttons for revealed challenges
        if (isRevealed && this.options.showActions) {
            card.querySelectorAll('button').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const outcome = btn.dataset.outcome;
                    this.onComplete?.(this.assignment.id, this.assignment.challenges.id, outcome, this.assignment.challenges.brian_mode);
                });
            });
        }
    }

    // Callback setters
    setOnReveal(callback) {
        this.onReveal = callback;
        return this;
    }

    setOnComplete(callback) {
        this.onComplete = callback;
        return this;
    }
}

export { ChallengeCard };