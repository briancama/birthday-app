// One wallet surface, clipped into a portal until opened on any shared-nav page.
// Data comes from /api/wallet (server calls the wallet RPCs); amounts are
// units, 1 chip = 100 units.
import { audioManager } from "/js/utils/audio.js";
import { appState } from "/js/app.js";
import { EventBus } from "/js/events/event-bus.js";

const PAGE_SIZE = 10;
const PORTAL_STORAGE_KEY = "bric-wallet-tucked";
const COIN_SOUNDS = [
  { name: "wallet-coin-15", src: "/audio/coin_drop_15.wav" },
  { name: "wallet-coin-21", src: "/audio/coin_drop_21.wav" },
  { name: "wallet-coin-23", src: "/audio/coin_drop_23.wav" },
];
const COIN_SOUND_INTERVAL_MS = 500;
const KIND_LABELS = {
  grant: "Starting brics",
  stipend: "Stipend",
  earn: "Earned",
  trade_buy: "Bought shares",
  trade_sell: "Sold shares",
  payout: "Market payout",
  refund: "Refund",
  adjustment: "Adjustment",
};
const CHECKIN_MESSAGES = {
  earned: () => "Checked in today",
  daily_cap: () => "Checked in today",
  global_cap: () => "You've hit today's bric limit. Come back tomorrow!",
  lifetime_cap: () => "You've collected every check-in bonus there is.",
  already_earned: () => "Checked in today",
  inactive: () => "Check-ins are paused right now.",
  unknown_action: () => "Check-ins aren't set up yet.",
};

export function formatChips(units) {
  return (Number(units || 0) / 100).toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function formatSigned(units) {
  const n = Number(units || 0);
  return `${n > 0 ? "+" : n < 0 ? "−" : ""}${formatChips(Math.abs(n))}`;
}

function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "numeric", day: "numeric" });
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

class WalletPanel {
  constructor() {
    this.dialog = null;
    this.nextBeforeId = null;
    this.loaded = false;
    this.busy = false;
    this.activating = false;
    this.refreshPending = false;
    this.lastCoinSound = null;
    this.lastCoinSoundAt = -Infinity;
    this.abort = new AbortController();
  }

  init() {
    const { signal } = this.abort;
    this.portal = document.querySelector("[data-wallet-portal]");
    if (!this.portal) return;
    document.body.append(this.portal);
    this.render();
    this.setBalance(this.portal.dataset.walletUnits);
    this.setupPortalDrag(signal);
    this.setupRestoreDrag(signal);
    try {
      this.setTucked(localStorage.getItem(PORTAL_STORAGE_KEY) === "1", false);
    } catch (error) {
      console.warn("Wallet: could not restore portal preference", error);
    }
    this.portal
      ?.querySelector("[data-wallet-tuck]")
      .addEventListener("click", () => this.setTucked(true), { signal });
    this.portal?.querySelector("[data-wallet-restore]").addEventListener(
      "click",
      (event) => {
        if (this.suppressRestoreClick && event.detail !== 0) {
          this.suppressRestoreClick = false;
          return;
        }
        this.restorePortal(true);
      },
      { signal }
    );
    document.addEventListener(
      "click",
      (e) => {
        if (e.target.closest("[data-wallet-open]")) {
          if (this.suppressPortalClick && e.detail !== 0) {
            this.suppressPortalClick = false;
            return;
          }
          this.open();
        }
      },
      { signal }
    );
    COIN_SOUNDS.forEach(({ name, src }) => audioManager.preload(name, src));
    window.addEventListener(
      "wallet:earned",
      (event) => {
        if (event.detail?.status !== "earned") return;
        this.setBalance(event.detail.balance);
        this.playReward();
        this.loadPage(null);
      },
      { signal }
    );
    EventBus.instance.addEventListener(
      "achievement:awarded",
      (event) => {
        if (event.detail?.userId === appState.getUserId()) this.loadPage(null);
      },
      { signal }
    );
    this.loadPage(null);
  }

