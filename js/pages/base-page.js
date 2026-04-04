import { appState } from "../app.js";
import { audioManager, addClickSound } from "../utils/audio.js";
import { achievementService } from "../services/achievement-service.js";
import { EventBus } from "../events/event-bus.js";
import * as notificationService from "../services/notification-service.js";
import { initNavigation } from "../components/navigation.js";

class BasePage {
  constructor({
    requiresAuth = true,
    suppressAchievementSound = false,
    siteAward = undefined,
  } = {}) {
    this.requiresAuth = requiresAuth;
    this.suppressAchievementSound = suppressAchievementSound;
    // siteAward: false/null = disable; { img, sound } or img string = force specific award
    this.siteAward = siteAward;
    this.supabase = appState.getSupabase();
    this.userId = appState.getUserId();
    this.currentUser = appState.getCurrentUser();
    this.eventCleanup = [];
    this.audioManager = audioManager;
  }

  async init() {
    // Wire navigation immediately — before any async work so the mobile menu
    // toggle is interactive right away without waiting for auth / audio / etc.
    initNavigation();
    // One-time reset: clear stale audio-muted / music-muted flags so users
    // aren't silently stuck with muted audio after this deploy.
    const AUDIO_RESET_KEY = "audio-reset-v1";
    if (!localStorage.getItem(AUDIO_RESET_KEY)) {
      localStorage.removeItem("audio-muted");
      localStorage.removeItem("music-muted");
      localStorage.setItem(AUDIO_RESET_KEY, "1");
    }
    this.initUI();
    if (this.requiresAuth) {
      await this.initAuth();
    } else {
      // Non-auth pages still try to silently load the user so features like
      // achievement awarding have a userId to work with.
      await appState.softInit().catch(() => {});
      this.userId = appState.getUserId();
      this.currentUser = appState.getCurrentUser();
    }
    this.setupHeadshotEventUpdates();
    // Run audio init, achievement service, and SW registration in parallel —
    // none depends on the others, so no reason to wait for each sequentially.
    await Promise.all([
      this.initAudio(),
      achievementService
        .init()
        .then(() => {
          // Centralized achievement handler used for both EventBus and window events
          const handleAchievementAward = (e) => {
            try {
              const detail = e.detail || {};
              // Support both EventBus shape { name, points } and window shape { achievement: { name, points } }
              const name =
                detail.name || detail.achievement?.name || detail.achievementKey || "Achievement";
              const points = detail.points || detail.achievement?.points || 0;

              // Ensure the success container is attached to document.body so it's in the topmost DOM order
              const existing = document.getElementById("successMessages");
              if (existing && existing.parentNode !== document.body) {
                document.body.appendChild(existing);
              }

              const successMessage = `Achievement unlocked: ${name} (+${points || 0} pts)`;
              this.showSuccessToast(successMessage);
              // play success sound if available and not suppressed
              if (!this.suppressAchievementSound) {
                try {
                  this.audioManager.play && this.audioManager.play("success");
                } catch (sErr) {
                  /* ignore */
                }
              }
            } catch (err) {
              console.warn("Error handling achievement event", err);
            }
          };

          const achCleanup = EventBus.instance.listen(
            "achievement:awarded",
            handleAchievementAward
          );
          this.eventCleanup.push(achCleanup);
          // Listen for generic UI toast events from other modules
          const toastCleanup = EventBus.instance.listen("ui:toast", (e) => {
            try {
              const d = e.detail || {};
              const type = d.type || "info";
              const msg = d.message || d.text || "";
              if (type === "error") this.showErrorToast(msg);
              else this.showSuccessToast(msg);
            } catch (err) {
              console.warn("ui:toast handler error", err);
            }
          });
          this.eventCleanup.push(toastCleanup);
        })
        .catch((e) => console.warn("Failed to init achievement service", e)),
      // Register service worker for notifications (register-only; do not prompt permissions here)
      notificationService
        .registerServiceWorker("/sw-notifications.js")
        .then((swReg) => {
          if (swReg) {
            // Forward messages from the service worker to the notification service handler
            if (navigator.serviceWorker && navigator.serviceWorker.addEventListener) {
              navigator.serviceWorker.addEventListener("message", (e) => {
                try {
                  notificationService._handleIncomingNotification(e.data);
                } catch (err) {
                  console.warn("Failed to handle incoming notification message", err);
                }
              });
            }
          }
        })
        .catch((swErr) => console.warn("Service worker registration skipped or failed:", swErr)),
    ]);

    await this.onReady();
  }

