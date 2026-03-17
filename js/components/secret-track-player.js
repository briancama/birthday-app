// js/components/secret-track-player.js
// Secret Track Easter Egg — triggered by rewinding past track 0 on the music player.
// Presents an overlay player with 3 hidden songs that must each be listened to completion.
// Completing all 3 grants the "secret_tracks" achievement.

import { achievementService } from "../services/achievement-service.js";

const SECRET_SONGS = [
  { title: "She Bangs", url: "/songs/secret/secret-track-1.mp3" },
  { title: "Friday", url: "/songs/secret/secret-track-2.mp3" },
  { title: "Chocolate Rain", url: "/songs/secret/secret-track-3.mp3" },
];

const ACHIEVEMENT_KEY = "secret_tracks";

export class SecretTrackPlayer {
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
    this._loadTrack(0);
  }

  _buildOverlay() {
    this.overlay = document.createElement("div");
    this.overlay.className = "secret-player-overlay";
    this.overlay.innerHTML = `
      <div class="secret-player-modal">
        <div class="secret-player-header">
          <span class="secret-player-title">◄◄ HIDDEN TRACK</span>
          <button class="secret-player-close" title="Exit secret track" aria-label="Close secret track">✖</button>
        </div>
        <div class="secret-player-track-info">
          <div class="secret-player-track-number">Track <span id="secretTrackNum">1</span> of 3</div>
          <div class="secret-player-track-name" id="secretTrackName">Loading...</div>
        </div>
        <div class="secret-player-progress-wrap">
          <div class="secret-player-progress-bar" id="secretProgressBar"></div>
        </div>
        <div class="secret-player-time" id="secretTime">0:00 / 0:00</div>
        <div class="secret-player-status" id="secretStatus">You must listen to the full track to continue...</div>
        <div class="secret-player-controls">
          <button class="secret-player-play-btn" id="secretPlayBtn" aria-label="Play/Pause">▶️</button>
        </div>
        <div class="secret-player-hint" id="secretHint">Complete all 3 tracks to earn an achievement.</div>
      </div>
    `;

    this.overlay
      .querySelector(".secret-player-close")
      .addEventListener("click", () => this.close());
    this.overlay
      .querySelector("#secretPlayBtn")
      .addEventListener("click", () => this._togglePlayPause());

    // Click outside the modal to close
    this.overlay.addEventListener("click", (e) => {
      if (e.target === this.overlay) this.close();
    });
  }

  _loadTrack(index) {
    this.currentTrack = index;
    const song = SECRET_SONGS[index];

    if (this.audio) {
      this.audio.pause();
      this.audio.src = "";
      this.audio = null;
    }

    const numEl = this.overlay.querySelector("#secretTrackNum");
    const nameEl = this.overlay.querySelector("#secretTrackName");
    const statusEl = this.overlay.querySelector("#secretStatus");
    const playBtn = this.overlay.querySelector("#secretPlayBtn");
    const hintEl = this.overlay.querySelector("#secretHint");

    if (numEl) numEl.textContent = index + 1;
    if (nameEl) nameEl.textContent = song.title;
    if (statusEl) statusEl.textContent = "You must listen to the full track to continue...";
    if (playBtn) {
      playBtn.textContent = "▶️";
      playBtn.style.display = "";
    }
    if (hintEl) hintEl.textContent = `Complete all 3 tracks to earn an achievement.`;
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
    if (!this.audio) return;
    const playBtn = this.overlay.querySelector("#secretPlayBtn");
    if (this.audio.paused) {
      this.audio.play().then(() => {
        if (playBtn) playBtn.textContent = "⏸️";
      });
    } else {
      this.audio.pause();
      if (playBtn) playBtn.textContent = "▶️";
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
      if (hintEl) hintEl.textContent = `${remaining} track${remaining !== 1 ? "s" : ""} remaining`;
      setTimeout(() => this._loadTrack(this.completedTracks), 1500);
    }
  }

  async _onAllTracksComplete() {
    const statusEl = this.overlay?.querySelector("#secretStatus");
    const hintEl = this.overlay?.querySelector("#secretHint");
    const nameEl = this.overlay?.querySelector("#secretTrackName");
    const playBtn = this.overlay?.querySelector("#secretPlayBtn");
    const numEl = this.overlay?.querySelector("#secretTrackNum");

    if (statusEl) statusEl.textContent = "★ YOU FOUND ALL THE SECRET TRACKS! ★";
    if (hintEl) hintEl.textContent = "Achievement unlocked!";
    if (nameEl) nameEl.textContent = "The Full Brian Experience";
    if (numEl) numEl.textContent = "3";
    if (playBtn) playBtn.style.display = "none";

    try {
      await achievementService.awardByKey(ACHIEVEMENT_KEY, {
        details: { source: "secret_rewind" },
      });
    } catch (err) {
      console.warn("[SecretTrackPlayer] Failed to award achievement:", err);
    }

    setTimeout(() => this.close(), 4000);
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
