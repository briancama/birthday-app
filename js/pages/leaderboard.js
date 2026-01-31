import { BasePage } from './base-page.js';
import { APP_CONFIG } from '../config.js';

class LeaderboardPage extends BasePage {
    constructor() {
        super();
        this.refreshInterval = null;
    }

    async onReady() {
        this.setPageTitle('Leaderboard');
        await this.loadLeaderboard();

        // Set up refresh interval (disabled in dev mode for easier inspection)
        if (APP_CONFIG.enableAutoRefresh) {
            this.refreshInterval = setInterval(() => this.loadLeaderboard(), APP_CONFIG.refreshInterval);
        }
    }

    async loadLeaderboard() {
        const container = document.getElementById('scoreboard');
        
        try {
            const { data, error } = await this.supabase
                .from('scoreboard')
                .select('*');

            if (error) throw error;

            if (!data || data.length === 0) {
                container.innerHTML = '<div class="empty">No scores yet.</div>';
                return;
            }

            this.renderLeaderboard(container, data);

        } catch (err) {
            container.innerHTML = `<div class="empty">Error loading leaderboard: ${err.message}</div>`;
        }
    }

    renderLeaderboard(container, data) {
        const getMedal = (rank) => {
            if (rank === 1) return '<img src="images/gold-medal.gif" class="icon-gif icon-gif--with-text" alt="Gold Medal">';
            if (rank === 2) return '<img src="images/silver-medal.gif" class="icon-gif icon-gif--with-text" alt="Silver Medal">';
            if (rank === 3) return '<img src="images/bronze-medal.gif" class="icon-gif icon-gif--with-text" alt="Bronze Medal">';
            return '';
        };

        container.innerHTML = `
            <table class="scoreboard-table">
                <thead>
                    <tr>
                        <th>RANK</th>
                        <th>PLAYER</th>
                        <th>ASSIGNED</th>
                        <th>COMPETITION</th>
                        <th>TOTAL POINTS</th>
                    </tr>
                </thead>
                <tbody>
                    ${data.map((row, idx) => {
                        const rank = idx + 1;
                        const isCurrentUser = row.user_id === this.userId;
                        return `
                            <tr class="${isCurrentUser ? 'current-user' : ''}">
                                <td>
                                    <span>#${rank} ${getMedal(rank)}</span>
                                </td>
                                <td>${row.display_name || row.username}${isCurrentUser ? ' (YOU!)' : ''}</td>
                                <td>${row.assigned_points}</td>
                                <td>${row.competition_points}</td>
                                <td><strong>${row.total_points}</strong></td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        `;
    }

    cleanup() {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
        }
    }
}

export { LeaderboardPage };