  async initAuth() {
    // Authentication and user event setup
    const isAuthenticated = await appState.init();
    if (!isAuthenticated) {
      return;
    }
    // Modern event-based subscription to app state changes
    const userLoadedCleanup = appState.on("user:loaded", (e) => {
      this.handleStateChange("user-loaded", e.detail);
      this.supabase = appState.getSupabase();
      this.userId = appState.getUserId();
      this.currentUser = appState.getCurrentUser();
    });
    const userErrorCleanup = appState.on("user:error", (e) => {
      this.handleStateChange("user-error", e.detail);
    });
    const userLogoutCleanup = appState.on("user:logout", (e) => {
      this.handleStateChange("user-logout", e.detail);
      this.supabase = appState.getSupabase();
      this.userId = appState.getUserId();
      this.currentUser = appState.getCurrentUser();
    });
    this.eventCleanup.push(userLoadedCleanup, userErrorCleanup, userLogoutCleanup);
    this.supabase = appState.getSupabase();
    this.userId = appState.getUserId();
    this.currentUser = appState.getCurrentUser();
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
  async markChallengeComplete(assignmentId, challengeId, outcome, brianMode, vsUserId) {
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

      // Handle user-vs-user challenges
      if (vsUserId) {
        await this.handleVsUserChallenge(vsUserId, challengeId, outcome, now);
      }

      return true;
    } catch (err) {
      console.error("Error marking challenge complete:", err);
      throw err;
    }
  }

  async handleVsUserChallenge(vsUserId, challengeId, outcome, completedAt) {
    // Opponent always gets the inverse outcome
    const opponentOutcome = outcome === "success" ? "failure" : "success";

    const { error } = await this.supabase.from("assignments").upsert(
      [
        {
          user_id: vsUserId,
          challenge_id: challengeId,
          assigned_at: completedAt,
          completed_at: completedAt,
          outcome: opponentOutcome,
          active: true,
        },
      ],
      { onConflict: "user_id,challenge_id" }
    );

    if (error) {
      throw error;
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
      if (!userId) return;
      const imgs = document.querySelectorAll(`[data-headshot="user-${userId}"]`);
      imgs.forEach((img) => {
        img.src = headshotUrl;
      });
    };
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
    // Preload optional thank-you sound for site awards
    this.audioManager.preload("thanks", "/audio/thanks.mp3", true);
    // YTMND Easter egg audio
    this.audioManager.preload("ytmnd", "/audio/ytmnd.wav", true);
    // Preload context-specific sounds used via `data-sound` attributes
    // so dynamic elements like the headshot upload link can play immediately.
    this.audioManager.preload("myspace", "/audio/myspace.mp3", true);
    // RSVP button sounds
    this.audioManager.preload("homer-woohoo", "/audio/homer-woohoo.mp3", true);
    this.audioManager.preload("hm", "/audio/hm.mp3", true);
    this.audioManager.preload("womp-womp-tuba", "/audio/womp-womp-tuba.mp3", true);
    // Street Fighter sound effect used by character selector
    this.audioManager.preload("sf_perfect", "/audio/sf_perfect.mp3", true);
    // Load select sound immediately to avoid first-play latency on tiles
    this.audioManager.preload("sf_select", "/audio/sf_select.ogg", false);

    // Initialize audio on first interaction (required for mobile).
    // Listen for touchend in addition to click — on iOS, preventDefault() on a
    // touch handler suppresses the synthetic click, so we'd never unlock audio.
    const initAudio = () => {
      try {
        this.audioManager.initialize();
      } catch (err) {
        console.warn("Audio init failed on gesture:", err);
      }
      document.removeEventListener("click", initAudio);
      document.removeEventListener("touchend", initAudio);
      document.removeEventListener("keydown", initAudio);
    };
    // Use capture and include pointerdown so initialization runs before
    // target click handlers (reduces delay on first sound play).
    document.addEventListener("pointerdown", initAudio, { once: true, capture: true });
    document.addEventListener("click", initAudio, { once: true, capture: true });
    document.addEventListener("touchend", initAudio, { once: true, capture: true });
    document.addEventListener("keydown", initAudio, { once: true, capture: true });

    // Add click sounds to common button selectors
    addClickSound("button:not([data-no-sound])");
    addClickSound("a.btn");
    addClickSound(".action-button");
  }

