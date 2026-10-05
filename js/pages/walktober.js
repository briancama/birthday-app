import { BrispacePage } from "./brispace.js";
import { WalktoberCalendar } from "../components/walktober-calendar.js";
import { DavidPumpkinsEgg } from "../components/david-pumpkins.js";
import { EventBus } from "../events/event-bus.js";
import {
  fmt,
  escapeHtml,
  longDate,
  userLink,
  placeCell,
  listRow,
  stepsRow,
  listGap,
  crewTotal,
} from "../components/walktober-lists.js";

const GOAL_SUGGESTIONS = [5000, 7500, 10000, 12500, 15000];
const LEADERBOARD_URL = "/walktober/leaderboard";
// A day's leader can show from this local hour on the next day.
const LEADER_SWITCH_HOUR = 10;
const SKULL_GIF = `<img class="wt-pumpkin-gif wt-pumpkin-gif--skull" data-pumpkin-gif="skull"
  src="/images/skull-walk.gif" width="160" height="160" alt="" />`;
const WEREWOLF_GIF = `<img class="wt-pumpkin-gif wt-pumpkin-gif--werewolf" data-pumpkin-gif="werewolf"
  src="/images/werewolf-walk.gif" width="156" height="180" alt="" />`;

class WalktoberPage extends BrispacePage {
  constructor() {
    super();
    this.year = document.body.dataset.walktoberYear;
    this.data = JSON.parse(document.getElementById("walktoberData").textContent);
    this.editingGoal = false;
    this.selectedDate = null;
    this.calendar = new WalktoberCalendar();
  }

  async onReady() {
    await super.onReady();

    const main = document.getElementById("walktoberMain");
    const dialog = document.getElementById("walktoberDayDialog");
    const form = document.getElementById("walktoberDayForm");
    const onMainClick = (e) => this.handleMainClick(e);
    const onMainSubmit = (e) => this.handleMainSubmit(e);
    const onDialogClick = (e) => this.handleDialogClick(e);
    const onDaySubmit = (e) => this.handleDaySubmit(e);
    const onDaySelect = (e) => this.openDay(e.detail.date);
    main.addEventListener("click", onMainClick);
    main.addEventListener("submit", onMainSubmit);
    dialog.addEventListener("click", onDialogClick);
    form.addEventListener("submit", onDaySubmit);
    this.calendar.addEventListener("day:select", onDaySelect);

    // David's clip replaces the usual achievement sound
    const pumpkins = new DavidPumpkinsEgg();
    const onFinaleStart = () => (this.suppressAchievementSound = true);
    const onFinaleEnd = () => (this.suppressAchievementSound = false);
    pumpkins.addEventListener("finale:start", onFinaleStart);
    pumpkins.addEventListener("finale:end", onFinaleEnd);
    pumpkins.init();

    this.eventCleanup.push(() => {
      main.removeEventListener("click", onMainClick);
      main.removeEventListener("submit", onMainSubmit);
      dialog.removeEventListener("click", onDialogClick);
      form.removeEventListener("submit", onDaySubmit);
      this.calendar.removeEventListener("day:select", onDaySelect);
      pumpkins.removeEventListener("finale:start", onFinaleStart);
      pumpkins.removeEventListener("finale:end", onFinaleEnd);
      pumpkins.destroy();
    });
  }

  async loadData() {
    const res = await fetch(`/api/walktober/${encodeURIComponent(this.year)}`);
    if (!res.ok) throw new Error("Couldn't load Walktober. Try refreshing.");
    this.data = await res.json();
  }

