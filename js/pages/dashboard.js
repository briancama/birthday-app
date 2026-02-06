import { BasePage } from './base-page.js';
import { ChallengeCard } from '../components/challenge-card.js';
import { CocktailEntryModal } from '../components/cocktail-entry-modal.js';
import { EventBus } from '../events/event-bus.js';
import { APP_CONFIG } from '../app.js';

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
        this.setupEventListeners();
        this.setPageTitle('Dashboard');
        
        // Initialize cocktail entry modal
        try {
            this.cocktailModal = new CocktailEntryModal();
            await this.cocktailModal.init();
            console.log('✅ Cocktail modal initialized successfully');
        } catch (err) {
            console.error('✖️ Failed to initialize cocktail modal:', err);
        }
        
        // Setup cocktail registration button
        const registerBtn = document.getElementById('registerCocktailBtn');
        if (registerBtn) {
            console.log('✅ Found register button, attaching listener');
            registerBtn.addEventListener('click', () => {
                console.log('🎉 Register button clicked');
                if (this.cocktailModal) {
                    this.cocktailModal.open();
                } else {
                    console.error('✖️ Modal not initialized');
                    alert('Cocktail modal failed to initialize. Please refresh the page.');
                }
            });
        } else {
            console.error('✖️ Register button not found in DOM');
        }
        
        await this.loadPageData();

        // Set up refresh interval for stats only (challenges cause layout shifts)
        if (APP_CONFIG.enableAutoRefresh) {
            this.refreshInterval = setInterval(() => this.loadPersonalStats(), APP_CONFIG.refreshInterval);
        }
    }

    setupEventListeners() {
        // Listen for global challenge events
        const revealCleanup = EventBus.instance.listen(EventBus.EVENTS.CHALLENGE.REVEAL, async (e) => {
            await this.handleChallengeReveal(e.detail);
        });

        const completeCleanup = EventBus.instance.listen(EventBus.EVENTS.CHALLENGE.COMPLETE, async (e) => {
            await this.handleChallengeComplete(e.detail);
        });

        // Store cleanup functions for later removal
        this.eventCleanup.push(revealCleanup, completeCleanup);
    }

    async handleChallengeReveal(detail) {
        const { assignmentId, element } = detail;
        
        // Just toggle the revealed state on the card element
        if (element) {
            element.classList.remove('unrevealed');
            element.classList.add('revealed');
            
            // Update the reveal prompt to action buttons
            const actionsContainer = element.querySelector('.challenge-actions, .reveal');
            if (actionsContainer) {
                actionsContainer.outerHTML = `
                    <div class="challenge-actions">
                        <button class="success-btn" data-id="${assignmentId}" data-sound="success" data-outcome="success">
                            <img src="images/green-checkmark.gif" class="icon-gif icon-gif--with-text hide-mobile" alt="checkmark">SUCCESS
                        </button>
                        <button class="failure-btn" data-id="${assignmentId}" data-sound="failure" data-outcome="failure">
                            <img src="images/failure.gif" class="icon-gif icon-gif--with-text hide-mobile" alt="cross">FAILURE
                        </button>
                    </div>
                `;
                
                // Re-attach event listeners to new buttons
                element.querySelectorAll('button').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const outcome = btn.dataset.outcome;
                        const assignmentId = btn.dataset.id;
                        
                        EventBus.instance.emit(EventBus.EVENTS.CHALLENGE.COMPLETE, {
                            assignmentId,
                            challengeId: detail.challengeId,
                            outcome,
                            brianMode: detail.brianMode,
                            button: btn,
                            element: element
                        });
                    });
                });
            }
            
            // Remove the click handler from the card
            element.style.cursor = '';
        }
        
        this.revealedChallengeId = assignmentId;
    }

    async handleChallengeComplete(detail) {
        const { assignmentId, challengeId, outcome, brianMode, button } = detail;

        try {
            // Provide immediate UI feedback
            button.disabled = true;
            button.textContent = 'Processing...';

            // Emit loading event
            EventBus.instance.emit(EventBus.EVENTS.CHALLENGE.LOADING, {
                assignmentId,
                action: 'completing'
            });

            await this.markChallengeComplete(assignmentId, challengeId, outcome, brianMode);

            // Reset revealed challenge
            this.revealedChallengeId = null;
            
            // Update challenges and stats
            await Promise.all([this.loadChallenges(), this.loadPersonalStats()]);

            // Emit success event
            EventBus.instance.emit(EventBus.EVENTS.CHALLENGE.COMPLETED_SUCCESS, {
                assignmentId,
                challengeId,
                outcome,
                brianMode
            });

        } catch (err) {
            // Reset button state on error
            button.disabled = false;
            button.textContent = button.dataset.originalText || 'RETRY';

            // Emit error event
            EventBus.instance.emit(EventBus.EVENTS.CHALLENGE.COMPLETED_ERROR, {
                assignmentId,
                challengeId,
                error: err.message,
                originalError: err
            });

            this.showError('Failed to mark complete: ' + err.message);
        }
    }

    async loadPageData() {
        // Load challenges first to get assignment data, then stats
        await this.loadChallenges();
        await this.loadPersonalStats();
    }

    async loadChallenges() {
        const container = document.getElementById('challengesList');
        this.setLoadingState('challengesList', true);

        try {
            const { data, error } = await this.supabase
                .from('assignments')
                .select(`
                    id,
                    completed_at,
                    outcome,
                    challenges (id, title, description, brian_mode, success_metric)
                `)
                .eq('user_id', this.userId)
                .eq('active', true)
                .order('assigned_at', { ascending: true });

            if (error) throw error;

            // Clear loading state
            this.setLoadingState('challengesList', false);

            if (!data || data.length === 0) {
                container.innerHTML = '<div class="empty">No challenges assigned yet.</div>';
                container.className = '';
                return;
            }

            this.renderChallenges(container, data);

        } catch (err) {
            this.setLoadingState('challengesList', false);
            container.innerHTML = `<div class="empty">Error loading challenges: ${err.message}</div>`;
            container.className = '';
        }
    }

    renderChallenges(container, data) {
        // Preserve scroll position and existing card states
        const existingCards = Array.from(container.querySelectorAll('.challenge-card'));
        const existingCardMap = new Map();
        
        // Map existing cards by assignment ID
        existingCards.forEach(card => {
            const assignmentId = card.dataset.assignmentId;
            if (assignmentId) {
                existingCardMap.set(assignmentId, card);
            }
        });
        
        // Find first incomplete challenge
        const firstIncompleteIndex = data.findIndex(a => !a.completed_at);

        // Track which cards should exist
        const validAssignmentIds = new Set(data.map(a => a.id));
        
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
                isLocked
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
                    showIndex: true
                });

                challengeCard.addEventListener('reveal', (e) => {
                    this.handleChallengeReveal(e.detail);
                });

                challengeCard.addEventListener('complete', (e) => {
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
                    showIndex: true
                });

                challengeCard.addEventListener('reveal', (e) => {
                    this.handleChallengeReveal(e.detail);
                });

                challengeCard.addEventListener('complete', (e) => {
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
        container.className = 'challenge-list';
    }
    
    isSameCardState(cardElement, newState) {
        // Check if card state matches to avoid unnecessary re-renders
        const hasCompleted = cardElement.classList.contains('completed');
        const hasRevealed = cardElement.classList.contains('revealed');
        const hasLocked = cardElement.classList.contains('locked');
        
        return hasCompleted === newState.isCompleted &&
               hasRevealed === newState.isRevealed &&
               hasLocked === newState.isLocked;
    }

    async loadPersonalStats() {
        const container = document.getElementById('personalStats');

        try {
            const { userStats, rank, assignmentStats } = await this.loadUserStats();

            if (!userStats) {
                container.innerHTML = '<div class="empty">No stats yet. Complete some challenges!</div>';
                return;
            }

            // Update only the data values (HTML structure already exists in dashboard.html)
            this.updateStatsValues(container, { userStats, rank, assignmentStats });

        } catch (err) {
            container.innerHTML = `<div class="empty">Error loading stats: ${err.message}</div>`;
        }
    }

    updateStatsValues(container, { userStats, rank, assignmentStats }) {
        // Update only the data values, preserving all HTML structure and images
        const rankEl = container.querySelector('[data-stat="rank"]');
        const pointsEl = container.querySelector('[data-stat="total-points"]');
        const challengesEl = container.querySelector('[data-stat="challenges"]');
        const competitionEl = container.querySelector('[data-stat="competition-points"]');

        if (rankEl) rankEl.textContent = `#${rank}`;
        if (pointsEl) pointsEl.textContent = userStats.total_points;
        if (challengesEl) challengesEl.textContent = `${assignmentStats.totalCompleted}/${assignmentStats.totalAssigned}`;
        if (competitionEl) competitionEl.textContent = userStats.competition_points;
    }

    cleanup() {
        super.cleanup();

        // Clear refresh interval
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
        }

        // Clean up event listeners
        this.eventCleanup.forEach(cleanup => cleanup());
        this.eventCleanup = [];
    }

    async loadPageData() {
        // Load challenges first to get assignment data, then stats and cocktail status
        await this.loadChallenges();
        await this.loadPersonalStats();
        await this.loadCocktailCompetitionStatus();
    }

    async loadCocktailCompetitionStatus() {
        const registerBtn = document.getElementById('registerCocktailBtn');
        const judgingLink = document.getElementById('cocktailJudgingLink');

        try {
            // Get most recent competition
            const { data: competitions, error } = await this.supabase
                .from('cocktail_competitions')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(1);

            if (error) throw error;

            if (!competitions || competitions.length === 0) {
                // No competition exists - hide section entirely
                if (registerBtn) registerBtn.style.display = 'none';
                return;
            }

            this.activeCompetition = competitions[0];

            // Check if user has already registered
            const { data: entry, error: entryError } = await this.supabase
                .from('cocktail_entries')
                .select('id')
                .eq('competition_id', this.activeCompetition.id)
                .eq('user_id', this.userId)
                .maybeSingle();

            if (entryError) throw entryError;

            // Update button text if user has registered
            if (registerBtn && entry) {
                registerBtn.textContent = 'UPDATE COCKTAIL';
            }

            // Show judging link only if voting is open
            if (judgingLink && this.activeCompetition.voting_open) {
                judgingLink.style.display = 'block';
            }

        } catch (err) {
            console.error('Error loading cocktail competition status:', err);
        }
    }
}

export { DashboardPage };