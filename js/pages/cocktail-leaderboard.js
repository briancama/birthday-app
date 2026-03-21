import { BasePage } from "./base-page.js";

class CocktailLeaderboardPage extends BasePage {
  async onReady() {
    this.setPageTitle("Cocktail Leaderboard");
    await this.loadLeaderboard();
  }

  async loadLeaderboard() {
    const leaderboardDiv = document.getElementById("cocktailLeaderboard");
    leaderboardDiv.innerHTML = "<p>Loading...</p>";
    try {
      const { data, error } = await this.supabase
        .from("cocktail_leaderboard")
        .select("entry_id, entry_name, user_id, username, avg_score, taste_avg, presentation_avg, workmanship_avg, creativity_avg, judgments_count, favorites_count")
        .order("avg_score", { ascending: false, nullsLast: true });
      if (error) throw error;
      if (!data || data.length === 0) {
        leaderboardDiv.innerHTML = "<p>No cocktail entries found.</p>";
        return;
      }
      leaderboardDiv.innerHTML = `
        <table class="cocktail-leaderboard-table">
          <thead>
            <tr>
              <th>Rank</th>
              <th>Cocktail</th>
              <th>By</th>
              <th>Avg Score</th>
              <th>Taste</th>
              <th>Presentation</th>
              <th>Craft</th>
              <th>Creativity</th>
              <th>Judgments</th>
              <th>Favorites</th>
            </tr>
          </thead>
          <tbody>
            ${data
              .map(
                (row, i) => `
                  <tr>
                    <td>${i + 1}</td>
                    <td>${row.entry_name || "Unnamed"}</td>
                    <td>${row.username || "?"}</td>
                    <td><strong>${row.avg_score?.toFixed(2) ?? "—"}</strong></td>
                    <td>${row.taste_avg?.toFixed(2) ?? "—"}</td>
                    <td>${row.presentation_avg?.toFixed(2) ?? "—"}</td>
                    <td>${row.workmanship_avg?.toFixed(2) ?? "—"}</td>
                    <td>${row.creativity_avg?.toFixed(2) ?? "—"}</td>
                    <td>${row.judgments_count ?? 0}</td>
                    <td>${row.favorites_count ?? 0}</td>
                  </tr>
                `
              )
              .join("")}
          </tbody>
        </table>
      `;
    } catch (err) {
      leaderboardDiv.innerHTML = `<p class="error">Failed to load leaderboard: ${err.message}</p>`;
    }
  }
}

window.page = new CocktailLeaderboardPage();
window.page.onReady();