  async request(method, path, body) {
    const res = await fetch(`/api/walktober/${encodeURIComponent(this.year)}${path}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(payload.error || "Something went wrong");
    return payload;
  }

  // ── Derived state ──────────────────────────────────────────────────────────

  get me() {
    return this.data?.me || null;
  }

  get season() {
    return this.data.season;
  }

  get entriesByDate() {
    const map = {};
    (this.me?.entries || []).forEach((e) => {
      map[e.step_date] = e.steps;
    });
    return map;
  }

  computeStats() {
    const goal = this.me.daily_goal;
    const steps = (this.me.entries || []).map((e) => e.steps);
    const total = steps.reduce((sum, n) => sum + n, 0);
    const daysLogged = steps.length;
    const daysInSeason = this.season.days_in_season;
    const monthTarget = goal * daysInSeason;
    const stepsToGo = Math.max(0, monthTarget - total);
    const daysUnlogged = daysInSeason - daysLogged;
    const dailyAverage = daysLogged ? Math.round(total / daysLogged) : 0;
    return {
      goal,
      total,
      daysLogged,
      daysInSeason,
      daysHit: steps.filter((n) => n >= goal).length,
      dailyAverage,
      averageVsGoal: daysLogged ? Math.round((dailyAverage / goal) * 100) : 0,
      monthTarget,
      progressPct: Math.round((total / monthTarget) * 1000) / 10,
      stepsToGo,
      neededPerDay: stepsToGo > 0 && daysUnlogged > 0 ? Math.ceil(stepsToGo / daysUnlogged) : 0,
    };
  }

  // ── Rendering ──────────────────────────────────────────────────────────────

  render() {
    const hasGoal = !!this.me?.daily_goal;
    this.renderHeadline(hasGoal);
    this.renderJoin(hasGoal);
    this.renderCalendar(hasGoal);
    this.renderStats(hasGoal);
    this.renderCommunity();
    this.renderAdmin();
  }

  renderHeadline(hasGoal) {
    const el = document.getElementById("walktoberHeadline");
    if (!hasGoal) {
      el.innerHTML = "";
      return;
    }
    const s = this.computeStats();
    const canChangeGoal = !this.me.goal_locked && this.season.is_editable;
    el.innerHTML = `
      <div class="walktober-headline__item">
        <span class="walktober-headline__label">Your Goal</span>
        <span class="walktober-headline__value">${fmt(s.goal)}</span>
        <span class="walktober-headline__unit">steps / day</span>
        ${
          canChangeGoal
            ? `<button type="button" class="walktober-link-btn" data-action="edit-goal">change</button>`
            : ""
        }
      </div>
      <div class="walktober-headline__item">
        <span class="walktober-headline__label">Daily Average</span>
        <span class="walktober-headline__value">${s.daysLogged ? fmt(s.dailyAverage) : "--"}</span>
        <span class="walktober-headline__unit">steps</span>
      </div>
      <div class="walktober-headline__item">
        <span class="walktober-headline__label">Goal Progress</span>
        <span class="walktober-headline__value">${s.progressPct}%</span>
        <span class="walktober-headline__unit">of ${fmt(s.monthTarget)}</span>
      </div>
      <div class="walktober-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100"
        aria-valuenow="${Math.min(100, s.progressPct)}">
        <div class="walktober-progress__fill" style="--wt-progress: ${Math.min(100, s.progressPct)}%"></div>
      </div>`;
  }

  renderJoin(hasGoal) {
    const section = document.getElementById("walktoberJoin");
    const body = document.getElementById("walktoberJoinBody");
    const showForm = this.me && (!hasGoal || this.editingGoal);

    if (!showForm) {
      section.hidden = true;
      return;
    }
    section.hidden = false;

    if (!this.season.is_editable) {
      body.innerHTML = `<p>Walktober ${this.year} is over. See you next October.</p>`;
      return;
    }

    const minGoal = this.season.min_goal;
    const current = this.me.daily_goal || "";
    body.innerHTML = `
      <form class="walktober-goal-form" data-form="goal">
        <p>Everyone picks their own number. Pick one you can actually hit most days.</p>
        <div class="walktober-goal-chips">
          ${GOAL_SUGGESTIONS.filter((n) => n >= minGoal)
            .map(
              (
                n
              ) => `<button type="button" class="walktober-chip${n === current ? " is-selected" : ""}"
                data-action="pick-goal" data-goal="${n}">${fmt(n)}</button>`
            )
            .join("")}
        </div>
        <label for="walktoberGoalInput">Or type your own (at least ${fmt(minGoal)})</label>
        <input id="walktoberGoalInput" name="daily_goal" type="number" inputmode="numeric"
          min="${minGoal}" step="1" value="${current}" required />
        <p class="walktober-goal-form__note">Your goal locks once you log your first day.</p>
        <button type="submit" class="btn btn--primary">Set my goal</button>
        ${
          hasGoal
            ? `<button type="button" class="btn btn--secondary" data-action="cancel-goal">Cancel</button>`
            : ""
        }
      </form>`;
  }

  renderCalendar(hasGoal) {
    const section = document.getElementById("walktoberCalendarSection");
    section.hidden = !hasGoal;
    if (!hasGoal) return;

    const container = document.getElementById("walktoberCalendar");
    container.replaceChildren(
      this.calendar.create({
        startsOn: this.season.starts_on,
        endsOn: this.season.ends_on,
        entriesByDate: this.entriesByDate,
        goal: this.me.daily_goal,
        todayLocal: localToday(),
        editable: this.season.is_editable,
      })
    );
  }

  renderStats(hasGoal) {
    const section = document.getElementById("walktoberStatsSection");
    section.hidden = !hasGoal;
    if (!hasGoal) return;

    const s = this.computeStats();
    let paceNote = "";
    if (s.stepsToGo === 0) {
      paceNote = `You've already walked enough for your goal average. Anything else is extra.`;
    } else if (s.neededPerDay && this.season.is_editable) {
      paceNote = `To average your goal for the month, you need about <strong>${fmt(s.neededPerDay)}</strong> steps on each day you haven't logged yet.`;
    }

    const editNote = this.season.is_closed
      ? `Walktober ${this.year} is closed.`
      : this.season.has_ended && this.season.is_editable
        ? `October's over. You can still fill in missing days until ${longDate(this.season.edit_until)}.`
        : "";
    const daysOnTop = this.me.standing?.days_on_top || 0;

    document.getElementById("walktoberStats").innerHTML = `
      <div class="walktober-stats">
        ${statTile("Total steps", fmt(s.total))}
        ${statTile("Daily average", s.daysLogged ? fmt(s.dailyAverage) : "--")}
        ${statTile("Average vs. goal", s.daysLogged ? `${s.averageVsGoal}%` : "--")}
        ${statTile("Days at goal", `${s.daysHit}`)}
        ${statTile("Days logged", `${s.daysLogged} / ${s.daysInSeason}`)}
        ${statTile("Steps to go", fmt(s.stepsToGo))}
        ${daysOnTop ? statTile("Days on top", fmt(daysOnTop)) : ""}
      </div>
      ${paceNote ? `<p class="walktober-note">${paceNote}</p>` : ""}
      ${editNote ? `<p class="walktober-note">${editNote}</p>` : ""}
      ${WEREWOLF_GIF}
      ${this.renderComparisons(s)}`;
  }

