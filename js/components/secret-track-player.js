// Fun pause messages for the secret track player
const SECRET_PAUSE_HINTS = [
  "Now that's what I call not listening...",
  "You know, you can't nominate me for a Grammy if you don't finish the album",
  "Legends say only true fans make it to the end.",
  "Come on, it's only 12 tracks. How bad can it be?",
  "Are you really giving up on those sweet, sweet points?"
];
// js/components/secret-track-player.js
// Secret Track Easter Egg — triggered by rewinding past track 0 on the music player.
// Presents an overlay player with 3 hidden songs that must each be listened to completion.
// Completing all 3 grants the "secret_tracks" achievement.

import { achievementService } from "../services/achievement-service.js";

const SECRET_SONGS = [
  { title: "She Bangs", url: "/songs/secret/she-bangs.mp3" },
  { title: "Friday", url: "/songs/secret/friday.mp3" },
  { title: "Chocolate Rain", url: "/songs/secret/chocolate-rain.mp3" },
];

const ACHIEVEMENT_KEY = "secret_tracks";

export class SecretTrackPlayer {
    _pauseHintIndex = 0;
  constructor() {
    this.currentTrack = 0;
    this.completedTracks = 0;
    this.audio = null;
    this.overlay = null;
  }

  open() {
    if (this.overlay) return;
    this._buildOverlay();
    document.body.appendChild(this.overlay);
    // Do not auto-load the first song; wait for user to click play
    this.currentTrack = 0;
    this.audio = null;
    const playBtn = this.overlay.querySelector("#secretPlayBtn");
    if (playBtn) {
      playBtn.textContent = "▶️";
      playBtn.style.display = "";
    }
    this._updateProgress(0, 0);
  }

  _buildOverlay() {
    this.overlay = document.createElement("div");
    this.overlay.className = "secret-player-overlay";
    this.overlay.innerHTML = `
      <div class="secret-player-modal">
        <div class="secret-player-header">
          <button class="secret-player-close" title="Exit secret track" aria-label="Close secret track">✖</button>
        </div>
        <div class="secret-player-track-info">
          <div style="visibility: hidden;" class="secret-player-track-number">Track <span id="secretTrackNum">1</span> of 12</div>
          <div class="secret-player-track-name" id="secretTrackName">BrisBops</div>
        </div>
        <div class="secret-player-progress-wrap">
          <div class="secret-player-progress-bar" id="secretProgressBar"></div>
        </div>
        <div class="secret-player-time" id="secretTime">0:00 / 0:00</div>
        <div class="secret-player-status" id="secretStatus">Now this is what I call music!!!</div>
        <div class="secret-player-hint" id="secretHint"></div>
      </div>
    `;

    this.overlay
      .querySelector(".secret-player-close")
      .addEventListener("click", () => this.close());
    this.overlay
      .querySelector("#secretPlayBtn")
      .addEventListener("click", () => this._togglePlayPause());
    // Temporary skip button for testing
    this.overlay
      .querySelector("#secretSkipBtn")
      .addEventListener("click", () => this._onTrackEnded());

    // Click outside the modal to close
    this.overlay.addEventListener("click", (e) => {
      if (e.target === this.overlay) this.close();
    });
  }

  _loadTrack(index) {
      this._pauseHintIndex = 0;
    this.currentTrack = index;
    const song = SECRET_SONGS[index];

    if (this.audio) {
      this.audio.pause();
      this.audio.src = "";
      this.audio = null;
    }
    // Set initial UI state
    const trackInfoEl = this.overlay.querySelector(".secret-player-track-number");
    if (trackInfoEl) trackInfoEl.style.visibility = "visible";
    const numEl = this.overlay.querySelector("#secretTrackNum");
    const nameEl = this.overlay.querySelector("#secretTrackName");
    const statusEl = this.overlay.querySelector("#secretStatus");
    const playBtn = this.overlay.querySelector("#secretPlayBtn");
    const hintEl = this.overlay.querySelector("#secretHint");

    if (numEl) numEl.textContent = index + 1;
    if (nameEl) nameEl.textContent = song.title;
    if (statusEl) statusEl.textContent = "Now this is what I call music!!!";
    if (playBtn) {
      playBtn.textContent = "▶️";
      playBtn.style.display = "";
    }
    if (hintEl) hintEl.textContent = ``;
    this._updateProgress(0, 0);

    this.audio = new Audio(song.url);
    this.audio.volume = 0.7;
    this.audio.addEventListener("ended", () => this._onTrackEnded());
    this.audio.addEventListener("timeupdate", () => this._onTimeUpdate());
    this.audio.addEventListener("loadedmetadata", () => this._onTimeUpdate());

    this.audio
      .play()
      .then(() => {
        if (playBtn) playBtn.textContent = "⏸️";
      })
      .catch(() => {
        if (playBtn) playBtn.textContent = "▶️";
      });
  }

