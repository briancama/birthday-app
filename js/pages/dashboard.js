import { BasePage } from './base-page.js';
import { ChallengeCard } from '../components/challenge-card.js';
import { APP_CONFIG } from '../config.js';

class DashboardPage extends BasePage {
    constructor() {
        super();
        this.revealedChallengeId = null;
        this.refreshInterval = null;
    }

    async onReady() {
        this.setPageTitle('Dashboard');
        await this.loadPageData();

        // Set up refresh interval (disabled in dev mode for easier inspection)
        if (APP_CONFIG.enableAutoRefresh) {
            this.refreshInterval = setInterval(() => this.loadPersonalStats(), APP_CONFIG.refreshInterval);
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

            // Set up callbacks
            challengeCard
                .setOnReveal((assignmentId) => {
                    this.revealedChallengeId = assignmentId;
                    this.loadChallenges();
                })
                .setOnComplete(async (assignmentId, challengeId, outcome, brianMode) => {
                    try {
                        await this.markChallengeComplete(assignmentId, challengeId, outcome, brianMode);

                        // Reset revealed challenge and reload data
                        this.revealedChallengeId = null;
                        await Promise.all([this.loadChallenges(), this.loadPersonalStats()]);

                    } catch (err) {
                        this.showError('Failed to mark complete: ' + err.message);
                    }
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

            container.innerHTML = `
                <div class="stats-grid">
                    <div class="stat-box">
                        <div class="stat-label">YOUR RANK</div>
                        <div class="stat-value">#${rank}</div>
                    </div>
                    <div class="stat-box">
                        <div class="stat-label">TOTAL POINTS</div>
                        <div class="stat-value">${userStats.total_points}</div>
                    </div>
                    <div class="stat-box">
                        <div class="stat-label">CHALLENGES</div>
                        <div class="stat-value">${assignmentStats.totalCompleted}/${assignmentStats.totalAssigned}</div>
                    </div>
                    <div class="stat-box">
                        <div class="stat-label">BRODOWN</div>
                        <div class="stat-value">${userStats.competition_points}</div>
                    </div>
                </div>
            `;

        } catch (err) {
            container.innerHTML = `<div class="empty">Error loading stats: ${err.message}</div>`;
        }
    }

    cleanup() {
        super.cleanup();
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
        }
    }
}

export { DashboardPage };