  renderComparisons(s) {
    const standing = this.me.standing;
    const avg = this.data.community.averages;
    if (!standing || !s.daysLogged) return "";

    const lines = [];
    if (avg.active_walkers < 2) {
      lines.push("You're the only one who's logged steps so far.");
    } else {
      if (standing.steps_place) {
        lines.push(
          `You're <strong>#${standing.steps_place}</strong> of ${standing.steps_ranked} in total steps.`
        );
      }
      lines.push(
        `You're <strong>#${standing.goal_place}</strong> of ${standing.walker_count} in goal progress.`
      );
      lines.push(
        `You've logged <strong>${plural(s.daysLogged, "day")}</strong>, ${versusAverage(
          s.daysLogged - avg.days_logged,
          "day",
          0.5
        )}.`
      );

      const avgDiff = s.dailyAverage - avg.daily_average;
      const avgPhrase =
        Math.abs(avgDiff) < 100
          ? "right around the crew average"
          : `${fmt(Math.abs(avgDiff))} steps ${avgDiff > 0 ? "above" : "below"} the crew average`;
      lines.push(`Your daily average is <strong>${fmt(s.dailyAverage)}</strong>, ${avgPhrase}.`);

      lines.push(
        `You've hit your goal <strong>${plural(s.daysHit, "time")}</strong>. The average walker has hit theirs ${plural(avg.days_hit_goal, "time")}.`
      );
      lines.push(
        `Your steps account for <strong>${standing.share_pct}%</strong> of the walktober crew's total.`
      );
      lines.push(
        `Your goal is <strong>${fmt(s.goal)}</strong> a day. The average goal is ${fmt(avg.daily_goal)}.`
      );
    }

    return `
      <h4 class="walktober-subhead">How you stack up</h4>
      <ul class="walktober-compare">
        ${lines.map((line) => `<li>${line}</li>`).join("")}
      </ul>`;
  }

