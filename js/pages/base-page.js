import { appState } from "../app.js";
import { audioManager, addClickSound } from "../utils/audio.js";

class BasePage {
  constructor({ requiresAuth = true } = {}) {
    this.requiresAuth = requiresAuth;
    this.supabase = appState.getSupabase();
    this.userId = appState.getUserId();
    this.currentUser = appState.getCurrentUser();
    this.eventCleanup = [];
    this.audioManager = audioManager;
  }

  async init() {
    console.log("🔧 BasePage.init() called");
    this.initUI();
    if (this.requiresAuth) {
      await this.initAuth();
    }
    this.setupHeadshotEventUpdates();
    await this.initAudio();
    await this.onReady();
  }

  async initAuth() {
    // Authentication and user event setup
    console.log("📍 Initializing appState...");
    const isAuthenticated = await appState.init();
    if (!isAuthenticated) {
      console.info("User not authenticated");
      return;
    }
    // Modern event-based subscription to app state changes
    const userLoadedCleanup = appState.on("user:loaded", (e) => {
      console.log("📡 user:loaded event received:", e.detail);
      this.handleStateChange("user-loaded", e.detail);
      this.supabase = appState.getSupabase();
      this.userId = appState.getUserId();
      this.currentUser = appState.getCurrentUser();
    });
    const userErrorCleanup = appState.on("user:error", (e) => {
      console.log("❌ user:error event received:", e.detail);
      this.handleStateChange("user-error", e.detail);
    });
    const userLogoutCleanup = appState.on("user:logout", (e) => {
      console.log("👋 user:logout event received:", e.detail);
      this.handleStateChange("user-logout", e.detail);
      this.supabase = appState.getSupabase();
      this.userId = appState.getUserId();
      this.currentUser = appState.getCurrentUser();
    });
    this.eventCleanup.push(userLoadedCleanup, userErrorCleanup, userLogoutCleanup);
    this.supabase = appState.getSupabase();
    this.userId = appState.getUserId();
    this.currentUser = appState.getCurrentUser();
    console.log("✅ User already loaded from appState:", this.currentUser?.username);
  }

  async initAudio() {
    // Audio setup
    this.setupAudio();
  }

  initUI() {
    // UI decoration (site awards, etc.)
    this.showRandomSiteAward();
  }

  handleStateChange(event, data) {
    switch (event) {
      case "user-loaded":
        this.currentUser = data;
        this.userId = data.id;
        this.onUserLoaded?.(data);
        break;
      case "user-error":
        this.onUserError?.(data);
        break;
      case "user-logout":
        this.currentUser = null;
        this.userId = null;
        this.onUserLogout?.(data);
        break;
      default:
        this.onStateChange?.(event, data);
    }
  }

  async onReady() {
    // Override in child classes
    console.log("Page ready");
  }

  setPageTitle(title) {
    const user = appState.getCurrentUser();
    const fullTitle = user && title === "Dashboard" ? `${user.display_name}'s ${title}` : title;
    document.title = `${fullTitle} - Birthday Challenge Zone`;
  }

  /**
   * Update all marquee elements with data-marquee="username" to display current user's name
   */
  updateMarqueeUsername() {
    if (this.currentUser?.display_name) {
      const marqueeElements = document.querySelectorAll('[data-marquee="username"]');
      marqueeElements.forEach((el) => {
        el.textContent = this.currentUser.display_name.toUpperCase();
      });
    }
  }

  isAdmin() {
    // Check if current user is an admin
    const adminUsernames = ["brianc", "admin"];
    return this.currentUser && adminUsernames.includes(this.currentUser.username);
  }

  // Challenge management methods that can be shared
  async markChallengeComplete(assignmentId, challengeId, outcome, brianMode) {
    try {
      const now = new Date().toISOString();

      // Update user's assignment with outcome
      const { error: updateError } = await this.supabase
        .from("assignments")
        .update({ completed_at: now, outcome: outcome })
        .eq("id", assignmentId);

      if (updateError) throw updateError;

      // Handle Brian challenges
      if (brianMode) {
        await this.handleBrianChallenge(challengeId, outcome, brianMode, now);
      }

      return true;
    } catch (err) {
      console.error("Error marking challenge complete:", err);
      throw err;
    }
  }

