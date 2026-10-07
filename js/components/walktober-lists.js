import { FEET_PER_STEP, DISTANCE_BANDS } from "../constants/walktober-distances.js";

const MEDAL_GIFS = {
  1: "/images/gold-medal.gif",
  2: "/images/silver-medal.gif",
  3: "/images/bronze-medal.gif",
};
// A day's leader can show from this local hour on the next day.
const LEADER_SWITCH_HOUR = 10;
// A tab coming back after this long refreshes even on the same day.
const STALE_AFTER_MS = 10 * 60 * 1000;

function localToday(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function shiftDate(date, days) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

// Latest day eligible for "Latest Big Stepper" in the viewer's local time, capped at the season end.
function leaderCutoff(endsOn) {
  const shifted = new Date(Date.now() - LEADER_SWITCH_HOUR * 3600 * 1000);
  const latest = shiftDate(localToday(shifted), -1);
  return latest > endsOn ? endsOn : latest;
}

// Calls refresh when a hidden or bfcache-restored tab returns on a new local day or after STALE_AFTER_MS.
// Returns a cleanup function.
function onStaleReturn(refresh) {
  let day = localToday();
  let checkedAt = Date.now();
  const check = () => {
    if (document.visibilityState !== "visible") return;
    if (localToday() === day && Date.now() - checkedAt < STALE_AFTER_MS) return;
    day = localToday();
    checkedAt = Date.now();
    refresh();
  };
  const onPageShow = (e) => {
    if (e.persisted) check();
  };
  document.addEventListener("visibilitychange", check);
  window.addEventListener("pageshow", onPageShow);
  return () => {
    document.removeEventListener("visibilitychange", check);
    window.removeEventListener("pageshow", onPageShow);
  };
}

function fmt(n) {
  return Number(n || 0).toLocaleString("en-US");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function longDate(date, withWeekday = false) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    weekday: withWeekday ? "long" : undefined,
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

function userLink(walker) {
  const name = escapeHtml(walker.display_name || walker.username || "Walker");
  if (!walker.is_published) return `<span class="walktober-list__name">${name}</span>`;
  return `<a class="walktober-list__name" href="/users/${encodeURIComponent(walker.username)}">${name}</a>`;
}

function placeCell(place, withMedal = false) {
  let content = "--";
  if (place) {
    content =
      withMedal && MEDAL_GIFS[place]
        ? `<img src="${MEDAL_GIFS[place]}" alt="#${place}" />`
        : `#${place}`;
  }
  return `<span class="walktober-list__place">${content}</span>`;
}

function listRow(walker, isMe, placeHtml, valueText, extraHtml = "") {
  const name = isMe ? `<span class="walktober-list__name">You</span>` : userLink(walker);
  return `
    <li class="walktober-list__row${isMe ? " is-me" : ""}">
      ${placeHtml}
      ${name}
      <span class="walktober-list__value">${valueText}</span>
      ${extraHtml}
    </li>`;
}

function stepsRow(walker, isMe) {
  return listRow(walker, isMe, placeCell(walker.place, true), fmt(walker.total_steps));
}

function goalRow(walker, isMe) {
  const bar = `<span class="walktober-list__bar" style="--wt-progress: ${Math.min(100, walker.goal_progress_pct)}%"></span>`;
  return listRow(walker, isMe, placeCell(walker.place), `${walker.goal_progress_pct}%`, bar);
}

function listGap() {
  return `<li class="walktober-list__gap" aria-hidden="true">&middot; &middot; &middot;</li>`;
}

// Rounded down so "over" stays true: halves under 10, 2 significant digits, then millions.
function roughCount(n) {
  if (n < 10) {
    const halves = Math.floor(n * 2);
    const whole = Math.floor(halves / 2);
    if (halves % 2 === 0) return String(whole);
    return whole ? `${whole}½` : "½";
  }
  if (n < 1e6) {
    const unit = 10 ** (Math.floor(Math.log10(n)) - 1);
    return fmt(Math.floor(n / unit) * unit);
  }
  return `${Math.floor(n / 1e5) / 10} million`;
}

function distanceLine(totalSteps) {
  const band = DISTANCE_BANDS.filter((b) => totalSteps >= b.from).at(-1);
  if (!band) return "";
  return band.text.replace("{n}", roughCount((totalSteps * FEET_PER_STEP) / band.feet));
}

function crewTotal(totalSteps, walkerCount, extraHtml = "") {
  const distance = distanceLine(totalSteps);
  return `
    <div class="walktober-crew-total">
      <span class="walktober-crew-total__value">${fmt(totalSteps)}</span>
      <span class="walktober-crew-total__label">steps by ${walkerCount} walker${walkerCount === 1 ? "" : "s"}</span>
      ${distance ? `<span class="walktober-crew-total__distance">${distance}</span>` : ""}
      ${extraHtml}
    </div>`;
}

export {
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
  goalRow,
  listGap,
  crewTotal,
  distanceLine,
};
