/**
 * Bottom Menu Component
 * Fixed sticky navigation menu at bottom of screen on mobile
 */
import { appState } from "../app.js";

export class BottomMenu extends HTMLElement {
  constructor() {
    super();
    this.cleanupFunctions = [];
  }

  connectedCallback() {
    this.render();
    this.setupEventListeners();
    this.showMenu();
    document.body.classList.add("has-bottom-menu");
    const cleanup = appState.on("user:loaded", () => this.render());
    if (cleanup) this.cleanupFunctions.push(cleanup);
  }

  disconnectedCallback() {
    this.cleanupFunctions.forEach((cleanup) => cleanup());
    document.body.classList.remove("has-bottom-menu");
  }

  render() {
    const currentUser = appState.getCurrentUser();
    const profileLink = currentUser
      ? `<a href="/users/${encodeURIComponent(currentUser.username)}" class="bottom-menu-item" data-page="profile" title="My Profile">
          <span class="bottom-menu-icon"><img src="/images/pencil.gif" alt="Edit ProfileIcon"></span>
          <span class="bottom-menu-label">Profile</span>
        </a>`
      : "";

    this.innerHTML = `
      <nav class="bottom-menu" role="navigation" aria-label="Bottom navigation">
        <a href="/dashboard.html" class="bottom-menu-item" data-page="dashboard" title="Home">
          <span class="bottom-menu-icon"><img src="/images/home.gif" alt="Home Icon"></span>
          <span class="bottom-menu-label">Home</span>
        </a>

        <a href="/friends" class="bottom-menu-item" data-page="friends" title="Friends">
          <span class="bottom-menu-icon"><img src="/images/friends.gif" alt="Friends Icon"></span>
          <span class="bottom-menu-label">Friends</span>
        </a>

        <a href="/scoreboard" class="bottom-menu-item" data-page="scoreboard" title="Scoreboard">
          <span class="bottom-menu-icon"><img src="/images/leaderboard.gif" alt="Scoreboard Icon"></span>
          <span class="bottom-menu-label">Scoreboard</span>
        </a>

        ${profileLink}
      </nav>
    `;

    this.updateActivePage();
    this.attachClickListeners();
    this.showMenu();
  }

  setupEventListeners() {
    this.attachClickListeners();
  }

  attachClickListeners() {
    this.querySelectorAll(".bottom-menu-item").forEach((link) => {
      link.addEventListener("click", () => {
        if (link.getAttribute("data-sound") === undefined) {
          link.setAttribute("data-sound", "menu");
        }
      });
    });
  }

  updateActivePage() {
    const currentPage = this.getCurrentPage();
    this.querySelectorAll(".bottom-menu-item").forEach((item) => {
      const page = item.getAttribute("data-page");
      if (page === currentPage) {
        item.classList.add("active");
      } else {
        item.classList.remove("active");
      }
    });
  }

  getCurrentPage() {
    const path = window.location.pathname;
    if (path.includes("dashboard")) return "dashboard";
    if (path.includes("scoreboard")) return "scoreboard";
    if (path.includes("friends")) return "friends";
    if (path.includes("/users/")) return "profile";
    return null;
  }

  showMenu() {
    const nav = this.querySelector(".bottom-menu");
    if (nav) {
      nav.classList.add("loaded");
    }
  }
} // Register web component
customElements.define("bottom-menu", BottomMenu);
