// js/components/music-player.js
// Retro Music Player Component (2000s style)
// Usage: new MusicPlayer({ songs, onSongSelect })
import { appState } from "../app.js";

class MusicPlayer extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.songs = [];
    this.currentIndex = 0;
    this.audio = null;
    this.isPlaying = false;
    this.onSongSelect = null;
  }

  connectedCallback() {
    this.render();
    // Attach event listeners only once
    this.shadowRoot.addEventListener("click", (e) => {
      console.log(e.target); // Debug: log clicked element
      if (e.target.closest(".music-fav-btn")) {
        const idx = parseInt(e.target.dataset.songIdx, 10);
        console.log("[music-fav-btn] Clicked. idx:", idx);
        if (!isNaN(idx)) {
          this.setFavoriteSongIdx(idx);
          // Debug: log after setting favorite
          setTimeout(() => {
            console.debug(
              "[music-fav-btn] After setFavoriteSongIdx, favIdx:",
              this.getFavoriteSongIdx(),
              "currentIndex:",
              this.currentIndex
            );
          }, 0);
          this.render();
        }
      }
      if (e.target.classList.contains("music-play-btn")) {
        this.togglePlayPause();
      }
      if (e.target.classList.contains("music-next-btn")) {
        this.nextSong();
      }
      if (e.target.classList.contains("music-prev-btn")) {
        this.prevSong();
      }
    });
    this.shadowRoot.addEventListener("input", (e) => {
      if (e.target.classList.contains("music-volume-slider")) {
        this.setVolume(parseFloat(e.target.value));
      }
      if (e.target.classList.contains("music-progress-bar")) {
        this._onSeek(e);
      }
    });
    this.shadowRoot.addEventListener("change", (e) => {
      if (e.target.classList.contains("music-song-select")) {
        const idx = parseInt(e.target.value, 10);
        if (!isNaN(idx)) {
          this.playSong(idx);
        }
      }
    });
  }

  disconnectedCallback() {
    this.cleanup();
  }

  setSongs(songs) {
    this.songs = songs;
    if (this.currentIndex >= songs.length) this.currentIndex = 0;
    this.render();
  }

  setOnSongSelect(callback) {
    this.onSongSelect = callback;
  }

  playSong(idx = this.currentIndex) {
    if (!this.songs.length) return;
    if (this.audio) {
      this.audio.pause();
      this.audio.removeEventListener("ended", this._boundOnEnded);
      this.audio.removeEventListener("timeupdate", this._boundOnTimeUpdate);
      this.audio = null;
    }
    this.currentIndex = idx;
    const song = this.songs[this.currentIndex];
    this.audio = new Audio(song.url);
    this.audio.volume = 0.8;
    // Bind event handlers
    this._boundOnEnded = this._onEnded.bind(this);
    this._boundOnTimeUpdate = this._onTimeUpdate.bind(this);
    this.audio.addEventListener("ended", this._boundOnEnded);
    this.audio.addEventListener("timeupdate", this._boundOnTimeUpdate);
    this.audio.play();
    this.isPlaying = true;
    this.render();
    if (this.onSongSelect) this.onSongSelect(song);
  }
  _onTimeUpdate() {
    this.updateUI();
  }

  _onSeek(e) {
    if (this.audio) {
      this.audio.currentTime = parseFloat(e.target.value);
      this.updateUI();
    }
  }

  _onSeekEnd(e) {
    if (this.audio) {
      this.dragging = false;
      this.audio.currentTime = parseFloat(e.target.value);
      this.render();
    }
  }

  pauseSong() {
    if (this.audio) {
      this.audio.pause();
      this.isPlaying = false;
      this.render();
    }
  }

  togglePlayPause() {
    if (!this.audio) {
      this.playSong();
    } else if (this.isPlaying) {
      this.pauseSong();
    } else {
      this.audio.play();
      this.isPlaying = true;
      this.render();
    }
  }

  nextSong() {
    if (!this.songs.length) return;
    let nextIdx = (this.currentIndex + 1) % this.songs.length;
    this.playSong(nextIdx);
  }

  prevSong() {
    if (!this.songs.length) return;
    let prevIdx = (this.currentIndex - 1 + this.songs.length) % this.songs.length;
    this.playSong(prevIdx);
  }

  setVolume(vol) {
    if (this.audio) {
      this.audio.volume = vol;
    }
  }

  _onEnded() {
    // Stop at the end of the track — do not auto-advance to the next song
    this.isPlaying = false;
    if (this.audio) {
      try {
        this.audio.pause();
        // Ensure the UI shows the track at its end
        this.audio.currentTime = this.audio.duration || this.audio.currentTime;
      } catch (e) {
        /* ignore */
      }
    }
    this.render();
  }

  getFavoriteSongIdx() {
    const favUrl = localStorage.getItem("musicPlayerFavoriteSongUrl");
    if (!favUrl || !this.songs.length) return null;
    return this.songs.findIndex((s) => s.url === favUrl);
  }

  async setFavoriteSongIdx(idx) {
    const song = this.songs[idx];
    if (!song) {
      console.warn("[setFavoriteSongIdx] No song at idx:", idx);
      return;
    }
    console.log("[setFavoriteSongIdx] Setting favorite idx:", idx, "url:", song.url);
    localStorage.setItem("musicPlayerFavoriteSongUrl", song.url);
    // Supabase update
    try {
      const supabase = appState.getSupabase();
      const userId = appState.getUserId();
      if (!userId) {
        console.warn("[setFavoriteSongIdx] No userId, skipping Supabase update.");
        return;
      }
      const songId = song.url;
      // Upsert favorite
      const { error } = await supabase.from("user_favorite_songs").upsert(
        {
          user_id: userId,
          song_id: songId,
        },
        { onConflict: ["user_id"] }
      );
      if (error) {
        console.error("[setFavoriteSongIdx] Supabase error:", error);
      } else {
        console.debug(
          "[setFavoriteSongIdx] Supabase upsert success for user:",
          userId,
          "song:",
          songId
        );
      }
    } catch (err) {
      console.error("[setFavoriteSongIdx] Exception during Supabase update:", err);
    }
  }

  cleanup() {
    if (this.audio) {
      this.audio.pause();
      this.audio.removeEventListener("ended", this._boundOnEnded);
      this.audio.removeEventListener("timeupdate", this._boundOnTimeUpdate);
      this.audio = null;
    }
  }

  render() {
    const style = `
      <style>
        .music-player {
          background: #222;
          color: #fff;
          border: 2px solid #ff69b4;
          padding: 16px;
          border-radius: 12px;
          font-family: 'Tahoma', Geneva, cursive, sans-serif;
          width: 100%;
          max-width: 100%;
          box-sizing:border-box;
          box-shadow: 0 0 12px #ff69b4;
        }
        .music-title {
            font-size: 1.1em;
            margin-bottom: 16px;
            color: #ffec00;
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .music-controls {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 10px;
        }
        .music-play-btn, .music-next-btn, .music-prev-btn {
          background: #ff69b4;
          color: #fff;
          border: none;
          border-radius: 50%;
          width: 32px;
          height: 32px;
          font-size: 1.2em;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .music-play-btn.active {
          background: #ffec00;
          color: #222;
        }
        .music-current {
          margin-top: 10px;
          font-size: 0.95em;
          color: #00e6e6;
        }
        .music-volume-slider {
          width: 80px;
        }
        .music-icon {
          height: 1.2rem;
          filter: drop-shadow(1px 1px 1px pink);
        }
        .music-time {
          width: 32px;
        }
        .music-song-dropdown {
        margin-top: 10px;
        display: flex;
        align-items: center;
        justify-content: flex-start;
        }
        .music-song-select {
        width: 100%;
        max-width: 320px;
        font-size: 1em;
        padding: 6px 12px;
        border-radius: 6px;
        border: 2px solid #ff69b4;
        background: #181818;
        color: #fff;
        font-family: inherit;
        margin-top: 2px;
        }
        .music-song-select:focus {
        outline: 2px solid #ffec00;
        }
            .music-fav-btn {
      color: #ffec00;
      font-size: 1.2em;
      margin-left: 4px;
      transition: filter 0.2s;
    }
    .music-fav-btn:hover {
      filter: brightness(1.2);
    }
      </style>
    `;
    let song = this.songs[this.currentIndex];
    let duration = this.audio && this.audio.duration ? this.audio.duration : 0;
    let currentTime = this.audio && this.audio.currentTime ? this.audio.currentTime : 0;
    const favIdx = this.getFavoriteSongIdx();
    const controls = `
      <div class="music-controls">
        <button class="music-prev-btn" title="Previous">⏮️</button>
        <button class="music-play-btn${this.isPlaying ? " active" : ""}" title="Play/Pause">${this.isPlaying ? "⏸️" : "▶️"}</button>
        <button class="music-next-btn" title="Next">⏭️</button>
        <input type="range" min="0" max="1" step="0.01" value="${this.audio ? this.audio.volume : 0.8}" class="music-volume-slider" title="Volume" />
      </div>
      <div style="display: flex; align-items: center; gap: 6px;">
        <span class="music-time" id="music-current-time"></span>
        <input type="range" min="0" max="${duration}" step="0.1" value="${currentTime}" class="music-progress-bar" title="Seek" id="music-progress-bar" />
        <span class="music-time" id="music-duration-time"></span>
      </div>
    `;
    const current = song
      ? `<div class="music-current">Now Playing: <b>${song.title}</b>
        <button class="music-fav-btn" title="Set Favorite" data-song-idx="${this.currentIndex}" style="background:none;border:none;cursor:pointer;font-size:1.2em;vertical-align:middle;margin-left:6px;">
          ${favIdx === this.currentIndex ? "⭐" : "☆"}
        </button>
      </div>`
      : `<div class="music-current">No song selected</div>`;

    const songDropdown = this.songs.length
      ? `<div class="music-song-dropdown">
      <select class="music-song-select" title="Select Song">
        ${this.songs
          .map(
            (s, i) => `
          <option value="${i}"${i === this.currentIndex ? " selected" : ""}>${favIdx === i ? "⭐ " : ""}${s.title}</option>
        `
          )
          .join("")}
      </select>
    </div>`
      : "";

    this.shadowRoot.innerHTML = `
  ${style}
  <div class="music-player">
    <div class="music-title"><img class="music-icon" src="images/music_note.gif" alt="Music Icon" /> 2000s Music Player</div>
    ${controls}
    ${current}
    ${songDropdown}
  </div>
`;

    this.updateUI();
  }

  updateUI() {
    const formatTime = (t) => {
      if (!isFinite(t)) return "0:00";
      const m = Math.floor(t / 60);
      const s = Math.floor(t % 60)
        .toString()
        .padStart(2, "0");
      return `${m}:${s}`;
    };
    let duration = this.audio && this.audio.duration ? this.audio.duration : 0;
    let currentTime = this.audio && this.audio.currentTime ? this.audio.currentTime : 0;
    const currentTimeElem = this.shadowRoot.getElementById("music-current-time");
    const durationElem = this.shadowRoot.getElementById("music-duration-time");
    const progressBar = this.shadowRoot.getElementById("music-progress-bar");
    if (currentTimeElem) currentTimeElem.textContent = formatTime(currentTime);
    if (durationElem) durationElem.textContent = formatTime(duration);
    if (progressBar) {
      progressBar.max = duration.toString();
      progressBar.value = currentTime.toString();
    }
  }
}

customElements.define("music-player", MusicPlayer);

export { MusicPlayer };
