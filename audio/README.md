# 🔊 Audio Assets

## Sound Effects Needed

Add the following audio files to this directory:

### UI Sounds
- **click.mp3** - Button click sound effect
  - Duration: ~50-100ms
  - Suggested: Retro computer beep or arcade button sound
  - File size: < 10KB

- **success.mp3** - Success/completion sound
  - Duration: ~200-500ms
  - Suggested: Retro game success chime or "ding"
  - File size: < 20KB

### Free Sound Resources
- [Freesound.org](https://freesound.org) - Search for "button click" or "retro beep"
- [Zapsplat](https://zapsplat.com) - Free sound effects (requires free account)
- [Mixkit](https://mixkit.co/free-sound-effects/) - Free UI sounds
- [BFXR](https://www.bfxr.net/) - Generate retro game sounds in browser
- [ChipTone](https://sfbgames.itch.io/chiptone) - Retro sound effect generator
- [jsfxr](https://sfxr.me/) - Browser-based sound generator

### Format Specifications
- **Format**: MP3 (best cross-browser compatibility)
- **Sample rate**: 22050 Hz or 44100 Hz
- **Bitrate**: 64-128 kbps (sufficient for UI sounds)
- **Channels**: Mono (smaller file size)

### Notes
- Sound effects automatically respect user preferences:
  - Disabled for users with `prefers-reduced-motion: reduce`
  - Can be manually muted (stored in localStorage)
  - Works on mobile (initialized on first user interaction)
- Sounds are preloaded on page load for instant playback
- Default volume is set to 30% to avoid being jarring