  _togglePlayPause() {
    const playBtn = this.overlay.querySelector("#secretPlayBtn");
    const hintEl = this.overlay.querySelector("#secretHint");
    // If audio is not loaded, load and play the current track
    if (!this.audio) {
      this._loadTrack(this.currentTrack);
      return;
    }
    if (this.audio.paused) {
      this.audio.play().then(() => {
        if (playBtn) playBtn.textContent = "⏸️";
        if (hintEl) hintEl.textContent = "";
      });
    } else {
      this.audio.pause();
      if (playBtn) playBtn.textContent = "▶️";
      if (hintEl) {
        hintEl.textContent = SECRET_PAUSE_HINTS[this._pauseHintIndex] || SECRET_PAUSE_HINTS[SECRET_PAUSE_HINTS.length - 1];
        if (this._pauseHintIndex < SECRET_PAUSE_HINTS.length - 1) this._pauseHintIndex++;
      }
    }
  }

  _onTimeUpdate() {
    if (!this.audio) return;
    this._updateProgress(this.audio.currentTime, this.audio.duration || 0);
  }

  _updateProgress(current, duration) {
    const bar = this.overlay?.querySelector("#secretProgressBar");
    const timeEl = this.overlay?.querySelector("#secretTime");
    if (!bar || !timeEl) return;
    const pct = duration > 0 ? (current / duration) * 100 : 0;
    bar.style.width = pct + "%";
    timeEl.textContent = `${this._fmtTime(current)} / ${this._fmtTime(duration)}`;
  }

  _fmtTime(secs) {
    if (!secs || isNaN(secs)) return "0:00";
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60)
      .toString()
      .padStart(2, "0");
    return `${m}:${s}`;
  }

  _onTrackEnded() {
    this.completedTracks++;
    const playBtn = this.overlay?.querySelector("#secretPlayBtn");
    if (playBtn) playBtn.textContent = "▶️";

    if (this.completedTracks >= 3) {
      this._onAllTracksComplete();
    } else {
      const statusEl = this.overlay?.querySelector("#secretStatus");
      const hintEl = this.overlay?.querySelector("#secretHint");
      const remaining = 3 - this.completedTracks;
      if (statusEl) statusEl.textContent = "✓ Track complete! Loading next...";
      if (hintEl) hintEl.textContent = '';
      setTimeout(() => this._loadTrack(this.completedTracks), 1500);
    }
  }

  async _onAllTracksComplete() {
    const statusEl = this.overlay?.querySelector("#secretStatus");
    const hintEl = this.overlay?.querySelector("#secretHint");
    const nameEl = this.overlay?.querySelector("#secretTrackName");
    const playBtn = this.overlay?.querySelector("#secretPlayBtn");
    const trackInfoEl = this.overlay.querySelector(".secret-player-track-number");

    if (statusEl) statusEl.textContent = "★ YOU FOUND ALL THE SECRET TRACKS! ★";
    if (hintEl) hintEl.textContent = "Achievement unlocked!";
    if (nameEl) nameEl.textContent = "12! Can you imagine!?";
    if (trackInfoEl) trackInfoEl.style.visibility = "hidden";
    if (playBtn) playBtn.style.display = "none";

    try {
      await achievementService.awardByKey(ACHIEVEMENT_KEY, {
        details: { source: "secret_rewind" },
      });
    } catch (err) {
      console.warn("[SecretTrackPlayer] Failed to award achievement:", err);
    }

    setTimeout(() => this.close(), 6000);
  }

  close() {
    if (this.audio) {
      this.audio.pause();
      this.audio.src = "";
      this.audio = null;
    }
    if (this.overlay?.parentNode) {
      this.overlay.parentNode.removeChild(this.overlay);
    }
    this.overlay = null;
  }
}