  async handleBrianChallenge(challengeId, outcome, brianMode, completedAt) {
    // Get brianc's user_id
    const { data: briancUser, error: briancError } = await this.supabase
      .from("users")
      .select("id")
      .eq("username", "brianc")
      .single();

    if (briancError) throw briancError;

    let briancOutcome;
    if (brianMode === "with") {
      briancOutcome = outcome;
    } else if (brianMode === "vs") {
      briancOutcome = outcome === "success" ? "failure" : "success";
    }

    // Create or update brianc's assignment
    const { error: briancAssignError } = await this.supabase.from("assignments").upsert(
      [
        {
          user_id: briancUser.id,
          challenge_id: challengeId,
          completed_at: completedAt,
          outcome: briancOutcome,
          active: true,
        },
      ],
      {
        onConflict: "user_id,challenge_id",
      }
    );

    if (briancAssignError) throw briancAssignError;
  }

  async enrichScoreboardWithCompletions(scoreboardData) {
    // Get all assignments to count completions per user
    const { data: assignmentsData, error: assignmentsError } = await this.supabase
      .from("assignments")
      .select("user_id, completed_at, outcome")
      .eq("active", true);

    if (assignmentsError) throw assignmentsError;

    // Count successful completions per user
    const completionCounts = {};
    assignmentsData?.forEach((assignment) => {
      if (assignment.completed_at && assignment.outcome === "success") {
        completionCounts[assignment.user_id] = (completionCounts[assignment.user_id] || 0) + 1;
      }
    });

    // Enrich scoreboard data with completion counts
    return scoreboardData.map((row) => ({
      ...row,
      challenges_completed: completionCounts[row.user_id] || 0,
    }));
  }

  async loadUserStats() {
    try {
      const [scoreboardData, assignmentData] = await Promise.all([
        this.supabase.from("scoreboard").select("*"),
        this.supabase
          .from("assignments")
          .select("id, completed_at")
          .eq("user_id", this.userId)
          .eq("active", true),
      ]);

      if (scoreboardData.error) throw scoreboardData.error;
      if (assignmentData.error) throw assignmentData.error;

      const userStats = scoreboardData.data?.find((row) => row.user_id === this.userId);
      const rank = scoreboardData.data?.findIndex((row) => row.user_id === this.userId) + 1;

      // Calculate assignment completion stats
      const totalAssigned = assignmentData.data?.length || 0;
      const totalCompleted = assignmentData.data?.filter((a) => a.completed_at).length || 0;

      return {
        userStats,
        rank,
        allStats: scoreboardData.data,
        assignmentStats: {
          totalAssigned,
          totalCompleted,
        },
      };
    } catch (err) {
      console.error("Error loading user stats:", err);
      throw err;
    }
  }

  cleanup() {
    // Clean up event listeners
    this.eventCleanup.forEach((cleanup) => cleanup());
    if (this.headshotUpdateCleanup) {
      this.headshotUpdateCleanup();
      this.headshotUpdateCleanup = null;
    }
    this.eventCleanup = [];
  }

  /**
   * Listen for headshot update events and update all data-headshot images
   */
  setupHeadshotEventUpdates() {
    const handler = (e) => {
      const { headshotUrl, userId } = e.detail;
      console.log("[HeadshotEvent] Received user:headshot-updated", { userId, headshotUrl });
      if (!userId) {
        console.warn("[HeadshotEvent] No userId in event detail", e.detail);
        return;
      }
      const imgs = document.querySelectorAll(`[data-headshot="user-${userId}"]`);
      console.log(`[HeadshotEvent] Found ${imgs.length} images for user-${userId}`);
      imgs.forEach((img) => {
        console.log("[HeadshotEvent] Updating headshot src", { img, headshotUrl });
        img.src = headshotUrl;
      });
    };
    console.log("[BasePage] Setting up headshot update listener");
    window.addEventListener("user:headshot-updated", handler);
    this.headshotUpdateCleanup = () => {
      window.removeEventListener("user:headshot-updated", handler);
    };
  }

