/**
 * YTMNDEasterEgg
 *
 * Watches for clicks on [data-ytmnd] letters in the correct order: Y → T → M → N → D.
 * On sequence completion:
 *   1. Plays /audio/ytmnd.mp3
 *   2. Shows a retro modal with Hello My Future Girlfriend copy
 *   3. Dispatches achievement:trigger for the "ytmnd" key
 *   4. Provides a button linking to /ytmnd.html
 *
 * Usage:
 *   import { YTMNDEasterEgg } from '../components/ytmnd-easter-egg.js';
 *   const egg = new YTMNDEasterEgg();
 *   egg.init();
 *   // later: egg.destroy();
 */

import { audioManager } from "../utils/audio.js";

const SEQUENCE = ["Y", "T", "M", "N", "D"];
const AUDIO_KEY = "ytmnd";
const AUDIO_SRC = "/audio/ytmnd.wav";
const ACHIEVEMENT_KEY = "ytmnd";
const STORAGE_KEY = "ytmnd-found";

export class YTMNDEasterEgg {
  constructor(options = {}) {
    this._progress = 0;
    this._clickHandler = null;
    this._modal = null;
    this._enabled = options.enabled !== false; // default enabled, respects explicit false
  }

  init() {
    // Preload the audio lazily
    audioManager.preload(AUDIO_KEY, AUDIO_SRC, true);

    // Already found — don't attach sequence listener but still let them revisit
    // (achievement won't double-award; just skip the modal nag)

    this._clickHandler = (e) => {
      const letter = e.target.closest("[data-ytmnd]");
      if (!letter) return; // ignore clicks on anything that isn't a YTMND letter

      // Early exit if easter egg is disabled
      if (!this._enabled) return;

      const expected = SEQUENCE[this._progress];
      const actual = letter.dataset.ytmnd.toUpperCase();

      if (actual === expected) {
        this._progress++;
        // Persist the hit highlight until the sequence completes or is reset
        letter.classList.add("ytmnd-letter--hit");
        // Auditory confirmation on each correct step
        try {
          audioManager.play("click");
        } catch (_) {}

        if (this._progress >= SEQUENCE.length) {
          this._complete();
        }
      } else {
        // Wrong order — flash red briefly, then reset the whole sequence
        letter.classList.add("ytmnd-letter--miss");
        setTimeout(() => {
          letter.classList.remove("ytmnd-letter--miss");
          this._reset();
        }, 400);
      }
    };

    document.addEventListener("click", this._clickHandler);
  }

  setEnabled(enabled) {
    this._enabled = enabled;
  }

  destroy() {
    if (this._clickHandler) {
      document.removeEventListener("click", this._clickHandler);
      this._clickHandler = null;
    }
    this._removeModal();
  }

  // ─── Private ───────────────────────────────────────────────────────────────

  _reset() {
    this._progress = 0;
    // Remove persisted hit highlights from all letters
    try {
      document
        .querySelectorAll("[data-ytmnd].ytmnd-letter--hit")
        .forEach((el) => el.classList.remove("ytmnd-letter--hit"));
    } catch (e) {
      /* ignore */
    }
  }

  _complete() {
    this._reset();

    // Play audio
    try {
      audioManager.initialize();
      audioManager.play(AUDIO_KEY);
    } catch (err) {
      /* ignore */
    }

    // Mark as found in localStorage so we know they've seen it
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch (_) {}

    this._showModal();
    // Clear any highlights after showing the modal so the UI doesn't keep them
    try {
      document
        .querySelectorAll("[data-ytmnd].ytmnd-letter--hit")
        .forEach((el) => el.classList.remove("ytmnd-letter--hit"));
    } catch (e) {
      /* ignore */
    }
  }

  _showModal() {
    this._removeModal(); // safety: remove any stale one

    const overlay = document.createElement("div");
    overlay.className = "ytmnd-modal-overlay";
    overlay.setAttribute("data-ytmnd-modal", "");

    const box = document.createElement("div");
    box.className = "ytmnd-modal";
    box.setAttribute("data-ytmnd-modal", "");

    box.innerHTML = `
      <div class="ytmnd-modal__inner">
        <div class="ytmnd-modal__header">
          <marquee class="ytmnd-modal__marquee" behavior="scroll" direction="left">YOU'RE THE MAN NOW DOG &nbsp;&nbsp;&bull;&nbsp;&nbsp; YOU'RE THE MAN NOW DOG &nbsp;&nbsp;&bull;&nbsp;&nbsp;</marquee>
        </div>
        <div class="ytmnd-modal__body">
          <h2 class="ytmnd-modal__title">You just found Forrester</h2>
          <p class="ytmnd-modal__copy">
            It's 2001. You just watched the movie <em>Finding Forrester</em>. It's time to build an entire web empire based on tiled images of Sean Connery with the line "You're the man now, dog!" playing on repeat. This is what the internet was made for.
          </p>
          <p class="ytmnd-modal__fineprint">(until the site gets coopted by racists and nazis turning it into a cesspool, but let's not think about that right now)</p>
          <p class="ytmnd-modal__copy">
            Now enter my own personal YTMND handcrafted just for you.
          </p>
          <div class="ytmnd-modal__actions">
            <a href="/ytmnd.html" class="ytmnd-modal__btn" target="_blank" rel="noopener">
              Enter YTMND &rarr;
            </a>
            <button class="ytmnd-modal__close" type="button">Close</button>
          </div>
        </div>
      </div>
    `;

    box.querySelector(".ytmnd-modal__close").addEventListener("click", () => this._removeModal());
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) this._removeModal();
    });

    overlay.appendChild(box);
    document.body.appendChild(overlay);
    this._modal = overlay;

    // Trap focus on the modal
    requestAnimationFrame(() => {
      const btn = box.querySelector(".ytmnd-modal__btn");
      if (btn) btn.focus();
    });
  }

  _removeModal() {
    if (this._modal) {
      this._modal.remove();
      this._modal = null;
    }
  }
}
