import { appState } from '../app.js';
import { EventBus } from '../events/event-bus.js';
import { audioManager } from '../utils/audio.js';

class NavigationController {
    constructor() {
        this.currentUser = null;
        this.currentPage = this.getCurrentPage();
        this.eventCleanup = [];
    }

    init() {
        // Initialize navigation behavior on existing HTML
        this.setupEventListeners();
        this.addDOMEventListeners();

        // Set user if already loaded
        if (appState.getCurrentUser()) {
            this.setCurrentUser(appState.getCurrentUser());
        } else {
            // Set initial page title
            this.updatePageTitle();
        }
    }

    setupEventListeners() {
        // Modern event-based subscription to appState
        const userLoadedCleanup = appState.on('user:loaded', (e) => {
            this.setCurrentUser(e.detail);
        });

        const userLogoutCleanup = appState.on('user:logout', (e) => {
            this.currentUser = null;
            this.updatePageTitle();
            this.updateAdminVisibility();
        });

        const userErrorCleanup = appState.on('user:error', (e) => {
            console.error('Navigation: User error', e.detail);
            this.showUserError(e.detail);
        });

        // Listen to global navigation events
        const pageChangeCleanup = EventBus.instance.listen(EventBus.EVENTS.NAVIGATION.PAGE_CHANGE, (e) => {
            this.handlePageChange(e.detail);
        });

        // Store cleanup functions
        this.eventCleanup.push(
            userLoadedCleanup,
            userLogoutCleanup,
            userErrorCleanup,
            pageChangeCleanup
        );
    }

    addDOMEventListeners() {
        // Mobile menu toggle
        const menuToggle = document.querySelector('.mobile-menu-toggle');
        const navMenu = document.querySelector('.nav-menu');

        if (menuToggle && navMenu) {
            menuToggle.addEventListener('click', (e) => {
                e.preventDefault();
                console.log('🎯 Mobile menu toggle CLICKED!');
                console.log('📱 Before toggle - mobile-open:', navMenu.classList.contains('mobile-open'));

                const wasOpen = navMenu.classList.contains('mobile-open');
                navMenu.classList.toggle('mobile-open');
                menuToggle.classList.toggle('active');

                // Emit menu toggle event
                EventBus.instance.emit(EventBus.EVENTS.NAVIGATION.MENU_TOGGLE, {
                    isOpen: !wasOpen,
                    source: 'mobile-toggle'
                });

                console.log('📱 After toggle - mobile-open:', navMenu.classList.contains('mobile-open'));
            });
        }

        // Close mobile menu when clicking nav links
        const navLinks = document.querySelectorAll('.nav-tab:not(.logout-btn)');
        navLinks.forEach(link => {
            link.addEventListener('click', () => {
                if (navMenu) {
                    navMenu.classList.remove('mobile-open');
                }
                if (menuToggle) {
                    menuToggle.classList.remove('active');
                }
            });
        });

        // Logout functionality
        const logoutBtn = document.querySelector('.logout-btn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', (e) => {
                e.preventDefault();
                appState.logout();
            });
        }
    }

    cleanup() {
        // Clean up event listeners
        this.eventCleanup.forEach(cleanup => cleanup());
        this.eventCleanup = [];
    }

    handlePageChange(detail) {
        const { page, source } = detail;
        if (page !== this.currentPage) {
            this.currentPage = page;
            this.updatePageTitle();
            this.updateActiveTab();
        }
    }

    showUserError(errorDetail) {
        // Could show a temporary error message in the navigation
        console.warn('Navigation: User authentication error', errorDetail);
        // For now, just log it - could add error UI later
    }

    getCurrentPage() {
        const path = window.location.pathname;
        if (path.includes('dashboard')) return 'dashboard';
        if (path.includes('leaderboard')) return 'leaderboard';
        if (path.includes('cocktail-judging')) return 'cocktail-judging';
        if (path.includes('cocktail-rubric')) return 'rubric';
        if (path.includes('challenges-submit')) return 'challenges-submit';
        if (path.includes('admin-approvals')) return 'admin-approvals';
        return 'dashboard'; // default
    }

    getPageTitle() {
        const pageTitles = {
            'dashboard': 'Dashboard',
            'leaderboard': 'Leaderboard',
            'cocktail-judging': 'Cocktail Judging',
            'rubric': 'Cocktail Rubric',
            'challenges-submit': 'Challenge Workshop',
            'admin-approvals': 'Admin Approvals'
        };
        const title = pageTitles[this.currentPage] || 'Dashboard';

        // Apply same logic as BasePage.setPageTitle()
        return this.currentUser && title === 'Dashboard'
            ? `${this.currentUser.name}'s ${title}`
            : title;
    }

    setCurrentUser(user) {
        this.currentUser = user;
        this.updatePageTitle();
        this.updateAdminVisibility();
    }

    updatePageTitle() {
        const titleElement = document.querySelector('[data-nav="page-title"]');
        if (titleElement) {
            titleElement.textContent = this.getPageTitle();
        }
    }

    updateAdminVisibility() {
        const adminLink = document.querySelector('[data-admin-only]');
        if (adminLink) {
            adminLink.style.display = this.currentUser?.isAdmin ? '' : 'none';
        }
    }

    updateActiveTab() {
        // Update active state on navigation tabs
        const tabs = document.querySelectorAll('.nav-tab[data-page]');
        tabs.forEach(tab => {
            if (tab.dataset.page === this.currentPage) {
                tab.classList.add('active');
            } else {
                tab.classList.remove('active');
            }
        });
    }
}

// Export singleton instance and initializer
const navigationController = new NavigationController();

export function initNavigation() {
    navigationController.init();
    return navigationController;
}

export { NavigationController };