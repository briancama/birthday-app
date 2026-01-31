import { appState } from '../app.js';

class BasePage {
    constructor() {
        this.supabase = appState.getSupabase();
        this.userId = appState.getUserId();
        this.currentUser = appState.getCurrentUser();
        this.unsubscribe = null;
    }

    async init() {
        // Subscribe to app state changes
        this.unsubscribe = appState.subscribe((event, data) => {
            this.handleStateChange(event, data);
        });

        // Wait for app state to be ready
        if (!this.currentUser) {
            // Wait for user to be loaded
            return new Promise((resolve) => {
                const checkUser = () => {
                    if (appState.getCurrentUser()) {
                        this.currentUser = appState.getCurrentUser();
                        this.userId = appState.getUserId();
                        resolve();
                    } else {
                        setTimeout(checkUser, 100);
                    }
                };
                checkUser();
            }).then(() => this.onReady());
        } else {
            return this.onReady();
        }
    }

    handleStateChange(event, data) {
        switch (event) {
            case 'user-loaded':
                this.currentUser = data;
                this.userId = data.id;
                this.onUserLoaded?.(data);
                break;
            default:
                this.onStateChange?.(event, data);
        }
    }

    async onReady() {
        // Override in child classes
        console.log('Page ready');
    }

    setPageTitle(title) {
        const user = appState.getCurrentUser();
        const fullTitle = user && title === 'Dashboard' 
            ? `${user.name}'s ${title}` 
            : title;
        document.title = `${fullTitle} - Birthday Challenge Zone`;
    }

    // Challenge management methods that can be shared
    async markChallengeComplete(assignmentId, challengeId, outcome, brianMode) {
        try {
            const now = new Date().toISOString();

            // Update user's assignment with outcome
            const { error: updateError } = await this.supabase
                .from('assignments')
                .update({ completed_at: now, outcome: outcome })
                .eq('id', assignmentId);

            if (updateError) throw updateError;

            // Handle Brian challenges
            if (brianMode) {
                await this.handleBrianChallenge(challengeId, outcome, brianMode, now);
            }

            return true;
        } catch (err) {
            console.error('Error marking challenge complete:', err);
            throw err;
        }
    }

    async handleBrianChallenge(challengeId, outcome, brianMode, completedAt) {
        // Get brianc's user_id
        const { data: briancUser, error: briancError } = await this.supabase
            .from('users')
            .select('id')
            .eq('username', 'brianc')
            .single();

        if (briancError) throw briancError;

        let briancOutcome;
        if (brianMode === 'with') {
            briancOutcome = outcome;
        } else if (brianMode === 'vs') {
            briancOutcome = outcome === 'success' ? 'failure' : 'success';
        }

        // Create or update brianc's assignment
        const { error: briancAssignError } = await this.supabase
            .from('assignments')
            .upsert([{
                user_id: briancUser.id,
                challenge_id: challengeId,
                completed_at: completedAt,
                outcome: briancOutcome
            }], {
                onConflict: 'user_id,challenge_id'
            });

        if (briancAssignError) throw briancAssignError;
    }

    async loadUserStats() {
        try {
            const [scoreboardData, assignmentData] = await Promise.all([
                this.supabase.from('scoreboard').select('*'),
                this.supabase.from('assignments').select('id, completed_at').eq('user_id', this.userId)
            ]);

            if (scoreboardData.error) throw scoreboardData.error;
            if (assignmentData.error) throw assignmentData.error;

            const userStats = scoreboardData.data?.find(row => row.user_id === this.userId);
            const rank = scoreboardData.data?.findIndex(row => row.user_id === this.userId) + 1;

            // Calculate assignment completion stats
            const totalAssigned = assignmentData.data?.length || 0;
            const totalCompleted = assignmentData.data?.filter(a => a.completed_at).length || 0;

            return {
                userStats,
                rank,
                allStats: scoreboardData.data,
                assignmentStats: {
                    totalAssigned,
                    totalCompleted
                }
            };
        } catch (err) {
            console.error('Error loading user stats:', err);
            throw err;
        }
    }

    cleanup() {
        if (this.unsubscribe) {
            this.unsubscribe();
        }
    }

    // Utility methods
    showError(message) {
        // You could make this more sophisticated with toast notifications
        alert(message);
    }

    setLoadingState(elementId, isLoading = true) {
        const element = document.getElementById(elementId);
        if (element) {
            element.className = isLoading ? 'loading' : '';
            if (isLoading) {
                element.innerHTML = 'Loading...';
            }
        }
    }
}

export { BasePage };