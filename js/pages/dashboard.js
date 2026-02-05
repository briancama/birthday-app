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
            console.error('❌ Failed to initialize cocktail modal:', err);
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
                    console.error('❌ Modal not initialized');
                    alert('Cocktail modal failed to initialize. Please refresh the page.');
                }
            });
        } else {
            console.error('❌ Register button not found in DOM');
        }
        
        await this.loadPageData();

        // Set up refresh interval for stats only (challenges cause layout shifts)
        if (APP_CONFIG.enableAutoRefresh) {
            this.refreshInterval = setInterval(() => this.loadPersonalStats(), APP_CONFIG.refreshInterval);
        }
    }

    setupEventListeners() {
        // Listen for global challenge events
        const revealCleanup = EventBus.instance.listen(EventBus.EVENTS.CHALLENGE.REVEAL, (e) => {
            this.handleChallengeReveal(e.detail);
        });

        const completeCleanup = EventBus.instance.listen(EventBus.EVENTS.CHALLENGE.COMPLETE, (e) => {
            this.handleChallengeComplete(e.detail);
        });

        // Store cleanup functions for later removal
        this.eventCleanup.push(revealCleanup, completeCleanup);
    }

    handleChallengeReveal(detail) {
        const { assignmentId } = detail;
        this.revealedChallengeId = assignmentId;
        this.loadChallenges();
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

            // Reset revealed challenge and reload data
            this.revealedChallengeId = null;
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

            if (!data || data.length === 0) {
                container.innerHTML = '<div class="empty">No challenges assigned yet.</div>';
                container.className = '';
                return;
            }

            this.renderChallenges(container, data);

        } catch (err) {
            container.innerHTML = `<div class="empty">Error loading challenges: ${err.message}</div>`;
            container.className = '';
        }
    }

    renderChallenges(container, data) {
        container.innerHTML = '';
        container.className = 'challenge-list';

        // Find first incomplete challenge
        const firstIncompleteIndex = data.findIndex(a => !a.completed_at);

        data.forEach((assignment, index) => {
            const isCompleted = !!assignment.completed_at;
            const outcome = assignment.outcome;
            const brianMode = assignment.challenges.brian_mode;
            const isRevealed = this.revealedChallengeId === assignment.id;
            const canReveal = !isCompleted && (firstIncompleteIndex === index || isRevealed);
            const isLocked = !isCompleted && firstIncompleteIndex < index && !isRevealed;

            const challengeCard = new ChallengeCard(assignment, index, {
                showActions: true,
                allowReveal: true,
                showBrianMode: true,
                showIndex: true
            });

            // NEW: Use event listeners instead of callbacks
            challengeCard.addEventListener('reveal', (e) => {
                this.handleChallengeReveal(e.detail);
            });

            challengeCard.addEventListener('complete', (e) => {
                this.handleChallengeComplete(e.detail);
            });

            const state = {
                isCompleted,
                outcome,
                brianMode,
                isRevealed,
                canReveal,
                isLocked
            };

            const cardElement = challengeCard.create(state);
            container.appendChild(cardElement);
        });
    }

    async loadPersonalStats() {
        const container = document.getElementById('personalStats');

        try {
            const { userStats, rank, assignmentStats } = await this.loadUserStats();

            if (!userStats) {
                container.innerHTML = '<div class="empty">No stats yet. Complete some challenges!</div>';
                return;
            }

            // Smart refresh: only update data values, not entire HTML structure
            if (APP_CONFIG.useSmartRefresh && container.querySelector('.stats-grid')) {
                this.updateStatsValues(container, { userStats, rank, assignmentStats });
            } else {
                // Full render for initial load or when smart refresh is disabled
                container.innerHTML = `
                    <div class="stats-grid">
                        <div class="stat-box">
                            <div class="stat-label">YOUR RANK</div>
                            <div class="stat-value" data-stat="rank">#${rank}</div>
                        </div>
                        <div class="stat-box">
                            <div class="stat-label">TOTAL POINTS</div>
                            <div class="stat-value" data-stat="total-points">${userStats.total_points}</div>
                        </div>
                        <div class="stat-box">
                            <div class="stat-label">CHALLENGES</div>
                            <div class="stat-value" data-stat="challenges">${assignmentStats.totalCompleted}/${assignmentStats.totalAssigned}</div>
                        </div>
                        <div class="stat-box">
                            <div class="stat-label">BRODOWN</div>
                            <div class="stat-value" data-stat="competition-points">${userStats.competition_points}</div>
                        </div>
                    </div>
                `;
            }

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
        // Load challenges first to get assignment data, then stats
        await this.loadChallenges();
        await this.loadPersonalStats();
    }
}

export { DashboardPage };