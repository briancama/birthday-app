/**
 * Audio Utility for Button Click Sounds
 * Respects user preferences for reduced motion and muted audio
 */

class AudioManager {
    constructor() {
        this.sounds = {};
        this.enabled = true;
        this.initialized = false;
        
        // Check user preferences
        this.checkPreferences();
        
        // Listen for preference changes
        if (window.matchMedia) {
            const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
            motionQuery.addEventListener('change', () => this.checkPreferences());
        }
    }

    checkPreferences() {
        // Respect prefers-reduced-motion (some users include sound in this)
        const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        
        // Check if user has muted (stored in localStorage)
        const userMuted = localStorage.getItem('audio-muted') === 'true';
        
        this.enabled = !prefersReducedMotion && !userMuted;
    }

    /**
     * Preload a sound file
     * @param {string} name - Identifier for the sound
     * @param {string} src - Path to audio file
     * @param {boolean} lazy - If true, don't download until first play (default: false)
     */
    preload(name, src, lazy = false) {
        if (!this.sounds[name]) {
            const audio = new Audio(src);
            audio.preload = lazy ? 'none' : 'auto'; // 'none' = lazy load, 'auto' = immediate download
            audio.volume = 0.3; // Set default volume (30%)
            this.sounds[name] = audio;
        }
    }

    /**
     * Play a sound effect
     * @param {string} name - Identifier for the sound to play
     */
    play(name) {
        if (!this.enabled) return;
        
        const sound = this.sounds[name];
        if (!sound) {
            console.warn(`Sound "${name}" not preloaded`);
            return;
        }

        // Clone the audio to allow overlapping plays
        const clone = sound.cloneNode();
        clone.volume = sound.volume;
        
        // Play the sound (user interaction makes this work on mobile)
        clone.play().catch(err => {
            // Silently fail if audio can't play (e.g., user hasn't interacted yet)
            console.debug('Audio play failed:', err.message);
        });
    }

    /**
     * Set global volume
     * @param {number} volume - Volume level (0.0 to 1.0)
     */
    setVolume(volume) {
        Object.values(this.sounds).forEach(sound => {
            sound.volume = Math.max(0, Math.min(1, volume));
        });
    }

    /**
     * Toggle audio on/off
     */
    toggle() {
        const newState = !this.enabled;
        this.enabled = newState;
        localStorage.setItem('audio-muted', (!newState).toString());
        return newState;
    }

    /**
     * Initialize audio on first user interaction (required for mobile)
     */
    initialize() {
        if (this.initialized) return;
        
        // On mobile, audio context needs user interaction to start
        // This method should be called on first click
        Object.values(this.sounds).forEach(sound => {
            sound.load();
        });
        
        this.initialized = true;
    }
}

// Export singleton instance
export const audioManager = new AudioManager();

/**
 * Add click sound to elements
 * @param {string} selector - CSS selector for elements
 * @param {string} soundName - Name of sound to play
 */
export function addClickSound(selector, soundName = 'click') {
    document.addEventListener('click', (e) => {
        const target = e.target.closest(selector);
        if (target && !target.disabled) {
            // Check for data-no-sound attribute
            if (target.hasAttribute('data-no-sound')) return;
            
            // Check for custom sound specified in data-sound attribute
            const customSound = target.getAttribute('data-sound');
            audioManager.play(customSound || soundName);
        }
    }, true); // Use capture phase to catch early
}

/**
 * Helper to add click sound to a specific element
 * @param {HTMLElement} element - DOM element
 * @param {string} soundName - Name of sound to play
 */
export function addElementClickSound(element, soundName = 'click') {
    element.addEventListener('click', () => {
        if (!element.disabled) {
            audioManager.play(soundName);
        }
    });
}