  setupPortalDrag(signal) {
    const button = this.portal?.querySelector("[data-wallet-open]");
    if (!button) return;
    let drag = null;
    button.addEventListener(
      "pointerdown",
      (event) => {
        if (this.expanded || !event.isPrimary || event.button !== 0) return;
        this.suppressPortalClick = false;
        drag = { id: event.pointerId, x: event.clientX, delta: 0, moved: false };
        button.setPointerCapture(event.pointerId);
      },
      { signal }
    );
    button.addEventListener(
      "pointermove",
      (event) => {
        if (!drag || drag.id !== event.pointerId) return;
        drag.delta = Math.max(0, event.clientX - drag.x);
        drag.moved ||= Math.abs(event.clientX - drag.x) > 8;
        this.portal.classList.toggle("is-dragging", drag.moved);
        this.portal.style.setProperty("translate", `${drag.delta}px 0`);
      },
      { signal }
    );
    const finish = (event) => {
      if (!drag || drag.id !== event.pointerId) return;
      const tuck = event.type === "pointerup" && drag.delta >= 44;
      this.suppressPortalClick = drag.moved;
      drag = null;
      this.portal.style.removeProperty("translate");
      this.portal.classList.remove("is-dragging");
      if (tuck) this.setTucked(true);
    };
    button.addEventListener("pointerup", finish, { signal });
    button.addEventListener("pointercancel", finish, { signal });
    button.addEventListener("lostpointercapture", finish, { signal });
  }

  setTucked(tucked, persist = true) {
    if (!this.portal) return;
    this.portal.classList.toggle("is-tucked", tucked);
    this.portal.querySelector("[data-wallet-scene]").hidden = tucked;
    this.portal.querySelector("[data-wallet-open]").hidden = tucked;
    this.portal.querySelector("[data-wallet-tuck]").hidden = tucked;
    this.portal.querySelector("[data-wallet-restore]").hidden = !tucked;
    if (persist) {
      try {
        localStorage.setItem(PORTAL_STORAGE_KEY, tucked ? "1" : "0");
      } catch (error) {
        console.warn("Wallet: could not save portal preference", error);
      }
      this.portal.querySelector(tucked ? "[data-wallet-restore]" : "[data-wallet-tuck]").focus();
    }
  }

  setupRestoreDrag(signal) {
    const tab = this.portal.querySelector("[data-wallet-restore]");
    let drag = null;
    tab.addEventListener(
      "pointerdown",
      (event) => {
        if (this.restoring || !event.isPrimary || event.button !== 0) return;
        this.suppressRestoreClick = false;
        drag = { id: event.pointerId, x: event.clientX, delta: 0, moved: false };
        tab.setPointerCapture(event.pointerId);
      },
      { signal }
    );
    tab.addEventListener(
      "pointermove",
      (event) => {
        if (!drag || drag.id !== event.pointerId) return;
        drag.delta = Math.max(0, drag.x - event.clientX);
        drag.moved ||= Math.abs(event.clientX - drag.x) > 8;
        this.portal.style.setProperty("translate", `${-Math.min(drag.delta, 80)}px 0`);
      },
      { signal }
    );
    const finish = (event) => {
      if (!drag || drag.id !== event.pointerId) return;
      const restore = event.type === "pointerup" && drag.delta >= 44;
      this.suppressRestoreClick = drag.moved;
      drag = null;
      if (restore) this.restorePortal(false);
      this.portal.style.removeProperty("translate");
    };
    tab.addEventListener("pointerup", finish, { signal });
    tab.addEventListener("pointercancel", finish, { signal });
    tab.addEventListener("lostpointercapture", finish, { signal });
  }

