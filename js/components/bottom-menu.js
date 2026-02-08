/**
 * Bottom Menu Component
 * Fixed sticky navigation menu at bottom of screen on mobile
 */
import { appState } from '../app.js';

export class BottomMenu extends HTMLElement {
  constructor() {
    super();
    this.cocktailCompetitionActive = false;
    this.cleanupFunctions = [];
  }

  connectedCallback() {
    this.render();
    this.setupEventListeners();
    this.checkCocktailCompetition().then(() => {
      // Show menu after checks complete
      this.showMenu();
    });
    
    // Subscribe to app state changes
    appState.on('user:loaded', () => this.updateMenuState());
  }

  disconnectedCallback() {
    this.cleanupFunctions.forEach(cleanup => cleanup());
  }

  render() {
    this.innerHTML = `
      <nav class="bottom-menu" role="navigation" aria-label="Bottom navigation">
        <a href="dashboard.html" class="bottom-menu-item" data-page="dashboard" title="Home">
          <span class="bottom-menu-icon"><img src="images/home.gif" alt="Home Icon"></span>
          <span class="bottom-menu-label">Home</span>
        </a>
        
        <a href="leaderboard.html" class="bottom-menu-item" data-page="leaderboard" title="Leaderboard">
          <span class="bottom-menu-icon"><img src="images/trophy.gif" alt="Trophy Icon"></span>
          <span class="bottom-menu-label">Scores</span>
        </a>
        
        <a href="challenges-submit.html" class="bottom-menu-item" data-page="challenges-submit" title="Submit Challenge">
          <span class="bottom-menu-icon"><img src="images/plus.gif" alt="Challenge Icon"></span>
          <span class="bottom-menu-label">Submit</span>
        </a>
        
        <a href="cocktail-judging.html" class="bottom-menu-item" data-page="cocktail-judging" title="Judge Cocktails" style="display: none;" id="bottomMenuCocktail">
          <span class="bottom-menu-icon"><img src="images/cocktail_coke.gif" alt="Cocktail Icon"></span>
          <span class="bottom-menu-label">Judge</span>
        </a>
      </nav>
    `;
  }

  setupEventListeners() {
    // Set active page
    this.updateActivePage();
    
    // Audio for menu clicks
    this.querySelectorAll('.bottom-menu-item').forEach(link => {
      link.addEventListener('click', () => {
        if (link.getAttribute('data-sound') === undefined) {
          link.setAttribute('data-sound', 'menu');
        }
      });
    });
  }

  updateActivePage() {
    const currentPage = this.getCurrentPage();
    this.querySelectorAll('.bottom-menu-item').forEach(item => {
      const page = item.getAttribute('data-page');
      if (page === currentPage) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });
  }

  getCurrentPage() {
    const path = window.location.pathname;
    if (path.includes('dashboard')) return 'dashboard';
    if (path.includes('leaderboard')) return 'leaderboard';
    if (path.includes('challenges-submit')) return 'challenges-submit';
    if (path.includes('cocktail-judging')) return 'cocktail-judging';
    return null;
  }

  async checkCocktailCompetition() {
    try {
      const supabase = appState.getSupabase();
      const { data: competitions, error } = await supabase
        .from('cocktail_competitions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1);

      if (error) throw error;

      if (competitions && competitions.length > 0) {
        this.cocktailCompetitionActive = true;
        this.showCocktailMenu();
      }
    } catch (err) {
      console.error('Error checking cocktail competition:', err);
    }
  }

  showCocktailMenu() {
    const cocktailItem = document.getElementById('bottomMenuCocktail');
    if (cocktailItem) {
      cocktailItem.style.display = 'flex';
    }
  }

  updateMenuState() {
    this.updateActivePage();
  }

  showMenu() {
    const nav = this.querySelector('.bottom-menu');
    if (nav) {
      nav.classList.add('loaded');
    }
  }
}// Register web component
customElements.define('bottom-menu', BottomMenu);
