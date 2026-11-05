// Chips wallet panel: opened from the nav chip button on every page.
// Data comes from /api/wallet (server calls the wallet RPCs); amounts are
// units, 1 chip = 100 units.
import { audioManager } from "/js/utils/audio.js";

const PAGE_SIZE = 10;
const KIND_LABELS = {
  grant: "Starting chips",
  stipend: "Stipend",
  earn: "Earned",
  trade_buy: "Bought shares",
  trade_sell: "Sold shares",
  payout: "Market payout",
  refund: "Refund",
  adjustment: "Adjustment",
};
const CHECKIN_MESSAGES = {
  earned: (r) => `+${formatChips(r.amount)} chips! See you tomorrow.`,
  daily_cap: () => "Already checked in today. Come back tomorrow!",
  global_cap: () => "You've hit today's chip limit. Come back tomorrow!",
  lifetime_cap: () => "You've collected every check-in bonus there is.",
  already_earned: () => "Already checked in today. Come back tomorrow!",
  inactive: () => "Check-ins are paused right now.",
  unknown_action: () => "Check-ins aren't set up yet.",
};

export function formatChips(units) {
  return (Number(units || 0) / 100).toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function formatSigned(units) {
  const n = Number(units || 0);
  return `${n > 0 ? "+" : "−"}${formatChips(Math.abs(n))}`;
}

function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
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
    this.abort = new AbortController();
  }

  init() {
    const { signal } = this.abort;
    document.addEventListener(
      "click",
      (e) => {
        if (e.target.closest("[data-wallet-open]")) this.open();
      },
      { signal }
    );
    audioManager.preload("wallet-earn", "/audio/thanks_jackpot.mp3");
  }

  render() {
    const dialog = el("dialog", "wallet-panel");
    dialog.setAttribute("aria-labelledby", "walletPanelTitle");

    const box = el("div", "wallet-panel__box");
    const head = el("div", "wallet-panel__head");
    const title = el("h2", "wallet-panel__title", "My Chips");
    title.id = "walletPanelTitle";
    const close = el("button", "wallet-panel__close", "X");
    close.type = "button";
    close.setAttribute("aria-label", "Close wallet");
    head.append(title, close);

    const balance = el("div", "wallet-panel__balance");
    const icon = el("span", "wallet-chip-icon wallet-chip-icon--big");
    icon.setAttribute("aria-hidden", "true");
    this.balanceEl = el("span", "wallet-panel__amount", "…");
    balance.append(icon, this.balanceEl, el("span", "wallet-panel__unit", "chips"));

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

    this.checkinBtn = el("button", "wallet-panel__checkin", "Daily check-in");
    this.checkinBtn.type = "button";
    this.statusEl = el("p", "wallet-panel__status");
    this.statusEl.setAttribute("role", "status");

    const historyTitle = el("h3", "wallet-panel__subtitle", "Recent activity");
    this.listEl = el("ul", "wallet-panel__ledger");
    this.moreBtn = el("button", "wallet-panel__more", "Load more");
    this.moreBtn.type = "button";
    this.moreBtn.hidden = true;

    box.append(
      head,
      balance,
      reward,
      this.checkinBtn,
      this.statusEl,
      historyTitle,
      this.listEl,
      this.moreBtn
    );
    dialog.append(box);
    document.body.append(dialog);

    const { signal } = this.abort;
    if (["localhost", "127.0.0.1"].includes(window.location.hostname)) {
      const preview = el("button", "wallet-panel__more", "Preview coin drop");
      preview.type = "button";
      preview.addEventListener("click", () => this.playReward(), { signal });
      reward.after(preview);
    }
    this.rewardCoin.addEventListener(
      "animationend",
      () => this.rewardCoin.classList.remove("is-dropping"),
      { signal }
    );
    dialog.addEventListener("close", () => this.rewardCoin.classList.remove("is-dropping"), {
      signal,
    });
    close.addEventListener("click", () => dialog.close(), { signal });
    // Clicks on the dialog itself land on the backdrop area
    dialog.addEventListener("click", (e) => e.target === dialog && dialog.close(), { signal });
    this.checkinBtn.addEventListener("click", () => this.checkIn(), { signal });
    this.moreBtn.addEventListener("click", () => this.loadPage(this.nextBeforeId), { signal });
    this.dialog = dialog;
  }

  open() {
    if (!this.dialog) this.render();
    if (!this.dialog.open) this.dialog.showModal();
    if (!this.loaded) this.loadPage(null);
  }

  setBalance(units) {
    const label = formatChips(units);
    this.balanceEl.textContent = label;
    document.querySelectorAll("[data-wallet-balance]").forEach((node) => {
      node.textContent = label;
    });
    document.querySelectorAll("[data-wallet-open]").forEach((btn) => {
      btn.setAttribute("aria-label", `Your chips: ${label}`);
    });
  }

  setStatus(text, tone = "") {
    this.statusEl.textContent = text;
    this.statusEl.dataset.tone = tone;
  }

  playReward() {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    this.rewardCoin.classList.remove("is-dropping");
    void this.rewardCoin.offsetWidth;
    this.rewardCoin.classList.add("is-dropping");
  }

  renderRow(row) {
    const li = el("li", "wallet-panel__row");
    const label = row.memo || KIND_LABELS[row.kind] || row.kind;
    li.append(
      el("span", "wallet-panel__date", formatDate(row.created_at)),
      el("span", "wallet-panel__memo", label),
      el(
        "span",
        `wallet-panel__delta ${row.amount > 0 ? "is-plus" : "is-minus"}`,
        formatSigned(row.amount)
      )
    );
    return li;
  }

  async loadPage(beforeId) {
    if (this.busy) return;
    this.busy = true;
    this.moreBtn.disabled = true;
    try {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
      if (beforeId) params.set("before", String(beforeId));
      const res = await fetch(`/api/wallet?${params}`, { credentials: "same-origin" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not load your chips");

      if (!beforeId) {
        this.listEl.replaceChildren();
        this.setBalance(data.balance);
      }
      data.ledger.forEach((row) => this.listEl.append(this.renderRow(row)));
      if (!this.listEl.children.length) {
        this.listEl.append(el("li", "wallet-panel__empty", "No chips yet. Try a daily check-in!"));
      }
      this.nextBeforeId = data.nextBeforeId;
      this.moreBtn.hidden = !data.nextBeforeId;
      this.loaded = true;
    } catch (err) {
      this.setStatus(err.message, "error");
    } finally {
      this.busy = false;
      this.moreBtn.disabled = false;
    }
  }

  async checkIn() {
    this.checkinBtn.disabled = true;
    this.setStatus("Checking in…");
    try {
      const res = await fetch("/api/wallet/checkin", {
        method: "POST",
        credentials: "same-origin",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not check in");

      const message = CHECKIN_MESSAGES[data.status] || (() => "Check-in done.");
      this.setStatus(message(data), data.status === "earned" ? "success" : "");
      if (data.status === "earned") {
        this.setBalance(data.balance);
        this.setStatus(
          `${formatChips(data.balance - data.amount)} → ${formatChips(data.balance)} brics (+${formatChips(data.amount)})`,
          "success"
        );
        if (this.dialog.open) this.playReward();
        audioManager.play("wallet-earn");
        this.loaded = false;
        await this.loadPage(null);
      }
    } catch (err) {
      this.setStatus(err.message, "error");
    } finally {
      this.checkinBtn.disabled = false;
    }
  }

  cleanup() {
    this.abort.abort();
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