  renderCommunity() {
    const { community } = this.data;
    const el = document.getElementById("walktoberCommunity");
    const myId = this.me?.user_id;
    const standing = this.me?.standing;
    const myWalker = community.walkers.find((w) => w.user_id === myId);

    let topList = `<p class="walktober-empty">Nobody's logged steps yet.</p>`;
    if (community.top_totals.length) {
      const rows = community.top_totals.map((w) => stepsRow(w, w.user_id === myId));
      if (standing?.steps_place && !community.top_totals.some((w) => w.user_id === myId)) {
        rows.push(listGap());
        rows.push(
          listRow(myWalker, true, placeCell(standing.steps_place), fmt(standing.total_steps))
        );
      }
      topList = `<ol class="walktober-list">${rows.join("")}</ol>`;
    }

    el.innerHTML = `
      ${crewTotal(community.crew_total_steps, community.walker_count, SKULL_GIF)}
      <div class="walktober-board">
        <h4 class="walktober-subhead">Most steps</h4>
        ${topList}
        ${moreLink()}
      </div>
      ${this.renderLatestLeader(community.daily_leaders, myId)}`;
  }

  // dailyLeaders arrives sorted by date from the server.
  renderLatestLeader(dailyLeaders, myId) {
    const shifted = new Date(Date.now() - LEADER_SWITCH_HOUR * 3600 * 1000);
    const latest = shiftDate(localToday(shifted), -1);
    const cutoff = latest > this.season.ends_on ? this.season.ends_on : latest;
    const leader = dailyLeaders.filter((d) => d.date <= cutoff).at(-1);
    if (!leader) return "";

    return `
      <div class="walktober-board">
        <h4 class="walktober-subhead">Latest Big Stepper</h4>
        <div class="walktober-yesterday">
          <span class="walktober-yesterday__date">${longDate(leader.date, true)}</span>
          <span class="walktober-yesterday__names">${leader.walkers
            .map((w) => (w.user_id === myId ? "<strong>You</strong>" : userLink(w)))
            .join(" &amp; ")}</span>
          <span class="walktober-yesterday__steps">${fmt(leader.steps)} steps</span>
        </div>
        ${moreLink()}
      </div>`;
  }

  renderAdmin() {
    const body = document.getElementById("walktoberAdminBody");
    if (!body || !this.data.isAdmin) return;

    const preview = this.data.closePreview || { medalists: [], goal_average: [] };
    const medalLines = preview.medalists.length
      ? preview.medalists
          .map((m) => `<li>#${m.place} ${escapeHtml(m.username)} (${fmt(m.total_steps)})</li>`)
          .join("")
      : "<li>Nobody yet</li>";
    const goalLines = preview.goal_average.length
      ? preview.goal_average.map((m) => `<li>${escapeHtml(m.username)}</li>`).join("")
      : "<li>Nobody yet</li>";

    let action;
    if (this.season.is_closed) {
      action = `<p>Closed ${new Date(this.season.closed_at).toLocaleString()}. Re-running only awards anything new.</p>
        <button type="button" class="btn btn--secondary" data-action="close-season">Re-run awards</button>`;
    } else if (!this.season.has_ended) {
      action = `<p>Available after ${longDate(this.season.ends_on)}.</p>`;
    } else {
      const backfillWarning = this.season.is_editable
        ? `<p><strong>Backfill is open until ${longDate(this.season.edit_until)}.</strong> Closing now locks everyone's entries.</p>`
        : "";
      action = `${backfillWarning}<button type="button" class="btn btn--primary" data-action="close-season">Close Walktober ${this.year}</button>`;
    }

    body.innerHTML = `
      <p>Medals (ties share):</p>
      <ul>${medalLines}</ul>
      <p>Goal average:</p>
      <ul>${goalLines}</ul>
      ${action}`;
  }

  // ── Handlers ───────────────────────────────────────────────────────────────

  handleMainClick(e) {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    switch (btn.dataset.action) {
      case "pick-goal": {
        const input = document.getElementById("walktoberGoalInput");
        input.value = btn.dataset.goal;
        document
          .querySelectorAll(".walktober-chip")
          .forEach((chip) => chip.classList.toggle("is-selected", chip === btn));
        break;
      }
      case "edit-goal":
        this.editingGoal = true;
        this.render();
        break;
      case "cancel-goal":
        this.editingGoal = false;
        this.render();
        break;
      case "close-season":
        this.closeSeason(btn);
        break;
    }
  }