  // Utility methods
  showErrorToast(message) {
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

  showSuccessToast(message) {
    // Create or move success container so it's the last child of <body>
    let successContainer = document.getElementById("successMessages");
    if (!successContainer) {
      successContainer = document.createElement("div");
      successContainer.id = "successMessages";
      successContainer.className = "success-messages";
      // Position the container near the top-right of the viewport
      Object.assign(successContainer.style, {
        position: "fixed",
        top: "1rem",
        right: "1rem",
        zIndex: 11000,
        display: "flex",
        flexDirection: "column",
        gap: "0.5rem",
        maxWidth: "360px",
        pointerEvents: "none",
      });
      document.body.appendChild(successContainer);
    } else {
      // Ensure it's appended last so it renders above overlays
      try {
        document.body.appendChild(successContainer);
      } catch (err) {
        /* ignore */
      }
    }

    // Force highest z-index and priority to overcome stacking contexts
    try {
      successContainer.style.setProperty("z-index", "2147483647", "important");
      successContainer.style.position = "fixed";
      successContainer.style.pointerEvents = "none";
    } catch (err) {
      /* ignore */
    }
    // Add success message element with close button
    const successEl = document.createElement("div");
    successEl.className = "success-message";
    Object.assign(successEl.style, {
      background: "#0b6623",
      color: "#fff",
      padding: "0.6rem 0.9rem",
      borderRadius: "6px",
      boxShadow: "0 4px 12px rgba(0,0,0,0.25)",
      pointerEvents: "auto",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: "0.5rem",
    });

    const textSpan = document.createElement("span");
    textSpan.textContent = message;
    textSpan.style.flex = "1 1 auto";

    const closeBtn = document.createElement("button");
    closeBtn.setAttribute("aria-label", "Close");
    closeBtn.textContent = "✖";
    Object.assign(closeBtn.style, {
      background: "transparent",
      border: "none",
      color: "#fff",
      fontSize: "0.9rem",
      cursor: "pointer",
      padding: "0 0.25rem",
    });

    successEl.appendChild(textSpan);
    successEl.appendChild(closeBtn);
    successContainer.appendChild(successEl);

    // Auto-remove after 10 seconds, but allow manual close
    const timeoutId = setTimeout(() => {
      successEl.remove();
      if (successContainer.children.length === 0) successContainer.remove();
    }, 10000);

    closeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      clearTimeout(timeoutId);
      successEl.remove();
      if (successContainer.children.length === 0) successContainer.remove();
    });
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
    // siteAward: false/null disables the award entirely; an override forces a specific entry
    if (this.siteAward === false || this.siteAward === null) return;

    // Each entry can optionally provide a sound path; if null we default to the generic "thanks" sound
    const siteAwardsImages = [
      { img: "/images/site-awards_blink182.gif", sound: "/audio/thanks_blink182.mp3" },
      { img: "/images/site-awards_hackers.gif", sound: "/audio/thanks_hackers.mp3" },
      { img: "/images/site-awards_pikachu.gif", sound: "/audio/thanks_pikachu.mp3" },
      { img: "/images/site-awards_christian.gif", sound: "/audio/thanks_christian.mp3" },
      { img: "/images/site-awards_hanson.gif", sound: "/audio/thanks_mmmbop.mp3" },
      { img: "/images/site-awards_aaroncarter.gif", sound: null },
      { img: "/images/site-awards_angel.gif", sound: "/audio/thanks_fairy.mp3" },
      { img: "/images/site-awards_pug.gif", sound: "/audio/thanks_pug.mp3" },
      { img: "/images/site-awards_predator.gif", sound: "/audio/thanks_predator.mp3" },
      { img: "/images/site-awards_southpark.gif", sound: "/audio/thanks_south-park.mp3" },
      { img: "/images/site-awards_jackpot.gif", sound: "/audio/thanks_jackpot.mp3" },
      { img: "/images/site-awards_olsen.gif", sound: "/audio/thanks_olsen.mp3" },
      { img: "/images/site-awards-bomb.gif", sound: "/audio/thanks_bomb.mp3" },
      { img: "/images/site-awards-bod.gif", sound: "/audio/thanks_bod.mp3" },
      { img: "/images/site-awards-patriot.gif", sound: "/audio/thanks-patriot.mp3" },
      { img: "/images/site-awards-seinfeld.gif", sound: "/audio/thanks-seinfeld.mp3" },
      { img: "/images/site-awards-tweety.gif", sound: "/audio/thanks_tweety.mp3" },
      { img: "/images/site-awards-voyager.gif", sound: "/audio/thanks_voyager.mp3" },
    ];
    // Allow a forced override entry (string img path or { img, sound } object)
    let randomEntry;
    if (this.siteAward) {
      randomEntry =
        typeof this.siteAward === "string" ? { img: this.siteAward, sound: null } : this.siteAward;
    } else {
      randomEntry = siteAwardsImages[Math.floor(Math.random() * siteAwardsImages.length)];
    }
    const randomAward = randomEntry.img;
    const awardImg = document.createElement("img");
    awardImg.src = randomAward;
    awardImg.alt = "Site Award";
    awardImg.className = "site-awards-img";
    awardImg.style.cursor = "pointer";
    awardImg.style.display = "block";

