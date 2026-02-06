# Audio Setup Guide

## Overview
Button click sounds have been integrated into the app with full support for:
- ✅ Mobile devices (iOS/Android)
- ✅ User accessibility preferences (`prefers-reduced-motion`)
- ✅ Manual mute/unmute toggle
- ✅ Automatic initialization on first user interaction

## How It Works

### Automatic Click Sounds
All buttons automatically play a click sound when clicked, except:
- Buttons with `data-no-sound` attribute
- Disabled buttons
- When user has `prefers-reduced-motion: reduce` enabled
- When user has manually muted audio

### Adding Sound Files

1. **Download sound effects** (or create your own):
   - `click.mp3` - Short button click (~50-100ms)
   - `success.mp3` - Success chime (~200-500ms)

2. **Free sound resources**:
   - [Freesound.org](https://freesound.org) - Search for "button click" or "retro beep"
   - [Zapsplat](https://zapsplat.com) - Free sound effects
   - [Mixkit](https://mixkit.co/free-sound-effects/) - Free UI sounds

3. **Place files in**:
   ```
   /audio/click.mp3
   /audio/success.mp3
   ```

### Usage Examples

#### Basic Usage (Already Configured)
```javascript
// All buttons automatically get click sounds
<button>Click Me</button>

// Disable sound for specific button
<button data-no-sound>Silent Button</button>
```

#### Manual Sound Triggering
```javascript
import { audioManager } from './js/utils/audio.js';

// Play a specific sound
audioManager.play('click');
audioManager.play('success');

// Preload custom sounds
audioManager.preload('error', '/audio/error.mp3');
audioManager.play('error');
```

#### Adding Custom Sounds
```javascript
import { addElementClickSound } from './js/utils/audio.js';

const myButton = document.getElementById('myButton');
addElementClickSound(myButton, 'success'); // Use different sound
```

#### User Controls
```javascript
import { audioManager } from './js/utils/audio.js';

// Toggle mute/unmute (saves to localStorage)
const isEnabled = audioManager.toggle();
console.log(`Audio ${isEnabled ? 'enabled' : 'disabled'}`);

// Adjust volume (0.0 to 1.0)
audioManager.setVolume(0.5); // 50% volume
```

## Mobile Considerations

### iOS/Safari
- Audio must be initialized on user interaction (handled automatically)
- First click initializes audio system, subsequent clicks play sounds
- Works with silent mode switch (respects device settings)

### Android/Chrome
- Similar restrictions to iOS
- Auto-initializes on first user interaction

## Accessibility

### Respects User Preferences
```css
/* Users with this setting won't hear sounds */
@media (prefers-reduced-motion: reduce) {
  /* Audio automatically disabled */
}
```

### Manual Override
Users can disable sounds even if they don't have `prefers-reduced-motion` set:
```javascript
// Stored in localStorage as 'audio-muted'
audioManager.toggle(); // Saves preference
```

## Adding a Mute Button (Optional)

Add this to your navigation or settings:

```html
<button id="audioToggle" aria-label="Toggle audio">
  <span class="audio-icon">🔊</span>
</button>
```

```javascript
import { audioManager } from './js/utils/audio.js';

const audioToggle = document.getElementById('audioToggle');
const icon = audioToggle.querySelector('.audio-icon');

audioToggle.addEventListener('click', () => {
  const enabled = audioManager.toggle();
  icon.textContent = enabled ? '🔊' : '🔇';
  audioToggle.setAttribute('aria-label', `Audio ${enabled ? 'on' : 'off'}`);
});

// Set initial state
icon.textContent = audioManager.enabled ? '🔊' : '🔇';
```

## Testing

### Test on Desktop
1. Click any button - should hear click sound
2. Open DevTools Console → Check for "Audio play failed" (means not initialized yet)
3. Click again - should work

### Test on Mobile
1. Open page in mobile browser
2. First click initializes audio system
3. Subsequent clicks play sounds
4. Test with device on silent mode

### Test Accessibility
1. **System Settings** → **Accessibility** → Enable "Reduce Motion"
2. Reload page
3. Buttons should NOT play sounds

### Test Manual Mute
1. Call `audioManager.toggle()` in console
2. Buttons should be silent
3. Refresh page - preference persists

## Troubleshooting

### Sounds not playing
- Check browser console for errors
- Verify audio files exist at `/audio/click.mp3`
- Ensure user has interacted with page (clicked something)
- Check if `prefers-reduced-motion` is enabled

### Sounds play on desktop but not mobile
- First interaction initializes audio - this is expected
- Check if device is in silent mode
- Verify file format (MP3 works best cross-browser)

### Too loud/quiet
```javascript
audioManager.setVolume(0.3); // 30% volume (default)
```

## File Size Recommendations

- **Click sound**: < 10KB (short beep)
- **Success sound**: < 20KB (longer chime)
- **Format**: MP3 (best compatibility) or OGG
- **Sample rate**: 22050 Hz or 44100 Hz
- **Bitrate**: 64-128 kbps (plenty for UI sounds)

## Example Sound Files

If you need quick placeholder sounds, you can use these web-based tools:
- [BFXR](https://www.bfxr.net/) - Generate retro game sounds
- [ChipTone](https://sfbgames.itch.io/chiptone) - Retro sound effect generator
- [jsfxr](https://sfxr.me/) - Browser-based sound generator
