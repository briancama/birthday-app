import { BrispacePage } from "./brispace.js";
import { WalktoberCalendar } from "../components/walktober-calendar.js";
import { DavidPumpkinsEgg } from "../components/david-pumpkins.js";
import { EventBus } from "../events/event-bus.js";
import {
  fmt,
  escapeHtml,
  longDate,
  localToday,
  shiftDate,
  leaderCutoff,
  onStaleReturn,
  userLink,
  placeCell,
  listRow,
  stepsRow,
  listGap,
  crewTotal,
  distanceLines,
  deadlineLabel,
  countdownText,
} from "../components/walktober-lists.js";

const GOAL_SUGGESTIONS = [5000, 7500, 10000, 12500, 15000];
const LEADERBOARD_URL = "/walktober/leaderboard";
const REFRESH_FAILED = "Saved, but the page couldn't refresh. Reload to see it.";
const WRAP_INTRO =
  "That's a wrap! Thanks to everyone who walked through October. Here's how the crew finished.";
const WRAP_HEADER = "Congratulations, walkers!";
// Keep in step with --wt-haunt-duration in walktober.css
const DISTANCE_ROTATE_MS = 8000;
const PODIUM_ART = { 1: "gold", 2: "silver", 3: "bronze" };
const PODIUM_LABELS = { 1: "1st", 2: "2nd", 3: "3rd" };
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
    const stopStaleWatch = onStaleReturn(() => this.refresh());
    const distanceTimer = setInterval(() => this.rotateDistance(), DISTANCE_ROTATE_MS);
    const deadlineTimer = setInterval(() => this.renderDeadline(), 1000);

    this.eventCleanup.push(() => {
      main.removeEventListener("click", onMainClick);
      main.removeEventListener("submit", onMainSubmit);
      dialog.removeEventListener("click", onDialogClick);
      form.removeEventListener("submit", onDaySubmit);
      this.calendar.removeEventListener("day:select", onDaySelect);
      pumpkins.removeEventListener("finale:start", onFinaleStart);
      pumpkins.removeEventListener("finale:end", onFinaleEnd);
      pumpkins.destroy();
      stopStaleWatch();
      clearInterval(distanceTimer);
      clearInterval(deadlineTimer);
    });

    // Last: Firebase SDK load can stall or be blocked, and step logging doesn't need it
    await super.onReady();
  }

  async loadData() {
    // Keeps an admin's ?preview=results on refreshes
    const preview = new URLSearchParams(window.location.search).get("preview");
    const query = preview === "results" ? "?preview=results" : "";
    const res = await fetch(`/api/walktober/${encodeURIComponent(this.year)}${query}`);
    if (!res.ok) throw new Error("Couldn't load Walktober. Try refreshing.");
    this.data = await res.json();
  }

  // Always re-renders so "today" moves forward even if the fetch fails.
  async refresh(failMessage) {
    try {
      await this.loadData();
    } catch (err) {
      if (failMessage) this.showErrorToast(failMessage);
      else console.warn("Walktober refresh failed:", err.message);
    }
    this.render();
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

  get results() {
    return this.data.results || null;
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
    const entries = this.me.entries || [];
    const steps = entries.map((e) => e.steps);
    const total = steps.reduce((sum, n) => sum + n, 0);
    const daysLogged = steps.length;
    const daysInSeason = this.season.days_in_season;
    const monthTarget = goal * daysInSeason;
    const stepsToGo = Math.max(0, monthTarget - total);
    const daysUnlogged = daysInSeason - daysLogged;
    const dailyAverage = daysLogged ? Math.round(total / daysLogged) : 0;

    const today = localToday();
    const lastDay = today > this.season.ends_on ? this.season.ends_on : today;
    const loggedLastDay = entries.some((e) => e.step_date === lastDay);
    // Today only counts toward pace once it's logged, so mornings don't read as "behind".
    const daysSoFar =
      lastDay < this.season.starts_on
        ? 0
        : daysBetween(this.season.starts_on, lastDay) +
          (loggedLastDay || lastDay !== today ? 1 : 0);

    const onTime = new Set(entries.filter((e) => e.on_time).map((e) => e.step_date));
    const loggedDates = new Set(entries.map((e) => e.step_date));
    const windowMs = (this.data.on_time_window_hours || 0) * 60 * 60 * 1000;
    // Today not being logged yet never breaks the streak; neither does yesterday while it's still on time.
    let day = today > this.season.ends_on ? shiftDate(this.season.ends_on, 1) : today;
    const todayOnTime = onTime.has(day);
    day = shiftDate(day, -1);
    let needsYesterday = false;
    if (
      !loggedDates.has(day) &&
      day >= this.season.starts_on &&
      day <= this.season.ends_on &&
      Date.now() < Date.parse(`${day}T00:00:00Z`) + windowMs
    ) {
      needsYesterday = true;
      day = shiftDate(day, -1);
    }
    let run = 0;
    while (onTime.has(day)) {
      run += 1;
      day = shiftDate(day, -1);
    }
    // With yesterday still open, today and the earlier run aren't joined yet.
    const todayCount = todayOnTime ? 1 : 0;
    const currentStreak = needsYesterday ? Math.max(run, todayCount) : run + todayCount;
    const longestStreak = longestRun([...onTime]);

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
      daysSoFar,
      paceDiff: total - goal * daysSoFar,
      currentStreak,
      longestStreak,
      needsYesterday: needsYesterday && run > 0,
    };
  }

  // ── Rendering ──────────────────────────────────────────────────────────────

  render() {
    const hasGoal = !!this.me?.daily_goal;
    if (this.results) {
      document.getElementById("walktoberIntro").textContent = WRAP_INTRO;
      document.getElementById("walktoberHeroHeader").textContent = WRAP_HEADER;
    }
    this.renderDeadline();
    this.renderHeadline(hasGoal);
    this.renderResults();
    this.renderJoin(hasGoal);
    this.renderCalendar(hasGoal);
    this.renderStats(hasGoal);
    this.renderCommunity();
    this.renderAdmin();
  }

  // Ticks every second; only text changes, so the banner never resizes.
  renderDeadline() {
    const el = document.getElementById("walktoberDeadline");
    const closeAt = this.season.entries_close_at;
    if (!el || !closeAt) return;
    if (this.results || this.season.is_closed) {
      el.hidden = true;
      return;
    }
    const left = Date.parse(closeAt) - Date.now();
    const past = left <= 0;
    // Crossing the deadline: refetch once so the calendar locks
    if (past && !el.classList.contains("is-past") && this.season.is_editable) {
      this.refresh();
    }
    el.classList.toggle("is-past", past);
    document.getElementById("walktoberDeadlineTitle").textContent = past
      ? "Step entries are closed"
      : "Last call for steps!";
    document.getElementById("walktoberDeadlineNote").textContent = past
      ? "Final results are coming soon."
      : `Log any missing days before entries close ${deadlineLabel(closeAt)}.`;
    document.getElementById("walktoberDeadlineClock").textContent = countdownText(left);
  }

  renderHeadline(hasGoal) {
    const el = document.getElementById("walktoberHeadline");
    if (this.results) {
      el.innerHTML = `<div class="walktober-headline__wide">${this.renderCrewWrap(this.results.crew)}</div>`;
      return;
    }
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
      ${this.renderPace(s)}
      <div class="walktober-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100"
        aria-valuenow="${Math.min(100, s.progressPct)}">
        <div class="walktober-progress__fill" style="--wt-progress: ${Math.min(100, s.progressPct)}%"></div>
      </div>
      <p class="walktober-progress__caption">${fmt(s.total)} of ${fmt(s.monthTarget)} steps</p>
      ${this.renderStreakChip(s)}
      ${this.renderAwards()}`;
  }

  renderPace(s) {
    let value = "--";
    let unit = "vs. your goal";
    let state = "";
    if (s.daysSoFar) {
      const ahead = s.paceDiff >= 0;
      value = `${ahead ? "+" : "&minus;"}${fmt(Math.abs(s.paceDiff))}`;
      unit = ahead ? "steps ahead of goal" : "steps behind goal";
      state = ahead ? " is-ahead" : " is-behind";
    }
    return `
      <div class="walktober-headline__item${state}">
        <span class="walktober-headline__label">Pace</span>
        <span class="walktober-headline__value">${value}</span>
        <span class="walktober-headline__unit">${unit}</span>
      </div>`;
  }

  renderStreakChip(s) {
    let body = "No streak going yet.";
    if (s.currentStreak) {
      body = `<strong>${plural(s.currentStreak, "day")}</strong> in a row`;
      if (s.needsYesterday) {
        body += ` <span class="walktober-streak__nudge">Log yesterday's steps to keep it going.</span>`;
      }
    }
    return `
      <div class="walktober-streak">
        <span class="walktober-streak__label">Streak</span>
        <span class="walktober-streak__body">${body}</span>
        <span class="wt-help">
          <button type="button" class="wt-help__btn" aria-label="How streaks work"
            aria-describedby="wtStreakHelp">?</button>
          <span class="wt-help__tip" role="tooltip" id="wtStreakHelp">
            <span class="wt-help__line"><strong>Streak:</strong> log each day's steps by the end of the next day. Miss that and your streak starts over.</span>
          </span>
        </span>
      </div>`;
  }

  // Streak tiers, then goal tiers, then everything else in the order earned.
  renderAwards() {
    const list = this.me.achievements || [];
    if (!list.length) return "";
    const ladderOrder = { streak: 0, goal: 1 };
    const rank = (a) => ladderOrder[a.ladder] ?? 2;
    const items = [...list]
      .sort((a, b) => rank(a) - rank(b) || (a.tier || 0) - (b.tier || 0))
      .map((a) => {
        const tier = a.tier ? `<span class="walktober-award__tier">${a.tier}</span>` : "";
        const title = `${a.name}: ${a.description || ""} (+${a.points} pts)`;
        return `
          <li class="walktober-award" title="${escapeHtml(title)}">
            <span class="walktober-award__badge${a.ladder ? " walktober-award__badge--ladder" : ""}">
              <img src="${escapeHtml(a.image_url || "/images/star_icon.gif")}" alt="${escapeHtml(a.description || a.name)}" />
              ${tier}
            </span>
            <span class="walktober-award__name">${escapeHtml(a.name)}</span>
          </li>`;
      });
    return `
      <div class="walktober-awards">
        <h4 class="walktober-subhead">Your Walktober achievements</h4>
        <ul class="walktober-awards__list">${items.join("")}</ul>
      </div>`;
  }

  // ── Results (after close, or an admin's ?preview=results) ─────────────────

  renderFinalHeadline(s) {
    const standing = this.me.standing;
    const place = standing?.steps_place;
    const bestDay = this.results.me?.best_day;
    const goalMet = s.total >= s.monthTarget;
    return `
      <div class="walktober-headline__item">
        <span class="walktober-headline__label">Final Total</span>
        <span class="walktober-headline__value">${fmt(s.total)}</span>
        <span class="walktober-headline__unit">steps</span>
      </div>
      <div class="walktober-headline__item${place && place <= 3 ? " is-ahead" : ""}">
        <span class="walktober-headline__label">You Finished</span>
        <span class="walktober-headline__value">${place ? `#${place}` : "--"}</span>
        <span class="walktober-headline__unit">${place ? `of ${standing.steps_ranked} walkers` : "no steps logged"}</span>
      </div>
      <div class="walktober-headline__item">
        <span class="walktober-headline__label">Best Day</span>
        <span class="walktober-headline__value">${bestDay ? fmt(bestDay.best_day_steps) : "--"}</span>
        <span class="walktober-headline__unit">${bestDay ? longDate(bestDay.best_day_date) : "steps"}</span>
      </div>
      <div class="walktober-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100"
        aria-valuenow="${Math.min(100, s.progressPct)}">
        <div class="walktober-progress__fill" style="--wt-progress: ${Math.min(100, s.progressPct)}%"></div>
      </div>
      <p class="walktober-progress__caption">${fmt(s.total)} of ${fmt(s.monthTarget)} steps (${s.progressPct}% of your goal)${goalMet ? ". Goal met!" : ""}</p>`;
  }

  renderResults() {
    const el = document.getElementById("walktoberResults");
    const r = this.results;
    el.hidden = !r;
    if (!r) {
      el.innerHTML = "";
      return;
    }
    const myId = this.me?.user_id;
    const mine = this.me?.daily_goal
      ? `<section class="myspace-section">
          <h3>Your Walktober</h3>
          <div class="walktober-headline">${this.renderFinalHeadline(this.computeStats())}</div>
        </section>`
      : "";
    el.innerHTML = `
      ${
        r.preview
          ? `<p class="walktober-results__preview">Admin preview: this is what everyone sees once Walktober ${this.year} is closed. Nothing has been awarded yet.</p>`
          : ""
      }
      ${mine}
      <section class="myspace-section">
        <h3>The Podium</h3>
        ${this.renderPodium(r, myId)}
      </section>
      <section class="myspace-section">
        <h3>Hall of Fame</h3>
        ${this.renderCallouts(r, myId)}
      </section>
      <div class="walktober-boards">
        <section class="myspace-section">
          <h3>Final: Most steps</h3>
          ${fullBoard(r.steps, stepsRow, myId)}
        </section>
        <section class="myspace-section">
          <h3>Final: Goal Completed</h3>
          ${this.renderGoalMet(r, myId)}
        </section>
      </div>
      <a class="walktober-more-link" href="${LEADERBOARD_URL}#longest-streaks">Streaks and daily boards &raquo;</a>`;
  }

  renderCrewWrap(crew) {
    const lines = distanceLines(crew.total_steps);
    return `
      <div class="walktober-wrap">
        <img class="walktober-wrap__gif" src="/images/party-hats.gif" alt="" />
        <div class="walktober-wrap__stats">
          ${wrapStat(fmt(crew.total_steps), "steps walked")}
          ${wrapStat(fmt(crew.active_walkers), crew.active_walkers === 1 ? "walker" : "walkers")}
          ${wrapStat(fmt(crew.days_logged), "days logged")}
          ${wrapStat(fmt(crew.days_hit_goal), "goals hit")}
        </div>
        <img class="walktober-wrap__gif" src="/images/party-hats.gif" alt="" />
      </div>
      ${
        lines.length
          ? `<p class="walktober-wrap__distance">${lines
              .map(
                (line, i) =>
                  `<span class="walktober-wrap__line${i ? "" : " is-active"}"${i ? ' aria-hidden="true"' : ""}><span class="visually-hidden">${line}</span>${hauntedLetters(line)}</span>`
              )
              .join("")}</p>`
          : ""
      }`;
  }

  // Steps the results-page distance line to the next comparison.
  rotateDistance() {
    const lines = [...document.querySelectorAll("#walktoberHeadline .walktober-wrap__line")];
    if (lines.length < 2) return;
    const current = Math.max(
      0,
      lines.findIndex((l) => l.classList.contains("is-active"))
    );
    const next = (current + 1) % lines.length;
    lines[current].classList.remove("is-active");
    lines[current].setAttribute("aria-hidden", "true");
    lines[next].classList.add("is-active");
    lines[next].removeAttribute("aria-hidden");
  }

  renderPodium(r, myId) {
    const steps = [1, 2, 3]
      .map((place) => ({ place, walkers: r.podium.filter((w) => w.place === place) }))
      .filter((p) => p.walkers.length);
    if (!steps.length) return `<p class="walktober-empty">Nobody logged steps this year.</p>`;

    return `
      <ol class="walktober-podium">
        ${steps
          .map(({ place, walkers }) => {
            const art = r.art[PODIUM_ART[place]];
            const src = art?.image_url || `/images/${PODIUM_ART[place]}-medal.gif`;
            return `
              <li class="walktober-podium__step walktober-podium__step--${place}">
                <img class="walktober-podium__art" src="${escapeHtml(src)}" alt="${PODIUM_LABELS[place]} place" />
                <span class="walktober-podium__names">${nameList(walkers, myId)}</span>
                <span class="walktober-podium__steps">${fmt(walkers[0].total_steps)} steps</span>
                ${art ? `<span class="walktober-podium__pts">+${art.points} pts</span>` : ""}
              </li>`;
          })
          .join("")}
      </ol>`;
  }

  renderGoalMet(r, myId) {
    if (!r.goal_crushers.length) {
      return `<p class="walktober-empty">Nobody averaged their daily goal this year.</p>`;
    }
    const check = `<span class="walktober-list__place"><img src="/images/green-checkmark.gif" alt="Goal met" /></span>`;
    return `
      <ol class="walktober-list walktober-list--full">${r.goal_crushers
        .map((w) => listRow(w, w.user_id === myId, check, ""))
        .join("")}</ol>`;
  }

  renderCallouts(r, myId) {
    const days = this.season.days_in_season;
    const cards = [];

    if (r.big_days.length) {
      const pts = [1, 2, 3]
        .map((n) => r.art[`big_day_${n}`]?.points)
        .filter((n) => n != null)
        .join(" / ");
      cards.push(
        callout({
          title: "Biggest Day",
          art: "/images/frank-walk.gif",
          pts: pts ? `${pts} pts` : "",
          body: `
            <p>Everyone's single best day, head to head.</p>
            <ol class="walktober-list">
              ${r.big_days
                .map((w) =>
                  listRow(
                    w,
                    w.user_id === myId,
                    bigDayPlace(w.place, r.art[`big_day_${w.place}`]),
                    fmt(w.best_day_steps),
                    `<span class="walktober-list__date">${shortDate(w.best_day_date)}</span>`
                  )
                )
                .join("")}
            </ol>`,
        })
      );
    }

    if (r.top_streaks.length) {
      cards.push(
        callout({
          title: "Longest Streak",
          art: "/images/badge-ghost.svg",
          body: `<p>${nameList(r.top_streaks, myId)} ${r.top_streaks.length > 1 ? "each logged" : "logged"} <strong>${plural(r.top_streaks[0].streak_days, "day")}</strong> in a row, every one on time.</p>`,
        })
      );
    }

    if (r.days_on_top.walkers.length) {
      cards.push(
        callout({
          title: "Most Days on Top",
          art: "/images/zombie-walk.gif",
          body: `<p>${nameList(r.days_on_top.walkers, myId)} ${r.days_on_top.walkers.length > 1 ? "each out-walked" : "out-walked"} the whole crew on <strong>${plural(r.days_on_top.days, "day")}</strong>.</p>`,
        })
      );
    }

    if (r.full_month.length) {
      const art = r.art.full_month;
      cards.push(
        callout({
          title: art?.name || "Every Day Logged",
          art: art?.image_url,
          pts: art ? `+${art.points} pts` : "",
          body: `<p>Logged all ${days} days:</p><p>${nameList(r.full_month, myId, ", ")}</p>`,
        })
      );
    }

    return cards.length
      ? `<div class="walktober-callouts">${cards.join("")}</div>`
      : `<p class="walktober-empty">No awards this year.</p>`;
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
        ? `October's over. You can still fill in missing days until ${this.season.entries_close_at ? deadlineLabel(this.season.entries_close_at) : longDate(this.season.edit_until)}.`
        : "";
    const daysOnTop = this.me.standing?.days_on_top || 0;

    document.getElementById("walktoberStats").innerHTML = `
      <div class="walktober-stats">
        ${statTile("Total steps", fmt(s.total))}
        ${statTile("Daily average", s.daysLogged ? fmt(s.dailyAverage) : "--")}
        ${statTile("Average vs. goal", s.daysLogged ? `${s.averageVsGoal}%` : "--")}
        ${statTile("At goal", plural(s.daysHit, "day"))}
        ${this.results ? "" : statTile("Current streak", plural(s.currentStreak, "day"))}
        ${statTile("Longest streak", plural(s.longestStreak, "day"))}
        ${this.results ? statTile("Days logged", `${s.daysLogged} / ${s.daysInSeason}`) : statTile("Steps to go", fmt(s.stepsToGo))}
        ${daysOnTop ? statTile("On top", plural(daysOnTop, "day")) : ""}
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
        <h4 class="walktober-subhead">${this.results ? "Final standings" : "Most steps"}</h4>
        ${topList}
        ${moreLink()}
      </div>
      ${
        this.results
          ? this.me?.daily_goal
            ? this.renderAwards()
            : ""
          : this.renderLatestLeader(community.daily_leaders, myId)
      }`;
  }

  // dailyLeaders arrives sorted by date from the server.
  renderLatestLeader(dailyLeaders, myId) {
    const cutoff = leaderCutoff(this.season.ends_on);
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

    const preview = this.data.closePreview || { medalists: [], goal_average: [], big_days: [] };
    const medalLines = preview.medalists.length
      ? preview.medalists
          .map((m) => `<li>#${m.place} ${escapeHtml(m.username)} (${fmt(m.total_steps)})</li>`)
          .join("")
      : "<li>Nobody yet</li>";
    const goalLines = preview.goal_average.length
      ? preview.goal_average.map((m) => `<li>${escapeHtml(m.username)}</li>`).join("")
      : "<li>Nobody yet</li>";
    const bigDayLines = preview.big_days?.length
      ? preview.big_days
          .map(
            (m) =>
              `<li>#${m.place} ${escapeHtml(m.username)} (${fmt(m.steps)} on ${shortDate(m.date)})</li>`
          )
          .join("")
      : "<li>Nobody yet</li>";
    const previewLink = this.season.is_closed
      ? ""
      : this.results
        ? `<p><a href="/walktober">Exit results preview</a></p>`
        : `<p><a href="/walktober?preview=results">Preview the results page &raquo;</a></p>`;

    let action;
    if (this.season.is_closed) {
      action = `<p>Closed ${new Date(this.season.closed_at).toLocaleString()}. Re-running only awards anything new.</p>
        <button type="button" class="btn btn--secondary" data-action="close-season">Re-run awards</button>`;
    } else if (!this.season.has_ended) {
      action = `<p>Available after ${longDate(this.season.ends_on)}.</p>`;
    } else {
      const backfillWarning = this.season.is_editable
        ? `<p><strong>Backfill is open until ${this.season.entries_close_at ? deadlineLabel(this.season.entries_close_at) : longDate(this.season.edit_until)}.</strong> Closing now locks everyone's entries.</p>`
        : "";
      action = `${backfillWarning}<button type="button" class="btn btn--primary" data-action="close-season">Close Walktober ${this.year}</button>`;
    }

    body.innerHTML = `
      <p>Medals (ties share):</p>
      <ul>${medalLines}</ul>
      <p>Biggest Day (each walker's best day, ties share):</p>
      <ul>${bigDayLines}</ul>
      <p>Goal average:</p>
      <ul>${goalLines}</ul>
      ${previewLink}
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
      case "toggle-collapse":
        btn.setAttribute("aria-expanded", String(btn.getAttribute("aria-expanded") !== "true"));
        break;
    }
  }

  async handleMainSubmit(e) {
    const form = e.target.closest("[data-form='goal']");
    if (!form) return;
    e.preventDefault();
    const submit = form.querySelector("[type='submit']");
    submit.disabled = true;
    const goal = Number(form.elements.daily_goal.value);
    try {
      await this.request("PUT", "/goal", { daily_goal: goal });
    } catch (err) {
      submit.disabled = false;
      this.showErrorToast(err.message);
      return;
    }
    this.editingGoal = false;
    this.showSuccessToast(`Goal set: ${fmt(goal)} steps a day.`);
    await this.refresh(REFRESH_FAILED);
  }

  openDay(date) {
    this.selectedDate = date;
    const entries = this.entriesByDate;
    const hasEntry = Object.prototype.hasOwnProperty.call(entries, date);
    const dialog = document.getElementById("walktoberDayDialog");
    document.getElementById("walktoberDayTitle").textContent = longDate(date, true);
    const input = document.getElementById("walktoberStepsInput");
    input.value = hasEntry ? entries[date] : "";
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
    let achievements;
    try {
      ({ achievements = [] } = await this.request("PUT", `/entries/${date}`, { steps }));
    } catch (err) {
      this.showErrorToast(err.message);
      return;
    } finally {
      button.disabled = false;
    }
    this.closeDay();
    achievements.forEach((a) => {
      EventBus.instance.emit("achievement:awarded", {
        userId: this.me?.user_id,
        achievementKey: a.key,
        name: a.name,
        points: a.points,
      });
    });
    await this.refresh(REFRESH_FAILED);
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

function moreLink() {
  return `<a class="walktober-more-link" href="${LEADERBOARD_URL}">Full leaderboard &raquo;</a>`;
}

function fullBoard(walkers, row, myId) {
  if (!walkers.length) return `<p class="walktober-empty">No walkers.</p>`;
  return `<ol class="walktober-list walktober-list--full">${walkers
    .map((w) => row(w, w.user_id === myId))
    .join("")}</ol>`;
}

// "A", "A & B", "A, B & C"; pass a separator to join everything the same way.
function nameList(walkers, myId, separator = null) {
  const names = walkers.map((w) => (w.user_id === myId ? "<strong>You</strong>" : userLink(w)));
  if (separator || names.length < 3) return names.join(separator || " &amp; ");
  return `${names.slice(0, -1).join(", ")} &amp; ${names.at(-1)}`;
}

function wrapStat(value, label) {
  return `
    <div class="walktober-wrap__stat">
      <span class="walktober-wrap__value">${value}</span>
      <span class="walktober-wrap__label">${label}</span>
    </div>`;
}

function callout({ title, art, pts = "", body }) {
  return `
    <article class="walktober-callout">
      <header class="walktober-callout__head">
        ${art ? `<img class="walktober-callout__art" src="${escapeHtml(art)}" alt="" />` : ""}
        <h4 class="walktober-callout__title">${escapeHtml(title)}</h4>
        ${pts ? `<span class="walktober-callout__pts">${pts}</span>` : ""}
      </header>
      <div class="walktober-callout__body">${body}</div>
    </article>`;
}

// Biggest Day rows show the award art when the achievement row has it.
function bigDayPlace(place, art) {
  if (!art?.image_url) return placeCell(place, true);
  return `<span class="walktober-list__place walktober-list__place--art"><img src="${escapeHtml(art.image_url)}" alt="#${place}" /></span>`;
}

// One span per letter (inside a no-wrap span per word) for the haunted-text animation.
// --o is the letter's distance from the middle of the line, used to spread letters out before they settle.
function hauntedLetters(text) {
  const mid = ([...text].length - 1) / 2;
  let i = 0;
  const words = text.split(" ").map((word) => {
    const letters = [...word]
      .map(
        (ch) => `<span class="wt-haunt__char" style="--o: ${i++ - mid}">${escapeHtml(ch)}</span>`
      )
      .join("");
    i += 1;
    return `<span class="wt-haunt__word">${letters}</span>`;
  });
  return `<span aria-hidden="true">${words.join(" ")}</span>`;
}

function shortDate(date) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
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

function daysBetween(from, to) {
  return Math.round((Date.parse(to) - Date.parse(from)) / (24 * 60 * 60 * 1000));
}

function longestRun(dates) {
  let best = 0;
  let run = 0;
  let prev = null;
  [...dates].sort().forEach((d) => {
    run = prev && shiftDate(prev, 1) === d ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  });
  return best;
}

export { WalktoberPage };
