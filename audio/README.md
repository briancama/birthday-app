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
  - Works on mobile (audio unlocks on first tap)
- Sounds are decoded into memory once (Web Audio), so file size barely matters for latency. Leading silence is skipped automatically.
- Use MP3 for sound effects; Safari can't reliably decode Ogg.
- Default volume is set to 30% to avoid being jarring
- File names are case-sensitive in production (Linux).

### Wallet coin drops

`coin_drop_15.wav`, `coin_drop_21.wav`, and `coin_drop_23.wav` are mono,
44.1 kHz / 16-bit PCM clips, about 0.34 / 0.25 / 0.43 seconds respectively.
Together they are about 88 KiB; keep these small WAVs rather than adding lossy
compression. All three peak at -3 dBFS; the audio manager's default 30% volume
keeps them restrained.

The wallet preloads and decodes all three on initialization without awaiting
them or delaying rendering. Each coin drop randomly chooses a clip other than
the previous choice, with at most one sound request per 500 ms. Playback starts
with the drop animation (not on a timer); longer vote audio is not stopped or
ducked. The shared engine skips leading silence and suppresses requests that
take more than 250 ms to become ready, rather than playing a delayed clink.