  async handleMainSubmit(e) {
    const form = e.target.closest("[data-form='goal']");
    if (!form) return;
    e.preventDefault();
    const submit = form.querySelector("[type='submit']");
    submit.disabled = true;
    try {
      const goal = Number(form.elements.daily_goal.value);
      await this.request("PUT", "/goal", { daily_goal: goal });
      this.editingGoal = false;
      await this.loadData();
      this.render();
      this.showSuccessToast(`Goal set: ${fmt(goal)} steps a day.`);
    } catch (err) {
      submit.disabled = false;
      this.showErrorToast(err.message);
    }
  }

  openDay(date) {
    this.selectedDate = date;
    const entries = this.entriesByDate;
    const hasEntry = Object.prototype.hasOwnProperty.call(entries, date);
    const dialog = document.getElementById("walktoberDayDialog");
    document.getElementById("walktoberDayTitle").textContent = longDate(date, true);
    const input = document.getElementById("walktoberStepsInput");
    input.value = hasEntry ? entries[date] : "";
    dialog.querySelector("[data-action='clear-day']").hidden = !hasEntry;
    dialog.showModal();
    input.focus();
  }

  closeDay() {
    this.selectedDate = null;
    document.getElementById("walktoberDayDialog").close();
  }

  handleDialogClick(e) {
    const dialog = e.currentTarget;
    // Click on the backdrop closes the dialog
    if (e.target === dialog) {
      this.closeDay();
      return;
    }
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    if (btn.dataset.action === "close-dialog") this.closeDay();
    if (btn.dataset.action === "clear-day") this.saveDay(btn, null);
  }

  handleDaySubmit(e) {
    e.preventDefault();
    const raw = document.getElementById("walktoberStepsInput").value.trim();
    const steps = Number(raw);
    if (raw === "" || !Number.isInteger(steps) || steps < 0) {
      this.showErrorToast("Enter a whole number of steps (0 is fine).");
      return;
    }
    this.saveDay(e.submitter || e.target.querySelector("[type='submit']"), steps);
  }

  async saveDay(button, steps) {
    const date = this.selectedDate;
    if (!date) return;
    button.disabled = true;
    try {
      let achievement = null;
      if (steps === null) {
        await this.request("DELETE", `/entries/${date}`);
      } else {
        ({ achievement } = await this.request("PUT", `/entries/${date}`, { steps }));
      }
      this.closeDay();
      await this.loadData();
      this.render();
      if (achievement) {
        EventBus.instance.emit("achievement:awarded", {
          userId: this.me?.user_id,
          achievementKey: achievement.key,
          name: achievement.name,
          points: achievement.points,
        });
      }
    } catch (err) {
      this.showErrorToast(err.message);
    } finally {
      button.disabled = false;
    }
  }

  async closeSeason(button) {
    const ok = window.confirm(
      `Close Walktober ${this.year}? This awards the achievements, sends notifications, and locks all entries.`
    );
    if (!ok) return;
    button.disabled = true;
    try {
      const result = await this.request("POST", "/close");
      const newCount = result.awards.filter((a) => a.newlyAwarded).length;
      this.showSuccessToast(`Walktober closed. ${newCount} new award${newCount === 1 ? "" : "s"}.`);
      await this.loadData();
      this.render();
    } catch (err) {
      button.disabled = false;
      this.showErrorToast(err.message);
    }
  }
}

function localToday(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function shiftDate(date, days) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function moreLink() {
  return `<a class="walktober-more-link" href="${LEADERBOARD_URL}">Full leaderboard &raquo;</a>`;
}

function statTile(label, value) {
  return `
    <div class="walktober-stat">
      <span class="walktober-stat__value">${value}</span>
      <span class="walktober-stat__label">${label}</span>
    </div>`;
}

function plural(n, word) {
  return `${fmt(n)} ${word}${n === 1 ? "" : "s"}`;
}

function versusAverage(diff, word, threshold) {
  if (Math.abs(diff) < threshold) return "about the same as the average walker";
  const amount = Math.round(Math.abs(diff) * 10) / 10;
  return `${plural(amount, word)} ${diff > 0 ? "more" : "fewer"} than the average walker`;
}

export { WalktoberPage };
