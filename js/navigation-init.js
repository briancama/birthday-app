// Navigation initialization and user management

import { SiteNavigation } from './components/navigation.js';
import { SUPABASE_CONFIG } from './config.js';

// Initialize navigation with current user
document.addEventListener('DOMContentLoaded', async () => {
    const navigation = document.querySelector('site-navigation');

    if (navigation) {
        // Get current user from session storage
        const currentUserData = sessionStorage.getItem('currentUser');

        if (currentUserData) {
            try {
                const currentUser = JSON.parse(currentUserData);
                navigation.setCurrentUser(currentUser);
            } catch (error) {
                console.error('Error parsing user data:', error);
                // Redirect to login if user data is corrupted
                window.location.href = 'index.html';
            }
        } else {
            // No user found, redirect to login
            window.location.href = 'index.html';
        }
    }
});

// Export navigation utilities
export function updateNavigationUser(userData) {
    const navigation = document.querySelector('site-navigation');
    if (navigation) {
        navigation.setCurrentUser(userData);
    }
}

export function clearNavigationUser() {
    const navigation = document.querySelector('site-navigation');
    if (navigation) {
        navigation.setCurrentUser(null);
    }
}