    // If the selected entry specifies a custom sound, preload it and attach its key to the image
    if (randomEntry && randomEntry.sound) {
      // derive a name for the sound from the filename, e.g. /audio/thanks_pug.mp3 -> thanks_pug
      const soundPath = randomEntry.sound;
      const soundName = soundPath.split("/").pop().split(".")[0];
      this.audioManager.preload(soundName, soundPath, true);
      awardImg.dataset.thanksSound = soundName;
    }

    // "Vote for Me!" label underneath the award
    const voteLabel = document.createElement("div");
    voteLabel.textContent = "Vote for Me!";
    voteLabel.style.cssText =
      'text-align:center;font-weight: 600; font-size:1rem;font-family: "Comic Sans", "Comic Sans MS", "Chalkboard", "ChalkboardSE-Regular", cursive, sans-serif;color:#ff69b4;margin-top:4px;cursor:pointer;user-select:none;';

    // Wrap image + label in a container
    const awardContainer = document.createElement("div");
    awardContainer.style.cssText =
      "display:block;margin:40px auto 0 auto;width:fit-content;text-align:center;";
    awardContainer.appendChild(awardImg);
    awardContainer.appendChild(voteLabel);

    // Track unique award clicks in localStorage (no repeat counting)
    const STORAGE_KEY = "site-awards-clicked";
    const THRESHOLD = 10;

    const getClicked = () => {
      try {
        return new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"));
      } catch {
        return new Set();
      }
    };

    const saveClicked = (set) => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify([...set]));
      } catch {
        /* ignore */
      }
    };

    // Play a short thank-you sound when the award image is clicked
    // and track unique awards for the achievement
    const handleAwardClick = () => {
      // Ensure audio is initialized before playing — this click IS the user gesture,
      // so initialize() here guarantees load() is called before play() even if this
      // is the very first click on the page (before the document-level initAudio fires).
      this.audioManager.initialize();
      const soundToPlay = awardImg.dataset.thanksSound || "thanks";
      try {
        this.audioManager.play(soundToPlay);
      } catch (err) {
        /* ignore */
      }

      // Track unique award image clicks
      const clicked = getClicked();
      const imgKey = randomAward; // use the image path as unique key
      if (!clicked.has(imgKey)) {
        clicked.add(imgKey);
        saveClicked(clicked);
        if (clicked.size >= THRESHOLD) {
          try {
            window.dispatchEvent(
              new CustomEvent("achievement:trigger", {
                detail: { key: "site_popularity", clicked: clicked.size },
              })
            );
          } catch (err) {
            /* ignore */
          }
        }
      }
    };

    awardImg.addEventListener("click", handleAwardClick);
    voteLabel.addEventListener("click", handleAwardClick);

    document.body.appendChild(awardContainer);
  }
}

export { BasePage };

// Dev helper: call from the browser console to trigger the success toast
// Example: triggerDevToast('This is a test toast')
if (typeof window !== "undefined") {
  window.triggerDevToast = (message = "Dev toast") => {
    try {
      const page = new BasePage({ requiresAuth: false });
      page.showSuccessToast(message);
      return true;
    } catch (err) {
      // Log but don't throw so console testing is pleasant
      // eslint-disable-next-line no-console
      console.error("triggerDevToast error:", err);
      return false;
    }
  };
}
