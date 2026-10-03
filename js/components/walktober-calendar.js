// Stateless month grid for Walktober. Re-create on every state change.
// Emits "day:select" with { date } when an editable day is clicked.
class WalktoberCalendar extends EventTarget {
  create(state) {
    const element = document.createElement("div");
    element.className = "wt-calendar";
    element.innerHTML = this.renderHtml(state);
    element.addEventListener("click", (e) => {
      const day = e.target.closest("button[data-date]");
      if (!day || day.disabled) return;
      this.dispatchEvent(new CustomEvent("day:select", { detail: { date: day.dataset.date } }));
    });
    return element;
  }

  renderHtml({ startsOn, endsOn, entriesByDate, goal, todayLocal, editable }) {
    const [year, month] = startsOn.split("-").map(Number);
    const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const weekdays = ["S", "M", "T", "W", "T", "F", "S"]
      .map((d) => `<div class="wt-calendar__weekday">${d}</div>`)
      .join("");

    const cells = [];
    for (let i = 0; i < firstWeekday; i++) {
      cells.push(`<div class="wt-day wt-day--blank" aria-hidden="true"></div>`);
    }
    for (let day = 1; day <= daysInMonth; day++) {
      const date = `${year}-${pad(month)}-${pad(day)}`;
      cells.push(
        this.renderDay({ date, day, startsOn, endsOn, entriesByDate, goal, todayLocal, editable })
      );
    }

    return `
      <div class="wt-calendar__grid">
        ${weekdays}
        ${cells.join("")}
      </div>`;
  }

  renderDay({ date, day, startsOn, endsOn, entriesByDate, goal, todayLocal, editable }) {
    const inSeason = date >= startsOn && date <= endsOn;
    const isFuture = date > todayLocal;
    const hasEntry = Object.prototype.hasOwnProperty.call(entriesByDate, date);
    const steps = hasEntry ? entriesByDate[date] : null;
    const label = monthDayLabel(date);

    let stateClass;
    let body;
    let ariaLabel;
    if (!inSeason || isFuture) {
      stateClass = "wt-day--future";
      body = "";
      ariaLabel = `${label}: not yet`;
    } else if (!hasEntry) {
      stateClass = "wt-day--unlogged";
      body = `<span class="wt-day__steps">?</span>`;
      ariaLabel = `${label}: not logged`;
    } else {
      stateClass = steps === 0 ? "wt-day--zero" : steps >= goal ? "wt-day--hit" : "wt-day--under";
      body = `
        <span class="wt-day__steps">
          <span class="wt-day__steps-full">${steps.toLocaleString("en-US")}</span>
          <span class="wt-day__steps-short">${shortSteps(steps)}</span>
        </span>
        <span class="wt-day__bar"></span>`;
      ariaLabel = `${label}: ${steps.toLocaleString("en-US")} steps`;
    }

    const pct = hasEntry && goal ? Math.min(1, steps / goal) : 0;
    const todayClass = date === todayLocal ? " wt-day--today" : "";
    const disabled = !editable || !inSeason || isFuture ? " disabled" : "";

    return `
      <button type="button" class="wt-day ${stateClass}${todayClass}" data-date="${date}"
        style="--wt-pct: ${pct.toFixed(3)}" aria-label="${ariaLabel}"${disabled}>
        <span class="wt-day__num">${day}</span>
        ${body}
      </button>`;
  }
}

function pad(n) {
  return String(n).padStart(2, "0");
}

function shortSteps(steps) {
  if (steps < 1000) return String(steps);
  return `${(steps / 1000).toFixed(steps < 10000 ? 1 : 0)}k`;
}

function monthDayLabel(date) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export { WalktoberCalendar };