  setupAudio() {
    // Preload click sound
    this.audioManager.preload("click", "/audio/click.mp3");
    this.audioManager.preload("success", "/audio/success.mp3");
    this.audioManager.preload("failure", "/audio/failure.mp3");
    this.audioManager.preload("menu", "/audio/menu.mp3");
    this.audioManager.preload("save", "/audio/save.mp3");
    this.audioManager.preload("favorite", "/audio/favorite.mp3");
    this.audioManager.preload("unfavorite", "/audio/unfavorite.mp3");

    // Initialize audio on first interaction (required for mobile)
    const initAudio = () => {
      this.audioManager.initialize();
      document.removeEventListener("click", initAudio);
    };
    document.addEventListener("click", initAudio, { once: true });

    // Add click sounds to common button selectors
    addClickSound("button:not([data-no-sound])");
    addClickSound("a.btn");
    addClickSound(".action-button");
  }

  // Utility methods
  showError(message) {
    console.error("❌", message);

    // Create error container if it doesn't exist
    let errorContainer = document.getElementById("errorMessages");
    if (!errorContainer) {
      errorContainer = document.createElement("div");
      errorContainer.id = "errorMessages";
      errorContainer.className = "error-messages";
      document.body.insertBefore(errorContainer, document.body.firstChild);
    }

    // Add error message
    const errorEl = document.createElement("div");
    errorEl.className = "error-message";
    errorEl.textContent = message;
    errorContainer.appendChild(errorEl);

    // Auto-remove after 5 seconds
    setTimeout(() => {
      errorEl.remove();
      if (errorContainer.children.length === 0) {
        errorContainer.remove();
      }
    }, 5000);
  }

  showSuccess(message) {
    console.log("✅", message);

    // Create success container if it doesn't exist
    let successContainer = document.getElementById("successMessages");
    if (!successContainer) {
      successContainer = document.createElement("div");
      successContainer.id = "successMessages";
      successContainer.className = "success-messages";
      document.body.insertBefore(successContainer, document.body.firstChild);
    }

    // Add success message
    const successEl = document.createElement("div");
    successEl.className = "success-message";
    successEl.textContent = message;
    successContainer.appendChild(successEl);

    // Auto-remove after 3 seconds
    setTimeout(() => {
      successEl.remove();
      if (successContainer.children.length === 0) {
        successContainer.remove();
      }
    }, 3000);
  }

  setLoadingState(elementId, isLoading = true) {
    const element = document.getElementById(elementId);
    if (element) {
      if (isLoading) {
        element.className = "loading";
        element.innerHTML = "Loading...";
      } else {
        // Clear loading state - remove class and content
        element.className = "";
        element.innerHTML = "";
      }
    }
  }

  /**
   * Display a random site-awards image at the bottom of the page
   */
  showRandomSiteAward() {
    const siteAwardsImages = [
      "images/site-awards_blink182.gif",
      "images/site-awards_hackers.gif",
      "images/site-awards_pikachu.gif",
      "images/site-awards_christian.gif",
      "images/site-awards_hanson.gif",
      "images/site-awards_aaroncarter.gif",
      "images/site-awards_angel.gif",
      "images/site-awards_pug.gif",
      "images/site-awards_predator.gif",
      "images/site-awards_southpark.gif",
    ];
    const randomAward = siteAwardsImages[Math.floor(Math.random() * siteAwardsImages.length)];
    const awardImg = document.createElement("img");
    awardImg.src = randomAward;
    awardImg.alt = "Site Award";
    awardImg.className = "site-awards-img";
    awardImg.style.display = "block";
    awardImg.style.margin = "40px auto 0 auto";
    awardImg.style.position = "relative";
    document.body.appendChild(awardImg);
  }
}

export { BasePage };
