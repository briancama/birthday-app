import { achievementService } from "../services/achievement-service.js";
import { appState } from "../app.js";

// Each dance track is shared by two characters
const CHARACTER_TRACKS = {
  zombie: "/audio/pumpkin_dance_c.mp3",
  frank: "/audio/pumpkin_dance_d.mp3",
  skull: "/audio/pumpkin_dance_c.mp3",
  werewolf: "/audio/pumpkin_dance_d.mp3",
};
const FINALE_GIF = "/images/david_pumpkin_gif.gif";
const FINALE_AUDIO = "/audio/david_pumpkins.mp3";
const ACHIEVEMENT_KEY = "david_pumpkins";

// Walktober easter egg: click every [data-pumpkin-gif] character, let the last dance
// finish, and David S. Pumpkins rises. Emits "finale:start" / "finale:end".
class DavidPumpkinsEgg extends EventTarget {
  constructor() {
    super();
    this.dance = null;
    this.finaleEl = null;
    this.finaleAudio = null;
    this.onClick = (e) => this.handleClick(e);
  }

  init() {
    document.addEventListener("click", this.onClick);
  }

  destroy() {
    document.removeEventListener("click", this.onClick);
    this.stopDance();
    this.finaleAudio?.pause();
    this.finaleEl?.remove();
  }

  storageKey(suffix) {
    return `walktober-pumpkins:${appState.getUserId()}:${suffix}`;
  }

  getFound() {
    try {
      return new Set(JSON.parse(localStorage.getItem(this.storageKey("found"))) || []);
    } catch {
      return new Set();
    }
  }

  handleClick(e) {
    const gif = e.target.closest("[data-pumpkin-gif]");
    const name = gif?.dataset.pumpkinGif;
    if (!CHARACTER_TRACKS[name]) return;

    if (appState.getUserId()) {
      const found = this.getFound();
      found.add(name);
      localStorage.setItem(this.storageKey("found"), JSON.stringify([...found]));
      // The finale gif is ~4MB; start fetching it while the last dance plays
      if (found.size === Object.keys(CHARACTER_TRACKS).length) new Image().src = FINALE_GIF;
    }
    this.playDance(CHARACTER_TRACKS[name]);
  }

  playDance(src) {
    this.stopDance();
    const audio = new Audio(src);
    const finished = () => {
      if (this.dance !== audio) return;
      this.dance = null;
      this.maybeStartFinale();
    };
    audio.addEventListener("ended", finished);
    // A track that can't play shouldn't block the finale
    audio.addEventListener("error", finished);
    this.dance = audio;
    audio.play().catch(() => {});
  }

  stopDance() {
    this.dance?.pause();
    this.dance = null;
  }

  maybeStartFinale() {
    if (!appState.getUserId() || this.finaleEl) return;
    if (localStorage.getItem(this.storageKey("done"))) return;
    const found = this.getFound();
    if (!Object.keys(CHARACTER_TRACKS).every((name) => found.has(name))) return;
    this.startFinale();
  }

  async startFinale() {
    localStorage.setItem(this.storageKey("done"), "1");

    const el = document.createElement("img");
    el.className = "wt-david-pumpkins";
    el.src = FINALE_GIF;
    el.alt = "David S. Pumpkins";
    el.title = "Click to dismiss";
    el.addEventListener("click", () => this.endFinale(), { once: true });
    this.finaleEl = el;

    // The gif is large; let it load before it rises
    await el.decode().catch(() => {});
    if (this.finaleEl !== el) return;
    document.body.appendChild(el);
    el.classList.add("is-rising");

    this.dispatchEvent(new CustomEvent("finale:start"));
    this.finaleAudio = new Audio(FINALE_AUDIO);
    this.finaleAudio.play().catch(() => {});
    await achievementService.awardByKey(ACHIEVEMENT_KEY);
  }

  endFinale() {
    const el = this.finaleEl;
    if (!el) return;
    this.finaleAudio?.pause();
    el.classList.replace("is-rising", "is-sinking");
    el.addEventListener("animationend", () => el.remove(), { once: true });
    this.finaleEl = null;
    this.dispatchEvent(new CustomEvent("finale:end"));
  }
}

export { DavidPumpkinsEgg };
