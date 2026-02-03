/**
 * Global Event Bus for cross-component communication
 * Provides centralized event coordination and debugging
 */
class EventBus extends EventTarget {
    static instance = new EventBus();

    constructor() {
        super();
        this.eventLog = [];
        this.debugging = window.location.hostname === 'localhost' ||
            window.location.hostname === '127.0.0.1';
    }

    /**
     * Emit a typed event with validation and logging
     * @param {string} eventType - Event type from EventBus.EVENTS
     * @param {object} detail - Event data payload
     */
    emit(eventType, detail = {}) {
        if (this.debugging) {
            console.log(`🎯 Event: ${eventType}`, detail);
            this.eventLog.push({ eventType, detail, timestamp: Date.now() });
        }

        this.dispatchEvent(new CustomEvent(eventType, {
            detail,
            bubbles: true,
            cancelable: true
        }));
    }

    /**
     * Listen to events with automatic cleanup tracking
     * @param {string} eventType - Event type to listen for
     * @param {function} handler - Event handler function
     * @param {object} options - Event listener options
     * @returns {function} Cleanup function to remove listener
     */
    listen(eventType, handler, options = {}) {
        this.addEventListener(eventType, handler, options);

        // Return cleanup function
        return () => this.removeEventListener(eventType, handler, options);
    }

    /**
     * Get event history for debugging
     */
    getEventHistory() {
        return this.eventLog;
    }

    /**
     * Clear event history
     */
    clearEventHistory() {
        this.eventLog = [];
    }
}

/**
 * Typed event constants for type safety and organization
 */
EventBus.EVENTS = {
    // Challenge-related events
    CHALLENGE: {
        REVEAL: 'challenge:reveal',
        COMPLETE: 'challenge:complete',
        COMPLETED_SUCCESS: 'challenge:completed-success',
        COMPLETED_ERROR: 'challenge:completed-error',
        UPDATED: 'challenge:updated',
        LOADING: 'challenge:loading'
    },

    // User state events
    USER: {
        LOADED: 'user:loaded',
        LOADING: 'user:loading',
        ERROR: 'user:error',
        STATS_UPDATED: 'user:stats-updated',
        LOGOUT: 'user:logout'
    },

    // Navigation events
    NAVIGATION: {
        PAGE_CHANGE: 'nav:page-change',
        MENU_TOGGLE: 'nav:menu-toggle'
    },

    // App lifecycle events
    APP: {
        READY: 'app:ready',
        ERROR: 'app:error'
    }
};

// Development debugging helpers
if (EventBus.instance.debugging) {
    // Global event listener for debugging
    EventBus.instance.addEventListener('*', (e) => {
        // This doesn't work in practice, but we log all events in emit()
    });

    // Expose debugging tools to window
    window.EventBus = EventBus;
    window.debugEvents = () => {
        console.table(EventBus.instance.getEventHistory());
    };
    window.clearEventHistory = () => {
        EventBus.instance.clearEventHistory();
        console.log('Event history cleared');
    };
}

export { EventBus };