import { appState } from '../app.js';
import { EventBus } from '../events/event-bus.js';

class SiteNavigation extends HTMLElement {
    constructor() {
        super();
        this.currentUser = null;
        this.currentPage = this.getCurrentPage();
        this.eventCleanup = [];
    }

    connectedCallback() {
        this.render();
        this.setupEventListeners();

        // Set user if already loaded
        if (appState.getCurrentUser()) {
            this.setCurrentUser(appState.getCurrentUser());
        }
    }

    setupEventListeners() {
        // Modern event-based subscription to appState
        const userLoadedCleanup = appState.on('user:loaded', (e) => {
            this.setCurrentUser(e.detail);
        });

        const userLogoutCleanup = appState.on('user:logout', (e) => {
            this.currentUser = null;
            this.render();
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

    disconnectedCallback() {
        // Clean up event listeners
        this.eventCleanup.forEach(cleanup => cleanup());
        this.eventCleanup = [];
    }

    handlePageChange(detail) {
        const { page, source } = detail;
        if (page !== this.currentPage) {
            this.currentPage = page;
            this.render();
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
        if (path.includes('cocktail-rubric')) return 'rubric';
        if (path.includes('challenges-submit')) return 'challenges-submit';
        if (path.includes('admin-approvals')) return 'admin-approvals';
        return 'dashboard'; // default
    }

    getPageTitle() {
        const pageTitles = {
            'dashboard': 'Dashboard',
            'leaderboard': 'Leaderboard',
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
        this.render(); // This will call addEventListeners again
    }

    render() {
        this.innerHTML = `
            <nav class="site-navigation">
                <!-- Mobile Menu Toggle -->
                <button class="mobile-menu-toggle" aria-label="Toggle navigation menu">
                    <span class="hamburger-icon">☰</span>
                </button>

                <!-- Page Title / User Info -->
                <div class="nav-user-info">
                    <div class="user-welcome">
                        <img src="images/star_icon.gif" alt="star" class="icon-gif hide-mobile">
                        <span>${this.getPageTitle()}</span>
                        <img src="images/star_icon.gif" alt="star" class="icon-gif">
                    </div>
                </div>

                <!-- Navigation Menu -->
                <div class="nav-menu">
                    <!-- Navigation Links -->
                    <div class="nav-tabs">
                        <a href="dashboard.html" class="nav-tab ${this.currentPage === 'dashboard' ? 'active' : ''}">
                            <img src="images/home.gif" alt="home" class="icon-gif icon-gif--lg icon-gif--with-text">
                            <span>DASHBOARD</span>
                        </a>
                        <a href="challenges-submit.html" class="nav-tab ${this.currentPage === 'challenges-submit' ? 'active' : ''}">
                            <img src="images/star_icon.gif" alt="star" class="icon-gif icon-gif--with-text">
                            <span>SUBMIT CHALLENGE</span>
                        </a>
                        <a href="leaderboard.html" class="nav-tab ${this.currentPage === 'leaderboard' ? 'active' : ''}">
                            <img src="images/trophy.gif" alt="trophy" class="icon-gif icon-gif--with-text">
                            <span>LEADERBOARD</span>
                        </a>
                        ${this.currentUser?.isAdmin ? `
                        <a href="admin-approvals.html" class="nav-tab ${this.currentPage === 'admin-approvals' ? 'active' : ''}">
                            <img src="images/star_icon.gif" alt="admin" class="icon-gif icon-gif--with-text">
                            <span>🔐 ADMIN</span>
                        </a>
                        ` : ''}
                        <a href="cocktail-rubric.html" class="nav-tab ${this.currentPage === 'rubric' ? 'active' : ''}">
                            <img src="images/star_icon.gif" alt="star" class="icon-gif icon-gif--with-text">
                            <span>RUBRIC</span>
                        </a>
                        <button class="nav-tab logout-btn">
                            <img src="images/logout.gif" alt="logout" class="icon-gif icon-gif--lg icon-gif--with-text">
                            <span>LOGOUT</span>
                        </button>
                    </div>
                </div>
            </nav>
        `;

        // Add event listeners AFTER rendering
        this.addEventListeners();
    }

    addEventListeners() {
        // Mobile menu toggle
        const menuToggle = this.querySelector('.mobile-menu-toggle');
        const navMenu = this.querySelector('.nav-menu');

        if (menuToggle && navMenu) {
            menuToggle.addEventListener('click', (e) => {
                e.preventDefault(); // Prevent any default button behavior
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
                console.log('📱 After toggle - active:', menuToggle.classList.contains('active'));
                console.log('📱 Nav menu classes:', navMenu.className);
            });
        }

        // Logout functionality
        const logoutBtn = this.querySelector('.logout-btn');
        logoutBtn?.addEventListener('click', (e) => {
            e.preventDefault();
            appState.logout();
        });

        // Close mobile menu when clicking a link
        const navLinks = this.querySelectorAll('.nav-tab:not(.logout-btn)');
        navLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                console.log('🔗 Nav link clicked, closing mobile menu');

                // Extract page from href for event
                const href = link.getAttribute('href');
                const page = href ? href.replace('.html', '') : 'unknown';

                // Emit navigation event
                EventBus.instance.emit(EventBus.EVENTS.NAVIGATION.PAGE_CHANGE, {
                    page,
                    source: 'navigation-click',
                    href
                });

                // Close mobile menu
                if (navMenu) {
                    navMenu.classList.remove('mobile-open');
                }
                if (menuToggle) {
                    menuToggle.classList.remove('active');
                }
            });
        });
    }
}

// Register the custom element
customElements.define('site-navigation', SiteNavigation);

// Export for use in other modules
export { SiteNavigation };