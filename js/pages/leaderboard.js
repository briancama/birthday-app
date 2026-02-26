import { BasePage } from "./base-page.js";
import { APP_CONFIG } from "../app.js";
import { firebaseAuth } from "../services/firebase-auth.js";
import { featureFlags } from "../utils/feature-flags.js";

class LeaderboardPage extends BasePage {
  constructor() {
    super();
    this.refreshInterval = null;
    this.eventStarted = false;
  }

  async onReady() {
    this.setPageTitle("Leaderboard");

    // Check if event has started
    this.eventStarted = await featureFlags.isEventStarted(this.supabase);

    this.addRefreshButton();
    await this.loadLeaderboard();

    // Only set up auto-refresh if event started
    if (this.eventStarted && APP_CONFIG.enableAutoRefresh) {
      this.refreshInterval = setInterval(() => this.loadLeaderboard(), APP_CONFIG.refreshInterval);
    }
  }

  addRefreshButton() {
    const refreshButton = document.getElementById("refreshButton");
    if (refreshButton) {
      refreshButton.addEventListener("click", () => this.handleRefresh());
    }
  }

  async handleRefresh() {
    const refreshButton = document.getElementById("refreshButton");
    const originalHTML = refreshButton?.innerHTML;

    if (refreshButton) {
      refreshButton.disabled = true;
      refreshButton.innerHTML =
        '<img src="images/refresh.gif" alt="Refresh" class="icon-gif icon-gif--with-text"> <span class="refresh-text">Refreshing...</span>';
    }

    await this.loadLeaderboard();

    if (refreshButton) {
      refreshButton.disabled = false;
      refreshButton.innerHTML = originalHTML;
    }
  }

  async loadLeaderboard() {
    const container = document.getElementById("scoreboard");
    const lastUpdatedElement = document.getElementById("lastUpdated");

    try {
      const { data, error } = await this.supabase.from("scoreboard").select("*");

      if (error) throw error;

      if (!data || data.length === 0) {
        container.innerHTML = '<div class="empty">No scores yet.</div>';
        return;
      }

      // Enrich with completion counts only if event started
      let enrichedData = data;
      if (this.eventStarted) {
        enrichedData = await this.enrichScoreboardWithCompletions(data);
      }

      this.renderLeaderboard(container, enrichedData);

      // Update last refreshed timestamp only if event started
      if (lastUpdatedElement && this.eventStarted) {
        lastUpdatedElement.textContent = `Last updated: ${new Date().toLocaleTimeString()}`;
      }
    } catch (err) {
      container.innerHTML = `<div class="empty">Error loading leaderboard: ${err.message}</div>`;
    }
  }

  renderLeaderboard(container, data) {
    const getMedal = (rank) => {
      if (rank === 1) return '<img src="images/gold-medal.gif" class="icon-gif" alt="Gold Medal">';
      if (rank === 2)
        return '<img src="images/silver-medal.gif" class="icon-gif" alt="Silver Medal">';
      if (rank === 3)
        return '<img src="images/bronze-medal.gif" class="icon-gif" alt="Bronze Medal">';
      return "";
    };

    const leaderboardHTML = `
            <div class="leaderboard-cards">
                ${data
                  .map((row, idx) => {
                    const rank = idx + 1;
                    const isCurrentUser = row.user_id === this.userId;

                    // If event hasn't started, show simplified card
                    if (!this.eventStarted) {
                      return `
                    <div class="leaderboard-card ${isCurrentUser ? "current-user" : ""}">
                        <div class="leaderboard-card__rank">
                            <span class="rank-number">#${rank}</span>
                        </div>
                        <div class="leaderboard-card__name">
                            ${row.display_name || row.username}${isCurrentUser ? ' <span class="you-badge">(YOU!)</span>' : ""}
                        </div>
                        <div class="leaderboard-card__total">
                            <span class="total-value">-</span>
                        </div>
                    </div>
                `;
                    }

                    // Event started - show full card with stats
                    return `
                <div class="leaderboard-card ${isCurrentUser ? "current-user" : ""}">
                    <div class="leaderboard-card__rank">
                        <span class="rank-number">#${rank}</span>
                    </div>
                    <div class="leaderboard-card__name">
                        ${row.display_name || row.username}${getMedal(rank)}${isCurrentUser ? ' <span class="you-badge">(YOU!)</span>' : ""}
                    </div>
                    <div class="leaderboard-card__stats">
                        <div class="stat-item">
                            <span class="leaderboard-card__stat-label">Challenges</span>
                            <span class="leaderboard-card__stat-value">${row.challenges_completed}</span>
                        </div>
                        <div class="stat-item">
                            <span class="leaderboard-card__stat-label">Contest</span>
                            <span class="leaderboard-card__stat-value">${row.competition_points}</span>
                        </div>
                    </div>
                    <div class="leaderboard-card__total">
                        <span class="total-value">${row.total_points}</span>
                    </div>
                </div>
            `;
                  })
                  .join("")}
            </div>
        `;

    container.innerHTML = leaderboardHTML;
  }

  cleanup() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
    }
  }
}

export { LeaderboardPage };
