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
        return 'dashboard'; // default
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

                <!-- User Info (Mobile Top Bar) -->
                <div class="mobile-user-info">
                    ${this.currentUser ? `
                        <span class="username">
                            <img src="images/star_icon.gif" alt="star" class="icon-gif icon-gif--sm">
                            ${this.currentUser.name}
                            <img src="images/star_icon.gif" alt="star" class="icon-gif icon-gif--sm">
                        </span>
                    ` : ''}
                </div>

                <!-- Navigation Menu -->
                <div class="nav-menu">
                    <!-- User Info (Desktop) -->
                    <div class="nav-user-info">
                        ${this.currentUser ? `
                            <div class="user-welcome">
                                <img src="images/star_icon.gif" alt="star" class="icon-gif">
                                Welcome back, <span class="username">${this.currentUser.name}</span>!
                                <img src="images/star_icon.gif" alt="star" class="icon-gif">
                            </div>
                        ` : ''}
                    </div>

                    <!-- Navigation Links -->
                    <div class="nav-tabs">
                        <a href="dashboard.html" class="nav-tab ${this.currentPage === 'dashboard' ? 'active' : ''}">
                            <img src="images/home.gif" alt="home" class="icon-gif icon-gif--lg">
                            DASHBOARD
                        </a>
                        <a href="leaderboard.html" class="nav-tab ${this.currentPage === 'leaderboard' ? 'active' : ''}">
                            <img src="images/trophy.gif" alt="trophy" class="icon-gif">
                            LEADERBOARD  
                        </a>
                        <a href="cocktail-rubric.html" class="nav-tab ${this.currentPage === 'rubric' ? 'active' : ''}">
                            <img src="images/star_icon.gif" alt="star" class="icon-gif">
                            RUBRIC
                        </a>
                        <button class="nav-tab logout-btn">
                            <img src="images/logout.gif" alt="logout" class="icon-gif icon-gif--lg">
                            LOGOUT
                        </button>
                    </div>
                </div>
            </nav>
        `;

        // Add event listeners AFTER rendering
        this.addEventListeners();
    }

    addEventListeners() {
        console.log('🔧 Setting up navigation event listeners...');

        // Mobile menu toggle
        const menuToggle = this.querySelector('.mobile-menu-toggle');
        const navMenu = this.querySelector('.nav-menu');

        console.log('📱 Mobile menu toggle found:', !!menuToggle);
        console.log('📱 Nav menu found:', !!navMenu);
        console.log('📱 Current viewport width:', window.innerWidth);

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
        } else {
            console.error('❌ Could not find menu toggle or nav menu elements!');
        }

        // Logout functionality
        const logoutBtn = this.querySelector('.logout-btn');
        console.log('🚪 Logout button found:', !!logoutBtn);

        logoutBtn?.addEventListener('click', (e) => {
            e.preventDefault();
            console.log('🚪 Logout clicked');
            appState.logout();
        });

        // Close mobile menu when clicking a link
        const navLinks = this.querySelectorAll('.nav-tab:not(.logout-btn)');
        console.log('🔗 Nav links found:', navLinks.length);

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