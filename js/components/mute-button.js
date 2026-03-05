/**
 * MuteButton – global floating mute component.
 *
 * Toggles both site click-sounds (via audioManager) and the music player mute
 * state in one tap. Designed to be used on any page that has a <music-player>
 * element, but can also work in click-sound-only mode.
 *
 * Usage (when ready to mount on a page):
 *
 *   import { MuteButton } from '../components/mute-button.js';
 *   import { audioManager } from '../utils/audio.js';
 *
 *   const muteButton = new MuteButton(audioManager);
 *   // muteButton.mount();                     // always visible
 *   // muteButton.mount({ showOnlyWhenPlaying: true, musicPlayerEl: playerEl });
 *   // later: muteButton.unmount();
 *
 * NOTE: Not mounted on any page yet — preserved here for future global use.
 */

import { audioManager } from "../utils/audio.js";

export class MuteButton {
  /**
   * @param {object} [options]
   * @param {boolean} [options.showOnlyWhenPlaying=false]
   *   When true the button is hidden by default and only shown while the music
   *   player is playing (wires up to music:play / music:pause events).
   * @param {HTMLElement|null} [options.musicPlayerEl=null]
   *   The <music-player> element to sync mute state with. If omitted the
   *   button only toggles click-sound audioManager.
   */
  constructor(options = {}) {
    this._options = Object.assign({ showOnlyWhenPlaying: false, musicPlayerEl: null }, options);
    this._el = null;
    this._cleanups = [];
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  /**
   * Create the button, append it to document.body, and wire up all events.
   * Idempotent – calling mount() twice is safe.
   */
  mount() {
    if (this._el) return; // already mounted

    const btn = document.createElement("button");
    btn.id = "globalMuteButton";
    btn.className = "mute-button";
    btn.setAttribute("aria-pressed", (!audioManager.enabled).toString());
    this._el = btn;
    this._updateUI();

    if (this._options.showOnlyWhenPlaying) {
      btn.style.display = "none";
      this._wirePlayerEvents();
    }

    const onClick = (e) => {
      e.stopPropagation();
      this._toggle();
    };
    btn.addEventListener("click", onClick);
    this._cleanups.push(() => btn.removeEventListener("click", onClick));

    document.body.appendChild(btn);
  }

  /**
   * Remove the button from the DOM and clean up all event listeners.
   */
  unmount() {
    this._cleanups.forEach((fn) => {
      try {
        fn();
      } catch (e) {
        /* ignore */
      }
    });
    this._cleanups = [];
    if (this._el) {
      this._el.remove();
      this._el = null;
    }
  }

  // ─── Private ───────────────────────────────────────────────────────────────

  _toggle() {
    // Toggle click sounds
    audioManager.toggle();

    // Toggle music player mute
    try {
      const playerEl = this._options.musicPlayerEl || document.querySelector("music-player");
      const prev = localStorage.getItem("music-muted") === "true";
      const next = !prev;
      localStorage.setItem("music-muted", next ? "true" : "false");
      if (playerEl && typeof playerEl.setMuted === "function") {
        playerEl.setMuted(next);
      } else if (playerEl && playerEl.audio) {
        playerEl.audio.muted = next;
      }
    } catch (err) {
      console.warn("[MuteButton] Failed to toggle music mute:", err);
    }

    this._updateUI();
  }

  _updateUI() {
    if (!this._el) return;

    // Prefer the actual music-player mute state if available
    let isMuted = false;
    try {
      const playerEl = this._options.musicPlayerEl || document.querySelector("music-player");
      if (playerEl && typeof playerEl.isMuted === "boolean") {
        isMuted = playerEl.isMuted;
      } else if (playerEl && playerEl.audio) {
        isMuted = !!playerEl.audio.muted;
      } else {
        isMuted = !audioManager.enabled;
      }
    } catch (e) {
      isMuted = !audioManager.enabled;
    }

    this._el.innerHTML = isMuted ? "🔇" : "🔊";
    this._el.title = isMuted ? "Unmute" : "Mute";
    this._el.setAttribute("aria-pressed", isMuted.toString());
  }

  _wirePlayerEvents() {
    const playerEl = this._options.musicPlayerEl || document.querySelector("music-player");
    if (!playerEl) return;

    const onPlay = () => {
      if (this._el) this._el.style.display = "flex";
    };
    const onPause = () => {
      if (this._el) this._el.style.display = "none";
    };

    playerEl.addEventListener("music:play", onPlay);
    playerEl.addEventListener("music:pause", onPause);
    this._cleanups.push(() => {
      playerEl.removeEventListener("music:play", onPlay);
      playerEl.removeEventListener("music:pause", onPause);
    });
  }
}
