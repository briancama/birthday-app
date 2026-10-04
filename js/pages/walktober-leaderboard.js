import { BrispacePage } from "./brispace.js";
import { stepsRow, goalRow, crewTotal } from "../components/walktober-lists.js";

class WalktoberLeaderboardPage extends BrispacePage {
  constructor() {
    super();
    this.year = document.body.dataset.walktoberYear;
    this.data = JSON.parse(document.getElementById("walktoberData").textContent);
  }

  render() {
    const data = this.data;
    const empty = `<p class="walktober-empty">No walkers yet.</p>`;
    const board = (walkers, row) =>
      walkers.length
        ? `<ol class="walktober-list walktober-list--full">${walkers
            .map((w) => row(w, w.user_id === data.me_id))
            .join("")}</ol>`
        : empty;

    document.getElementById("walktoberStepsBoard").innerHTML = board(data.steps, stepsRow);
    document.getElementById("walktoberGoalBoard").innerHTML = board(data.goal, goalRow);
    document.getElementById("walktoberCrewTotal").innerHTML = crewTotal(
      data.crew_total_steps,
      data.walker_count
    );
  }
}

export { WalktoberLeaderboardPage };
