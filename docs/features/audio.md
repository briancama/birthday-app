# Audio & Music

## What it is

Three audio layers: UI sound effects, a retro music player on event-info and profiles, and hidden secret tracks (see [easter-eggs.md](easter-eggs.md)).

## UI sound effects (`js/utils/audio.js`)

- Built on the Web Audio API: each file is fetched and decoded once, then every play starts from memory (a few ms). Leading silence is detected at decode time and skipped.
- All buttons (plus `a.btn`, `.action-button`) play a sound on press (`pointerdown`), not release. Keyboard activation still plays. Exceptions: `data-no-sound` elements, disabled buttons, users with `prefers-reduced-motion: reduce`, or manual mute.
- `preload(name, src, { lazy, volume })` (or a boolean `lazy`): eager sounds decode right away; lazy ones decode in idle time after page load.
- A sound that isn't ready within `LATE_PLAY_LIMIT_MS` (250ms) is dropped instead of playing late.
- The audio context unlocks on the first tap/click/key. On iPhone, sound effects obey the silent switch.
- Sidebar ad audio (`templates/partials/media-slot.ejs`) and gif-stepper sounds also go through `audioManager`, so they respect mute. Long tracks (music player, secret tracks, easter-egg songs) stay on `<audio>`.
- Mute preference persists in localStorage (`audio-muted`); global toggle component: `js/components/mute-button.js`.

```javascript
import { audioManager } from "./js/utils/audio.js";
audioManager.play("click");
audioManager.preload("error", "/audio/error.mp3");
audioManager.preload("ad", "/audio/ad.mp3", { lazy: true, volume: 0.8 });
audioManager.stop("ad");
audioManager.setVolume(0.5); // master volume
audioManager.toggle(); // mute/unmute, persisted
```

Sound files live in `/audio/` (`click.mp3`, `success.mp3`, …).

## Music player

- `js/components/music-player.js` renders the retro player; catalog metadata (artist, year, source) in `js/constants/music-songs.js`.
- Song files live in `/songs/` — **not in git**; synced to production via rsync (see [../DEPLOYMENT.md](../DEPLOYMENT.md)) and served directly by nginx.
- Users can favorite songs (`user_favorite_songs`) → `jukebox_hero` achievement.
- Secret tracks in `/songs/secret/` via `js/components/secret-track-player.js` → `secret_tracks` achievement.

## Accessibility

- `prefers-reduced-motion: reduce` disables SFX automatically.
- Manual mute always available and persisted.