  async restorePortal(openWallet) {
    if (this.restoring || !this.portal.classList.contains("is-tucked")) return;
    this.restoring = true;
    const tabRect = this.portal.querySelector("[data-wallet-restore]").getBoundingClientRect();
    this.portal.style.removeProperty("translate");
    this.setTucked(false);
    const circleRect = this.portal.querySelector("[data-wallet-open]").getBoundingClientRect();
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const offset = tabRect.left + tabRect.width / 2 - (circleRect.left + circleRect.width / 2);
      this.restoreAnimation = this.portal.animate(
        [{ translate: `${offset}px 0` }, { translate: "0px 0" }],
        { duration: 180, easing: "ease-out" }
      );
      try {
        await this.restoreAnimation.finished;
      } catch (error) {
        if (!this.abort.signal.aborted) console.error("Wallet: restore animation failed", error);
      }
      this.restoreAnimation = null;
    }
    this.restoring = false;
    if (this.abort.signal.aborted) return;
    if (openWallet) this.open();
    else this.portal.querySelector("[data-wallet-open]").focus();
  }

  render() {
    const box = el("div", "wallet-panel wallet-panel__box");
    box.inert = true;
    box.setAttribute("aria-hidden", "true");
    const head = el("div", "wallet-panel__head");
    const title = el("h2", "wallet-panel__title", "Wallet");
    title.id = "walletPanelTitle";
    const logoBox = el("span", "wallet-panel__logo");
    const logo = el("img");
    logo.src = "/images/BRIC/bric_logo.svg";
    logo.alt = "Bric";
    logoBox.append(logo);
    title.prepend(logoBox);
    const close = el("button", "wallet-panel__close", "×");
    close.type = "button";
    close.setAttribute("aria-label", "Close wallet");
    head.append(title, close);

    const balance = el("section", "wallet-panel__section wallet-panel__balance");
    this.balanceEl = el("span", "wallet-panel__amount", "…");
    const balanceValue = el("div", "wallet-panel__value");
    const currency = el("img", "wallet-panel__unit");
    currency.src = "/images/BRIC/bric_symbol_sm.svg";
    currency.alt = "brics";
    balanceValue.append(this.balanceEl, currency);
    this.summaryEl = el("p", "wallet-panel__summary", "Loading activity…");
    balance.append(
      el("h3", "wallet-panel__section-title", "Balance"),
      balanceValue,
      this.summaryEl
    );

    const reward = el("div", "wallet-reward");
    reward.setAttribute("aria-hidden", "true");
    const flight = el("div", "wallet-reward__flight");
    this.rewardCoin = el("div", "wallet-reward__moving");
    this.rewardCoin.append(el("span", "wallet-reward__coin"));
    for (let i = 0; i < 3; i++) {
      this.rewardCoin.append(el("span", "wallet-reward__trail"));
    }
    flight.append(this.rewardCoin);
    reward.append(flight, el("span", "wallet-reward__bank"));
    const hero = el("div", "wallet-panel__hero");
    const coins = el("div", "wallet-panel__coins");
    coins.setAttribute("aria-hidden", "true");
    for (let i = 0; i < 6; i++) coins.append(el("span", "wallet-panel__decor-coin"));
    hero.append(coins, reward);

    this.checkinBtn = el("button", "wallet-panel__checkin", "Daily check-in");
    this.checkinBtn.type = "button";
    this.checkinBtn.setAttribute("aria-live", "polite");
    this.statusEl = el("p", "wallet-panel__status");
    this.statusEl.setAttribute("role", "status");

    const historyTitle = el("h3", "wallet-panel__section-title", "Recent activity");
    this.listEl = el("ul", "wallet-panel__ledger");
    this.moreBtn = el("button", "wallet-panel__more", "Load more");
    this.moreBtn.type = "button";
    this.moreBtn.hidden = true;
    const activity = el("div", "wallet-panel__activity");
    activity.tabIndex = 0;
    activity.setAttribute("role", "region");
    activity.setAttribute("aria-label", "Recent activity");
    activity.append(this.listEl, this.moreBtn);
    this.activityEl = activity;
    this.activityHint = el("div", "wallet-panel__scroll-hint", "More activity below");
    this.activityHint.hidden = true;
    this.activityHint.setAttribute("aria-hidden", "true");
    const activityFrame = el("div", "wallet-panel__activity-frame");
    activityFrame.append(activity, this.activityHint);
    const history = el("section", "wallet-panel__section");
    history.append(historyTitle, activityFrame);

    box.append(head, balance, this.checkinBtn, this.statusEl, history, hero);
    const marketPreview = el("div", "wallet-portal__market-preview");
    marketPreview.setAttribute("aria-hidden", "true");
    const marketImage = el("img");
    marketImage.src = "/images/BRIC/fake_prediction_screenshot.png";
    marketImage.alt = "";
    marketImage.decoding = "async";
    marketImage.draggable = false;
    marketPreview.append(marketImage);
    this.portal.querySelector("[data-wallet-scene]").append(marketPreview, box);
    this.box = box;
    this.dialog = this.portal;

    const { signal } = this.abort;
    activity.addEventListener("scroll", () => this.updateActivityHint(), { signal, passive: true });
    this.activityObserver = new ResizeObserver(() => this.updateActivityHint());
    this.activityObserver.observe(activity);
    this.activityObserver.observe(this.listEl);
    this.activityObserver.observe(this.moreBtn);
    if (
      ["localhost", "127.0.0.1"].includes(window.location.hostname) &&
      new URLSearchParams(window.location.search).get("walletPreview") === "1"
    ) {
      const preview = el("button", "wallet-panel__more", "Preview coin drop");
      preview.type = "button";
      preview.addEventListener("click", () => this.playReward(), { signal });
      this.checkinBtn.after(preview);
    }
    this.rewardCoin.addEventListener(
      "animationend",
      () => this.rewardCoin.classList.remove("is-dropping"),
      { signal }
    );
    close.addEventListener("click", () => this.collapse(), { signal });
    // Re-clicking the piggy closes the portal; aria-hidden art, so the close button stays the a11y path.
    reward.addEventListener("click", () => this.collapse(), { signal });
    this.dialog.addEventListener(
      "cancel",
      (event) => {
        event.preventDefault();
        this.collapse();
      },
      { signal }
    );
    this.dialog.addEventListener(
      "click",
      (event) => {
        if (this.expanded && event.target === this.dialog) this.collapse();
      },
      { signal }
    );
    this.checkinBtn.addEventListener("click", () => this.checkIn(), { signal });
    this.moreBtn.addEventListener("click", () => this.loadPage(this.nextBeforeId), { signal });
  }

  open() {
    if (this.expanded || this.closing || this.restoring) return;
    this.expanded = true;
    const trigger = this.portal.querySelector("[data-wallet-open]");
    const triggerRect = trigger.getBoundingClientRect();
    this.portal.style.setProperty(
      "--wallet-portal-center-x",
      `${triggerRect.left + triggerRect.width / 2}px`
    );
    this.portal.style.setProperty(
      "--wallet-portal-center-y",
      `${triggerRect.top + triggerRect.height / 2}px`
    );
    this.portal.style.setProperty("--wallet-portal-diameter", "112px");
    this.portal.style.setProperty("--wallet-portal-inner-radius", "46px");
    this.box.inert = false;
    this.box.removeAttribute("aria-hidden");
    this.portal.setAttribute("role", "dialog");
    this.portal.setAttribute("aria-labelledby", "walletPanelTitle");
    trigger.setAttribute("aria-expanded", "true");
    trigger.hidden = true;
    this.portal.querySelector("[data-wallet-tuck]").hidden = true;
    this.dialog.close();
    this.dialog.showModal();
    // Re-entering the top layer resets layout; establish the crop before expanding.
    void this.portal.offsetWidth;
    this.portal.classList.add("is-expanded");
    const scene = this.portal.querySelector("[data-wallet-scene]");
    void scene.offsetWidth;
    const panelRect = this.box.getBoundingClientRect();
    const corners = [
      [panelRect.left, panelRect.top],
      [panelRect.right, panelRect.top],
      [panelRect.left, panelRect.bottom],
      [panelRect.right, panelRect.bottom],
    ];
    const radius = Math.max(
      ...corners.map(([x, y]) =>
        Math.hypot(
          x - (triggerRect.left + triggerRect.width / 2),
          y - (triggerRect.top + triggerRect.height / 2)
        )
      )
    );
    this.portal.style.setProperty("--wallet-portal-diameter", `${Math.ceil((radius + 6) * 2)}px`);
    this.portal.style.setProperty("--wallet-portal-inner-radius", `${Math.ceil(radius + 1)}px`);
    void scene.offsetWidth;
    scene.classList.add("is-revealed");
    this.box.querySelector(".wallet-panel__close").focus();
    this.updateActivityHint();
    this.activateWallet();
  }

  async collapse() {
    if (!this.expanded || this.closing) return;
    this.expanded = false;
    this.closing = true;
    this.rewardCoin.classList.remove("is-dropping");
    this.box.inert = true;
    this.box.setAttribute("aria-hidden", "true");
    const scene = this.portal.querySelector("[data-wallet-scene]");
    const closeTransition = new Promise((resolve) => {
      const style = getComputedStyle(scene, "::after");
      const durations = style.transitionDuration.split(",").map((value) => {
        const time = Number.parseFloat(value);
        return value.trim().endsWith("ms") ? time : time * 1000;
      });
      const delays = style.transitionDelay.split(",").map((value) => {
        const time = Number.parseFloat(value);
        return value.trim().endsWith("ms") ? time : time * 1000;
      });
      const duration = Math.max(...durations);
      if (duration === 0) {
        resolve();
        return;
      }

      let timeout;
      const finish = () => {
        clearTimeout(timeout);
        scene.removeEventListener("transitionend", onTransitionEnd);
        resolve();
      };
      const onTransitionEnd = (event) => {
        if (event.pseudoElement === "::after" && event.propertyName === "width") finish();
      };
      scene.addEventListener("transitionend", onTransitionEnd);
      timeout = setTimeout(finish, duration + Math.max(...delays) + 100);
    });
    scene.classList.remove("is-revealed");
    void scene.offsetWidth;
    await closeTransition;
    this.dialog.close();
    this.dialog.show();
    this.portal.classList.remove("is-expanded");
    this.portal.setAttribute("role", "presentation");
    this.portal.removeAttribute("aria-labelledby");
    const trigger = this.portal.querySelector("[data-wallet-open]");
    trigger.hidden = false;
    trigger.setAttribute("aria-expanded", "false");
    this.portal.querySelector("[data-wallet-tuck]").hidden = false;
    this.closing = false;
    trigger.focus();
  }

  setBalance(units) {
    const label = formatChips(units);
    this.balanceEl.textContent = label;
    document.querySelectorAll("[data-wallet-balance]").forEach((node) => {
      node.textContent = label;
    });
    document.querySelectorAll("[data-wallet-open]").forEach((btn) => {
      btn.setAttribute("aria-label", `Your brics: ${label}`);
    });
  }

  setStatus(text, tone = "") {
    this.statusEl.textContent = text;
    this.statusEl.dataset.tone = tone;
  }

  playReward() {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const now = performance.now();
    if (audioManager.enabled && now - this.lastCoinSoundAt >= COIN_SOUND_INTERVAL_MS) {
      const choices = COIN_SOUNDS.filter(({ name }) => name !== this.lastCoinSound);
      const sound = choices[Math.floor(Math.random() * choices.length)];
      this.lastCoinSound = sound.name;
      this.lastCoinSoundAt = now;
      audioManager.play(sound.name);
    }
    document.querySelectorAll(".wallet-reward__moving").forEach((coin) => {
      coin.classList.remove("is-dropping");
      void coin.offsetWidth;
      coin.classList.add("is-dropping");
    });
  }

  renderRow(row) {
    const li = el("li", "wallet-panel__row");
    const label = row.memo || KIND_LABELS[row.kind] || row.kind;
    const memo = el("span", "wallet-panel__memo");
    memo.append(el("span", "wallet-panel__memo-text", label));
    memo.title = label;
    li.append(
      el("span", "wallet-panel__date", formatDate(row.created_at)),
      memo,
      el(
        "span",
        `wallet-panel__delta ${row.amount > 0 ? "is-plus" : "is-minus"}`,
        formatSigned(row.amount)
      )
    );
    return li;
  }

  async activateWallet() {
    if (this.activating) return;
    this.activating = true;
    try {
      const res = await fetch("/api/wallet/activate", {
        method: "POST",
        credentials: "same-origin",
        signal: this.abort.signal,
      });
      const reward = await res.json();
      if (!res.ok) throw new Error(reward.error || "Could not credit your achievements");
      if (!["earned", "already_credited"].includes(reward.status))
        throw new Error("Unexpected achievement credit response");
      if (reward.status === "earned") {
        this.setBalance(reward.balance);
        this.playReward();
        this.setStatus(`Your achievements added ${formatChips(reward.amount)} brics.`);
      }
      await this.loadPage(null);
    } catch (error) {
      if (!this.abort.signal.aborted) this.setStatus(error.message, "error");
    } finally {
      this.activating = false;
    }
  }

  updateActivityHint() {
    const { scrollHeight, clientHeight, scrollTop } = this.activityEl;
    this.activityHint.hidden = scrollHeight - clientHeight - scrollTop <= 2;
  }

  async loadPage(beforeId) {
    if (this.busy) {
      if (!beforeId) this.refreshPending = true;
      return;
    }
    this.busy = true;
    this.moreBtn.disabled = true;
    if (!beforeId) {
      this.checkinBtn.disabled = true;
      this.checkinBtn.textContent = "Loading check-in…";
    }
    try {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
      if (beforeId) params.set("before", String(beforeId));
      const res = await fetch(`/api/wallet?${params}`, { credentials: "same-origin" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not load your brics");

      if (!beforeId) {
        if (typeof data.checkedInToday !== "boolean")
          throw new Error("Could not load your check-in state");
        this.listEl.replaceChildren();
        this.setBalance(data.balance);
        if (!Number.isInteger(data.transactionCount) || data.transactionCount < 0)
          throw new Error("Could not load your transaction count");
        const latest = data.ledger[0];
        this.summaryEl.textContent = `${latest ? `Latest ${formatSigned(latest.amount)}` : "No transactions yet"} · ${data.transactionCount.toLocaleString("en-US")} ${data.transactionCount === 1 ? "transaction" : "transactions"}`;
        this.checkinBtn.textContent = data.checkedInToday ? "Checked in today" : "Daily check-in";
        this.checkinBtn.disabled = data.checkedInToday;
        this.checkinBtn.classList.toggle("is-complete", data.checkedInToday);
      }
      data.ledger.forEach((row) => this.listEl.append(this.renderRow(row)));
      if (!this.listEl.children.length) {
        this.listEl.append(el("li", "wallet-panel__empty", "No brics yet. Try a daily check-in!"));
      }
      this.nextBeforeId = data.nextBeforeId;
      this.moreBtn.hidden = !data.nextBeforeId;
      this.updateActivityHint();
      this.loaded = true;
    } catch (err) {
      this.setStatus(err.message, "error");
      if (!beforeId) this.checkinBtn.textContent = "Check-in unavailable";
    } finally {
      this.busy = false;
      this.moreBtn.disabled = false;
      if (this.refreshPending && !this.abort.signal.aborted) {
        this.refreshPending = false;
        await this.loadPage(null);
      }
    }
  }

  async checkIn() {
    this.checkinBtn.disabled = true;
    this.checkinBtn.textContent = "Checking in…";
    this.checkinBtn.setAttribute("aria-busy", "true");
    let completed = false;
    try {
      const res = await fetch("/api/wallet/checkin", {
        method: "POST",
        credentials: "same-origin",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not check in");

      const message = CHECKIN_MESSAGES[data.status];
      if (!message) throw new Error("Unexpected check-in response. Try again.");
      completed = ["earned", "daily_cap", "already_earned"].includes(data.status);
      this.checkinBtn.textContent = message(data);
      if (data.status === "earned") {
        this.setBalance(data.balance);
        this.playReward();
        this.loaded = false;
        await this.loadPage(null);
      }
    } catch (err) {
      this.checkinBtn.textContent = `${err.message} — Retry`;
    } finally {
      this.checkinBtn.disabled = completed;
      if (completed) this.checkinBtn.textContent = "Checked in today";
      this.checkinBtn.removeAttribute("aria-busy");
      this.checkinBtn.classList.toggle("is-complete", completed);
    }
  }

  cleanup() {
    this.abort.abort();
    this.activityObserver?.disconnect();
    this.restoreAnimation?.cancel();
    this.dialog?.remove();
    this.dialog = null;
  }
}

let instance = null;

export function initWalletPanel() {
  if (!instance) {
    instance = new WalletPanel();
    instance.init();
  }
  return instance;
}
