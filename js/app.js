import { SUPABASE_CONFIG } from './config.js';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

class AppState {
    constructor() {
        this.supabase = createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.key);
        this.currentUser = null;
        this.userId = null;
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

            // Notify all subscribers
            this.notifySubscribers('user-loaded', this.currentUser);

        } catch (error) {
            console.error('Failed to load user profile:', error);
            this.redirectToLogin();
        }
    }

    initializeNavigation() {
        const navigation = document.querySelector('site-navigation');
        if (navigation && this.currentUser) {
            navigation.setCurrentUser(this.currentUser);
        }
    }

    // Subscribe to state changes
    subscribe(callback) {
        this.subscribers.add(callback);
        return () => this.subscribers.delete(callback);
    }

    // Notify subscribers of state changes
    notifySubscribers(event, data) {
        this.subscribers.forEach(callback => {
            try {
                callback(event, data);
            } catch (error) {
                console.error('Subscriber callback error:', error);
            }
        });
    }

    // Authentication methods
    logout() {
        localStorage.removeItem('user_id');
        localStorage.removeItem('username');
        this.currentUser = null;
        this.userId = null;
        this.redirectToLogin();
    }

    redirectToLogin() {
        window.location.href = 'index.html';
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

// Export both the instance and class
export { appState, AppState };