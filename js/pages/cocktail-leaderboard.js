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
      // Compute total rubric score for each row and sort descending
      const rowsWithTotal = data.map((row) => {
        const taste = row.taste_avg || 0;
        const presentation = row.presentation_avg || 0;
        const workmanship = row.workmanship_avg || 0;
        const creativity = row.creativity_avg || 0;
        const total = taste * 11 + presentation * 3 + workmanship * 3 + creativity * 3;
        return { ...row, total };
      });
      rowsWithTotal.sort((a, b) => b.total - a.total);
      leaderboardDiv.innerHTML = `
        <table class="cocktail-leaderboard-table">
          <thead>
            <tr>
              <th>Rank</th>
              <th>Cocktail</th>
              <th>By</th>
              <th>Total (out of 100)</th>
              <th>Taste</th>
              <th>Presentation</th>
              <th>Craft</th>
              <th>Creativity</th>
              <th>Judgments</th>
              <th>Favorites</th>
            </tr>
          </thead>
          <tbody>
            ${rowsWithTotal
              .map((row, i) => `
                  <tr>
                    <td>${i + 1}</td>
                    <td>${row.entry_name || "Unnamed"}</td>
                    <td>${row.username || "?"}</td>
                    <td><strong>${row.total.toFixed(1)}</strong></td>
                    <td>${(row.taste_avg || 0).toFixed(2)}</td>
                    <td>${(row.presentation_avg || 0).toFixed(2)}</td>
                    <td>${(row.workmanship_avg || 0).toFixed(2)}</td>
                    <td>${(row.creativity_avg || 0).toFixed(2)}</td>
                    <td>${row.judgments_count ?? 0}</td>
                    <td>${row.favorites_count ?? 0}</td>
                  </tr>
                `)
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
