import { BrispacePage } from "./brispace.js";
import {
  fmt,
  longDate,
  leaderCutoff,
  placeCell,
  listRow,
  stepsRow,
  goalRow,
  crewTotal,
} from "../components/walktober-lists.js";

function streakRow(walker, isMe) {
  const days = `${walker.streak_days} day${walker.streak_days === 1 ? "" : "s"}`;
  return listRow(walker, isMe, placeCell(walker.place, true), days);
}

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
    document.getElementById("walktoberDayBoard").innerHTML = this.renderLatestDay();
    document.getElementById("walktoberStreakBoard").innerHTML = data.streaks.length
      ? board(data.streaks, streakRow)
      : `<p class="walktober-empty">No streaks yet.</p>`;
    document.getElementById("walktoberCrewTotal").innerHTML = crewTotal(
      data.crew_total_steps,
      data.walker_count
    );
  }

  // Same day as the Walktober sidebar's "Latest Big Stepper", listing everyone who logged it.
  renderLatestDay() {
    const data = this.data;
    const cutoff = leaderCutoff(data.season.ends_on);
    const day = data.daily.filter((d) => d.date <= cutoff).at(-1);
    if (!day) return `<p class="walktober-empty">Nobody has logged a full day yet.</p>`;

    const walkers = new Map(data.steps.map((w) => [w.user_id, w]));
    const entries = day.entries.filter((e) => walkers.has(e.user_id));
    const distinctSteps = [...new Set(entries.filter((e) => e.steps > 0).map((e) => e.steps))];
    const rows = entries.map((e) => {
      const place = e.steps > 0 ? distinctSteps.indexOf(e.steps) + 1 : null;
      return listRow(
        walkers.get(e.user_id),
        e.user_id === data.me_id,
        placeCell(place, true),
        fmt(e.steps)
      );
    });

    return `
      <p class="walktober-board-date">${longDate(day.date, true)}</p>
      <ol class="walktober-list walktober-list--full">${rows.join("")}</ol>`;
  }
}

export { WalktoberLeaderboardPage };
