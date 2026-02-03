import { SUPABASE_CONFIG } from './config.js';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { EventBus } from './events/event-bus.js';

// Environment detection
const isProduction = window.location.hostname !== 'localhost' &&
    window.location.hostname !== '127.0.0.1' &&
    !window.location.hostname.includes('github.io');

// Application Configuration (moved from config.js since that's gitignored)
const APP_CONFIG = {
    // Auto-refresh settings - more conservative in development
    enableAutoRefresh: true, // Enable auto-refresh for both dev and production
    refreshInterval: isProduction ? 30000 : 10000, // 30s production, 10s development for faster dev feedback

    // Performance settings
    useSmartRefresh: true, // Only update data, not images
    enableImageCaching: true, // Avoid re-requesting images

    // Development settings
    isDevelopment: !isProduction,
    isProduction: isProduction,

    // UI settings
    enableDebugLogging: !isProduction,
    showDeveloperTools: !isProduction,

    // Feature flags
    enableEventSystem: true,
    enableAdvancedErrorHandling: true
};

// Make APP_CONFIG available globally
window.APP_CONFIG = APP_CONFIG;

class AppState extends EventTarget {
    constructor() {
        super();
        this.supabase = createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.key);
        this.currentUser = null;
        this.userId = null;

        // Keep legacy subscribers for backward compatibility
        this.subscribers = new Set();
    }

    // Initialize the application
    async init() {
        // Check authentication
        this.userId = localStorage.getItem('user_id');
        const username = localStorage.getItem('username');

        if (!this.userId) {
            this.redirectToLogin();
            return false;
        }

        // Load full user profile
        await this.loadUserProfile();

        // Initialize navigation if present
        this.initializeNavigation();

        return true;
    }

    async loadUserProfile() {
        try {
            // Emit loading event
            this.dispatchEvent(new CustomEvent('user:loading'));
            EventBus.instance.emit(EventBus.EVENTS.USER.LOADING);

            const { data, error } = await this.supabase
                .from('users')
                .select('id, username, display_name, created_at')
                .eq('id', this.userId)
                .single();

            if (error) throw error;

            // Check if user is admin
            const adminUsernames = ['brianc', 'admin'];
            const isAdmin = adminUsernames.includes(data.username);

            this.currentUser = {
                id: this.userId,
                username: data.username,
                display_name: data.display_name,
                name: data.display_name || data.username,
                created_at: data.created_at,
                isAdmin: isAdmin
            };

            // Emit user loaded events
            const userLoadedEvent = new CustomEvent('user:loaded', {
                detail: this.currentUser
            });
            this.dispatchEvent(userLoadedEvent);
            EventBus.instance.emit(EventBus.EVENTS.USER.LOADED, this.currentUser);

            // Legacy subscriber support
            this.notifySubscribers('user-loaded', this.currentUser);

        } catch (error) {
            console.error('Failed to load user profile:', error);

            // Emit error events
            const errorDetail = {
                error: error.message,
                action: 'loadProfile',
                originalError: error
            };

            this.dispatchEvent(new CustomEvent('user:error', {
                detail: errorDetail
            }));
            EventBus.instance.emit(EventBus.EVENTS.USER.ERROR, errorDetail);

            this.redirectToLogin();
        }
    }

    initializeNavigation() {
        const navigation = document.querySelector('site-navigation');
        if (navigation && this.currentUser) {
            navigation.setCurrentUser(this.currentUser);
        }
    }

    // Modern event-based subscription (recommended)
    on(eventType, handler, options = {}) {
        this.addEventListener(eventType, handler, options);
        return () => this.removeEventListener(eventType, handler, options);
    }

    // Emit custom events
    emit(eventType, detail) {
        this.dispatchEvent(new CustomEvent(eventType, { detail }));
        EventBus.instance.emit(eventType, detail);
    }

    // Legacy subscription - DEPRECATED
    subscribe(callback) {
        console.warn('AppState.subscribe() is deprecated. Use appState.on(eventType, handler) instead.');
        this.subscribers.add(callback);
        return () => this.subscribers.delete(callback);
    }

    // Legacy subscriber notification - for backward compatibility
    notifySubscribers(event, data) {
        this.subscribers.forEach(callback => {
            try {
                callback(event, data);
            } catch (error) {
                console.error('Legacy subscriber callback error:', error);
            }
        });
    }

    // Authentication methods
    logout() {
        const previousUser = this.currentUser;

        localStorage.removeItem('user_id');
        localStorage.removeItem('username');
        this.currentUser = null;
        this.userId = null;

        // Emit logout events
        const logoutDetail = {
            previousUser,
            timestamp: new Date().toISOString()
        };

        this.dispatchEvent(new CustomEvent('user:logout', {
            detail: logoutDetail
        }));
        EventBus.instance.emit(EventBus.EVENTS.USER.LOGOUT, logoutDetail);

        this.redirectToLogin();
    }

    redirectToLogin() {
        window.location.href = '/';
    }

    // Getters for convenience
    getSupabase() {
        return this.supabase;
    }

    getCurrentUser() {
        return this.currentUser;
    }

    getUserId() {
        return this.userId;
    }
}

// Create singleton instance
const appState = new AppState();

// Export both the instance, class, and config
export { appState, AppState, APP_CONFIG };