/**
 * Sound effects on the Web Audio API: each file is decoded once, then every
 * play starts from memory in a few ms.
 * Respects user preferences for reduced motion and muted audio.
 */

// A sound that isn't ready within this window is dropped; a late sound feels worse than none.
const LATE_PLAY_LIMIT_MS = 250;
const DEFAULT_VOLUME = 0.3;
// Many SFX files start with 20-200ms of silence; playback skips it.
const SILENCE_THRESHOLD = 0.003; // about -50dB
const SILENCE_PREROLL_MS = 3;

const leadingSilence = (buffer) => {
  let first = buffer.length;
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < first; i++) {
      if (Math.abs(data[i]) > SILENCE_THRESHOLD) {
        first = i;
        break;
      }
    }
  }
  if (first === buffer.length) return 0;
  return Math.max(0, first / buffer.sampleRate - SILENCE_PREROLL_MS / 1000);
};

const whenIdle = (fn) => {
  const run = () =>
    window.requestIdleCallback ? requestIdleCallback(fn, { timeout: 3000 }) : setTimeout(fn, 200);
  if (document.readyState === "complete") run();
  else window.addEventListener("load", run, { once: true });
};

class AudioManager {
  constructor() {
    // sounds: { [name]: { src, volume } }
    this.sounds = {};
    // src -> Promise<{ buffer, offset }|null>, shared when several names use one file
    this.loads = new Map();
    this.buffers = new Map();
    this.playing = {};
    this.enabled = true;

    this.ctx = new AudioContext({ latencyHint: "interactive" });
    this.master = this.ctx.createGain();
    this.master.connect(this.ctx.destination);

    // Browsers start the context suspended until a user gesture. Listeners stay
    // on so iOS interruptions (calls, Siri) recover on the next tap.
    const unlock = () => this.initialize();
    ["pointerdown", "touchend", "click", "keydown"].forEach((type) =>
      document.addEventListener(type, unlock, { capture: true, passive: true })
    );

    // Check user preferences
    this.checkPreferences();

    // Listen for preference changes
    if (window.matchMedia) {
      const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
      motionQuery.addEventListener("change", () => this.checkPreferences());
    }
  }

  checkPreferences() {
    // Respect prefers-reduced-motion (some users include sound in this)
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // Check if user has muted (stored in localStorage)
    const userMuted = localStorage.getItem("audio-muted") === "true";

    this.enabled = !prefersReducedMotion && !userMuted;
  }

  /**
   * Register a sound and start fetching + decoding it
   * @param {string} name - Identifier for the sound
   * @param {string} src - Path to audio file
   * @param {boolean|{lazy?: boolean, volume?: number}} options - lazy = decode in idle time after page load
   */
  preload(name, src, options = false) {
    if (this.sounds[name]) return;
    const { lazy = false, volume = DEFAULT_VOLUME } =
      typeof options === "boolean" ? { lazy: options } : options;
    this.sounds[name] = { src, volume };
    if (lazy) whenIdle(() => this._load(src));
    else this._load(src);
  }

  _load(src) {
    if (!this.loads.has(src)) {
      const load = fetch(src)
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.arrayBuffer();
        })
        .then((data) => this.ctx.decodeAudioData(data))
        .then((buffer) => {
          const decoded = { buffer, offset: leadingSilence(buffer) };
          this.buffers.set(src, decoded);
          return decoded;
        })
        .catch((err) => {
          console.debug(`Sound "${src}" failed to load:`, err.message);
          return null;
        });
      this.loads.set(src, load);
    }
    return this.loads.get(src);
  }

  /**
   * Play a sound effect
   * @param {string} name - Identifier for the sound to play
   */
  play(name) {
    if (!this.enabled) return;

    const sound = this.sounds[name];
    if (!sound) {
      console.warn(`Sound "${name}" not preloaded`);
      return;
    }

    const decoded = this.buffers.get(sound.src);
    if (decoded && this.ctx.state === "running") {
      this._start(name, decoded, sound.volume);
      return;
    }

    // Not decoded or not unlocked yet: wait, but don't play a stale sound later
    const requestedAt = performance.now();
    Promise.all([this.ctx.resume(), this._load(sound.src)])
      .then(([, loaded]) => {
        const fresh = performance.now() - requestedAt <= LATE_PLAY_LIMIT_MS;
        if (loaded && fresh && this.enabled) this._start(name, loaded, sound.volume);
      })
      .catch((err) => console.debug("Audio play failed:", err.message));
  }

  _start(name, { buffer, offset }, volume) {
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    const gain = this.ctx.createGain();
    gain.gain.value = volume;
    source.connect(gain).connect(this.master);

    const active = (this.playing[name] ??= new Set());
    active.add(source);
    source.onended = () => active.delete(source);
    source.start(0, offset);
  }

  /**
   * Stop every playing instance of a sound
   * @param {string} name - Identifier for the sound
   */
  stop(name) {
    this.playing[name]?.forEach((source) => source.stop());
    this.playing[name]?.clear();
  }

  /**
   * Set global volume
   * @param {number} volume - Volume level (0.0 to 1.0)
   */
  setVolume(volume) {
    this.master.gain.value = Math.max(0, Math.min(1, volume));
  }

  /**
   * Toggle audio on/off
   */
  toggle() {
    const newState = !this.enabled;
    this.enabled = newState;
    localStorage.setItem("audio-muted", (!newState).toString());
    return newState;
  }

  /**
   * Unlock audio; must run inside a user gesture on mobile
   */
  initialize() {
    if (this.ctx.state !== "running") this.ctx.resume().catch(() => {});
  }
}

// Export singleton instance
export const audioManager = new AudioManager();

/**
 * Play a sound when matching elements are pressed
 * @param {string} selector - CSS selector for elements
 * @param {string} soundName - Name of sound to play
 */
export function addClickSound(selector, soundName = "click") {
  const playFor = (e) => {
    const target = e.target.closest?.(selector);
    if (!target || target.disabled || target.hasAttribute("data-no-sound")) return;
    // data-sound picks a custom sound
    audioManager.play(target.getAttribute("data-sound") || soundName);
  };
  // Fire on press, not release: on phones click lands 80-150ms after the finger goes down.
  document.addEventListener(
    "pointerdown",
    (e) => {
      if (e.isPrimary && e.button === 0) playFor(e);
    },
    true
  );
  // Keyboard and programmatic clicks have no pointerdown
  document.addEventListener(
    "click",
    (e) => {
      if (e.detail === 0) playFor(e);
    },
    true
  );
}

/**
 * Helper to add click sound to a specific element
 * @param {HTMLElement} element - DOM element
 * @param {string} soundName - Name of sound to play
 */
export function addElementClickSound(element, soundName = "click") {
  element.addEventListener("click", () => {
    if (!element.disabled) {
      audioManager.play(soundName);
    }
  });
}
