# Audio & Music

## What it is

Three audio layers: UI sound effects, a retro music player on event-info and profiles, and hidden secret tracks (see [easter-eggs.md](easter-eggs.md)).

## UI sound effects (`js/utils/audio.js`)

- All buttons auto-play a click sound, except: `data-no-sound` buttons, disabled buttons, users with `prefers-reduced-motion: reduce`, or manual mute.
- Audio initializes on first user interaction (required by iOS/Android autoplay policies).
- Mute preference persists in localStorage (`audio-muted`); global toggle component: `js/components/mute-button.js`.

```javascript
import { audioManager } from "./js/utils/audio.js";
audioManager.play("click");
audioManager.preload("error", "/audio/error.mp3");
audioManager.setVolume(0.5);
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
