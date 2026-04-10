// js/pages/user-profile.js
// BriSpace user profile page — public view with owner-only inline editing.
import { BasePage } from "./base-page.js";
import { appState } from "../app.js";
import { EventBus } from "../events/event-bus.js";
import { featureFlags } from "../utils/feature-flags.js";
import { createCommentCard } from "../components/myspace-comment-card.js";
import { MUSIC_SONGS } from "../constants/music-songs.js";
import { SecretTrackPlayer } from "../components/secret-track-player.js";
import profileThemes from "../constants/profile-themes.json" with { type: "json" };

const PROFILE_THEME_TOKENS = profileThemes.tokens;
const PROFILE_BACKGROUND_THEME_KEYS = profileThemes.backgroundKeys;

const PROFILE_THEME_STYLE_VARS = [
  "--profile-theme-section-bg",
  "--profile-theme-section-text",
  "--profile-theme-section-border",
  "--profile-theme-heading-bg",
  "--profile-theme-heading-text",
  "--profile-theme-detail-bg",
  "--profile-theme-link",
  "--profile-theme-link-hover",
];

const ABOUT_HTML_MAX_CHARS = 3000;
const PROFILE_INTERESTS_MAX_CHARS = 1000;
const PROFILE_INTERESTS_FIELDS = new Set([
  "general_interest",
  "fav_song",
  "fav_movie",
  "television",
]);

class UserProfilePage extends BasePage {
  constructor() {
    // Public page — no forced auth redirect; softInit will load user if signed in.
    // Do not disable `siteAward` here so BasePage can display the random site award.
    super({ requiresAuth: false });
    this.profileUserId = document.body.dataset.profileUserId || null;
    this.currentUsername = document.body.dataset.profileUsername || null;
    this.needsIdentitySetup = document.body.dataset.needsIdentitySetup === "true";
    this.isOwner = false;
    this.profileBackgroundPersistedUrl = null;
    this.localCleanup = [];
  }

  // BasePage calls initAuth only if requiresAuth:true; for public pages it calls softInit.
  // onReady() fires after softInit completes.
  async onReady() {
    this.isOwner = !!(this.profileUserId && this.userId && this.userId === this.profileUserId);
    if (this.isOwner) document.body.classList.add("is-owner");

    this.applyProfileTheme(document.body.dataset.profileBgUrl || null);

    this.setupTopNButtons();
    this.setupHeadshotUpload();
    this.setupMusicPlayer();
    this.setupProfileGifPicker();
    this.setupProfileBackgroundPicker();
    this.setupInlineEdits();
    this.loadAchievements();
    this.loadWall();
    this.setupWallPost();
    this.setupChallengeButton();

    // Wire up publish profile toggle (standalone)
    if (this.isOwner) {
      const publishToggle = document.getElementById("publish-profile-toggle");
      if (publishToggle) {
        publishToggle.addEventListener("change", async (e) => {
          publishToggle.disabled = true;
          const checked = publishToggle.checked;
          try {
            const resp = await fetch(`/api/users/${this.profileUserId}/profile-fields`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify({ is_published: checked }),
            });
            if (!resp.ok) throw new Error((await resp.json()).error || resp.statusText);
            this.showSuccessToast(checked ? "Profile published!" : "Profile hidden.");
          } catch (err) {
            this.showErrorToast("Failed to update profile visibility: " + err.message);
            publishToggle.checked = !checked; // revert
          } finally {
            publishToggle.disabled = false;
          }
        });
      }
    }
  }

  addLocalListener(target, type, handler, options) {
    if (!target || typeof target.addEventListener !== "function") return;
    target.addEventListener(type, handler, options);
    this.localCleanup.push(() => target.removeEventListener(type, handler, options));
  }

  async _readResponseError(response, fallbackMessage) {
    if (!response) return fallbackMessage || "Request failed";

    const contentType = (response.headers.get("content-type") || "").toLowerCase();
    if (contentType.includes("application/json")) {
      const data = await response.json().catch(() => null);
      const apiMessage = data && typeof data.error === "string" ? data.error.trim() : "";
      if (apiMessage) return apiMessage;
    }

    const text = await response.text().catch(() => "");
    if (text) {
      const cleaned = text
        .replace(/<[^>]*>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      if (cleaned) return cleaned.slice(0, 200);
    }

    const statusPart = response.status ? ` (${response.status} ${response.statusText || ""})` : "";
    return `${fallbackMessage || "Request failed"}${statusPart}`.trim();
  }

  getThemeKeyFromBackgroundUrl(url) {
    if (!url || typeof url !== "string") return "default";
    const fileName = url.split("/").pop() || "";
    return (
      fileName
        .replace(/\.[^.]+$/, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "") || "default"
    );
  }

  resolveProfileThemeTokens(url) {
    const key = this.getThemeKeyFromBackgroundUrl(url);
    if (!url) return { key: "default", tokens: PROFILE_THEME_TOKENS.default };

    const mappedKey = PROFILE_BACKGROUND_THEME_KEYS[url];
    if (mappedKey && PROFILE_THEME_TOKENS[mappedKey]) {
      return { key: mappedKey, tokens: PROFILE_THEME_TOKENS[mappedKey] };
    }

    if (PROFILE_THEME_TOKENS[key]) return { key, tokens: PROFILE_THEME_TOKENS[key] };

    if (/star|space|night|galaxy|moon|nebula|cosmos/.test(key)) {
      return { key, tokens: PROFILE_THEME_TOKENS.stars };
    }
    if (/sun|dusk|retro|neon|city|fire|lava|flame/.test(key)) {
      return { key, tokens: PROFILE_THEME_TOKENS.sunset };
    }
    if (/matrix|hacker|terminal|green|cyber/.test(key)) {
      return { key, tokens: PROFILE_THEME_TOKENS.matrix };
    }
    if (/paper|grid|note|pastel|flower|cloud/.test(key)) {
      return { key, tokens: PROFILE_THEME_TOKENS.paper };
    }
    if (/kitty|heart|pooh|love|cute|pink/.test(key)) {
      return { key: "bubblegum", tokens: PROFILE_THEME_TOKENS.bubblegum };
    }
    return { key, tokens: PROFILE_THEME_TOKENS.default };
  }

  applyProfileTheme(url) {
    const body = document.body;
    if (!body) return;
    const stripThemeClasses = () => {
      body.classList.forEach((className) => {
        if (className.startsWith("theme-")) body.classList.remove(className);
      });
    };

    if (!url) {
      body.classList.remove("has-profile-theme");
      stripThemeClasses();
      delete body.dataset.profileThemeKey;
      body.dataset.profileBgUrl = "";

      body.style.removeProperty("background-image");
      body.style.removeProperty("background-repeat");
      body.style.removeProperty("background-size");
      PROFILE_THEME_STYLE_VARS.forEach((styleVar) => body.style.removeProperty(styleVar));
      return;
    }

    const { key, tokens } = this.resolveProfileThemeTokens(url);
    body.classList.add("has-profile-theme");
    stripThemeClasses();
    body.classList.add(`theme-${key}`);
    body.dataset.profileThemeKey = key;
    body.dataset.profileBgUrl = url;

    body.style.backgroundImage = `url("${url}")`;
    body.style.backgroundRepeat = "repeat";
    body.style.backgroundSize = "auto";
    body.style.setProperty("--profile-theme-section-bg", tokens.sectionBg);
    body.style.setProperty("--profile-theme-section-text", tokens.sectionText);
    body.style.setProperty("--profile-theme-section-border", tokens.sectionBorder);
    body.style.setProperty("--profile-theme-heading-bg", tokens.headingBg);
    body.style.setProperty("--profile-theme-heading-text", tokens.headingText);
    body.style.setProperty("--profile-theme-detail-bg", tokens.detailBg);
    body.style.setProperty("--profile-theme-link", tokens.link);
    body.style.setProperty("--profile-theme-link-hover", tokens.linkHover);
  }

  setupTopNButtons() {
    this.setupAddToTopNButton();
    this.setupTopNRemoveButtons();
  }

  setupAddToTopNButton() {
    const btn = document.getElementById("add-to-topn-btn");
    if (!btn || !this.userId || !this.profileUserId || this.isOwner) return;

    btn.addEventListener("click", async () => {
      if (btn.disabled) return;
      const original = btn.textContent;
      btn.disabled = true;
      btn.textContent = "Adding...";
      try {
        const resp = await fetch(`/api/users/${this.userId}/top-n/add`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ targetUserId: this.profileUserId }),
        });
        const body = await resp.json().catch(() => ({}));
        if (!resp.ok) throw new Error(body.error || resp.statusText);

        btn.textContent = "Added to Top 8";
        this.showSuccessToast(
          body.already_added ? "Already in your Top 8." : "Added to your Top 8!"
        );
      } catch (err) {
        btn.disabled = false;
        btn.textContent = original;
        this.showErrorToast("Failed to add: " + err.message);
      }
    });
  }

  setupTopNRemoveButtons() {
    if (!this.isOwner || !this.userId) return;
    const buttons = document.querySelectorAll(".topn-remove-btn[data-user-id]");
    if (!buttons.length) return;

    buttons.forEach((btn) => {
      btn.addEventListener("click", async () => {
        const targetUserId = btn.dataset.userId;
        if (!targetUserId) return;
        btn.disabled = true;
        const original = btn.textContent;
        btn.textContent = "Removing...";
        try {
          const resp = await fetch(`/api/users/${this.userId}/top-n/${targetUserId}`, {
            method: "DELETE",
            credentials: "include",
          });
          const body = await resp.json().catch(() => ({}));
          if (!resp.ok) throw new Error(body.error || resp.statusText);

          const item = btn.closest(".top-n-item");
          if (item) item.remove();

          const countEl = document.querySelector(".top-n-count");
          if (countEl) {
            const nextCount = Math.max(parseInt(countEl.textContent || "0", 10) - 1, 0);
            countEl.textContent = String(nextCount);
          }

          const grid = document.getElementById("topn-display");
          if (grid && !grid.querySelector(".top-n-item")) {
            grid.innerHTML = `<p class="top-n-empty">No users found.</p>`;
          }

          this.showSuccessToast("Removed from Top 8.");
        } catch (err) {
          btn.disabled = false;
          btn.textContent = original;
          this.showErrorToast("Failed to remove: " + err.message);
        }
      });
    });
  }

  // Show and wire the "Challenge this user" button when appropriate.
  async setupChallengeButton() {
    const btn = document.getElementById("challenge-user-btn");
    if (!btn || !this.profileUserId) return;

    // Hide by default; we'll show if both users are participants and target != current
    btn.style.display = "none";

    // Don't allow challenge UI until the event has started
    try {
      const eventStarted = await featureFlags.isEventStarted(this.supabase);
      if (!eventStarted) return;
    } catch (err) {
      // If the feature flag check fails, be conservative and hide the button
      return;
    }

    try {
      // Ensure caller is signed in and not viewing their own profile
      if (!this.userId || this.userId === this.profileUserId) return;

      // Check both users are participants. Use the users table for a lightweight check.
      const [{ data: me }, { data: target }] = await Promise.all([
        this.supabase.from("users").select("user_type").eq("id", this.userId).maybeSingle(),
        this.supabase.from("users").select("user_type").eq("id", this.profileUserId).maybeSingle(),
      ]);

      const myType = me && me.user_type ? me.user_type : null;
      const targetType = target && target.user_type ? target.user_type : null;
      if (myType !== "participant" || targetType !== "participant") return;

      // Show button and wire click handler
      btn.style.display = "inline-block";
      btn.addEventListener("click", async () => {
        if (!confirm("Send a challenge notification to this user?")) return;
        btn.disabled = true;
        const original = btn.textContent;
        btn.textContent = "Sending...";
        try {
          const resp = await fetch(`/api/users/${this.profileUserId}/challenge`, {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
          });
          const body = await resp.json();
          if (!resp.ok) throw new Error(body.error || resp.statusText);
          this.showSuccessToast("Challenge sent!");
        } catch (err) {
          this.showErrorToast("Failed to send challenge: " + err.message);
        } finally {
          btn.disabled = false;
          btn.textContent = original;
        }
      });
    } catch (err) {
      // Silence errors — feature is optional
      console.warn("setupChallengeButton error", err);
    }
  }

  // ── Headshot upload (owner only) ───────────────────────────────────────────
  setupHeadshotUpload() {
    if (!this.isOwner) return;
    import("../components/headshot-upload.js").then(({ HeadshotUpload }) => {
      const aboutDiv = document.querySelector("#headshotUploadContainer");
      if (!aboutDiv) return;
      const uploader = new HeadshotUpload();
      uploader.init().then((uploadEl) => {
        aboutDiv.appendChild(uploadEl);
      });
    });
  }

  // ── Music player ──────────────────────────────────────────────────────────
  setupMusicPlayer() {
    import("../components/music-player.js").then(async ({ MusicPlayer }) => {
      let container = document.getElementById("musicPlayerContainer");
      if (!container) {
        container = document.createElement("div");
        container.id = "musicPlayerContainer";
        const aboutDiv = document.querySelector(".myspace-about");
        if (aboutDiv) aboutDiv.insertBefore(container, aboutDiv.firstChild);
        else document.body.insertBefore(container, document.body.firstChild);
      }
      const player = document.createElement("music-player");
      // Pass the profile owner's ID so the player loads their saved favorite,
      // not the logged-in visitor's. Also populates player._hasFavoriteSong.
      await player.setSongs(MUSIC_SONGS, this.profileUserId);
      container.innerHTML = "";
      container.appendChild(player);
      player.addEventListener("music:secret-rewind", () => {
        const secretPlayer = new SecretTrackPlayer();
        secretPlayer.open();
      });
      // Only auto-play on first gesture when the profile owner has chosen a favorite song.
      // This prevents a default song from blaring on every unrelated profile visit.
      if (player._hasFavoriteSong) {
        const startOnGesture = () => {
          if (!player.isPlaying) player.togglePlayPause();
          document.removeEventListener("click", startOnGesture);
          document.removeEventListener("touchend", startOnGesture);
          document.removeEventListener("keydown", startOnGesture);
        };
        document.addEventListener("click", startOnGesture, { once: true });
        document.addEventListener("touchend", startOnGesture, { once: true });
        document.addEventListener("keydown", startOnGesture, { once: true });
      }
    });
  }

  // Profile GIF picker (owner only) persists a curated key to user_profile.profile_gif_key.
  setupProfileGifPicker() {
    if (!this.isOwner) return;

    const toggleBtn = document.getElementById("profile-gif-toggle");
    const form = document.getElementById("profile-gif-form");
    if (!form) return;

    const saveBtn = document.getElementById("profile-gif-save");
    const clearBtn = document.getElementById("profile-gif-clear");
    const cancelBtn = document.getElementById("profile-gif-cancel");
    const previewImage = document.getElementById("profile-gif-image");
    const emptyNote = document.getElementById("profile-gif-empty-note");

    const openPicker = () => {
      form.classList.remove("is-hidden");
      if (toggleBtn) toggleBtn.textContent = "✦ Choose GIF";
    };

    const closePicker = () => {
      form.classList.add("is-hidden");
    };

    toggleBtn?.addEventListener("click", () => {
      form.classList.contains("is-hidden") ? openPicker() : closePicker();
    });

    cancelBtn?.addEventListener("click", closePicker);

    const getSelectedInput = () => form.querySelector("input[name='profile-gif-key']:checked");

    const setPreview = (src) => {
      if (!previewImage) return;
      if (!src) {
        previewImage.src = "";
        previewImage.classList.add("is-hidden");
        if (emptyNote) emptyNote.classList.remove("is-hidden");
      } else {
        previewImage.src = src;
        previewImage.classList.remove("is-hidden");
        if (emptyNote) emptyNote.classList.add("is-hidden");
      }
    };

    // Click-on-thumbnail selects it and live-previews it
    form.querySelectorAll(".profile-gif-thumb").forEach((thumb) => {
      thumb.addEventListener("click", () => {
        form
          .querySelectorAll(".profile-gif-thumb")
          .forEach((t) => t.classList.remove("is-selected"));
        thumb.classList.add("is-selected");
        const input = thumb.querySelector("input[type='radio']");
        if (input) {
          input.checked = true;
          setPreview(input.dataset.gifSrc || "");
        }
      });
    });

    saveBtn?.addEventListener("click", async () => {
      const selected = getSelectedInput();
      const selectedKey = selected?.value || null;

      saveBtn.disabled = true;
      saveBtn.textContent = "Saving...";
      if (clearBtn) clearBtn.disabled = true;
      if (cancelBtn) cancelBtn.disabled = true;

      try {
        const resp = await fetch(`/api/users/${this.profileUserId}/profile-fields`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ profile_gif_key: selectedKey }),
        });
        if (!resp.ok) throw new Error((await resp.json()).error || resp.statusText);

        setPreview(selected?.dataset.gifSrc || null);
        closePicker();
        this.showSuccessToast("Profile GIF saved!");
      } catch (err) {
        this.showErrorToast("Failed to save profile GIF: " + err.message);
      } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = "Save GIF";
        if (clearBtn) clearBtn.disabled = false;
        if (cancelBtn) cancelBtn.disabled = false;
      }
    });

    clearBtn?.addEventListener("click", async () => {
      clearBtn.disabled = true;
      clearBtn.textContent = "Clearing...";
      if (saveBtn) saveBtn.disabled = true;
      if (cancelBtn) cancelBtn.disabled = true;

      try {
        const resp = await fetch(`/api/users/${this.profileUserId}/profile-fields`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ profile_gif_key: null }),
        });
        if (!resp.ok) throw new Error((await resp.json()).error || resp.statusText);

        form.querySelectorAll("input[name='profile-gif-key']").forEach((input) => {
          input.checked = false;
        });
        form
          .querySelectorAll(".profile-gif-thumb")
          .forEach((t) => t.classList.remove("is-selected"));
        setPreview(null);
        closePicker();
        this.showSuccessToast("Profile GIF cleared.");
      } catch (err) {
        this.showErrorToast("Failed to clear profile GIF: " + err.message);
      } finally {
        clearBtn.disabled = false;
        clearBtn.textContent = "Clear";
        if (saveBtn) saveBtn.disabled = false;
        if (cancelBtn) cancelBtn.disabled = false;
      }
    });
  }

  setupProfileBackgroundPicker() {
    if (!this.isOwner) return;

    const shell = document.getElementById("profile-bg-picker-shell");
    const toggleBtn = document.getElementById("profile-bg-toggle");
    const panel = document.getElementById("profile-bg-panel");
    const form = document.getElementById("profile-bg-form");
    const saveBtn = document.getElementById("profile-bg-save");
    const clearBtn = document.getElementById("profile-bg-clear");
    const cancelBtn = document.getElementById("profile-bg-cancel");

    if (!shell || !toggleBtn || !panel || !form) return;

    const getSelectedInput = () => form.querySelector("input[name='profile-bg-url']:checked");
    this.profileBackgroundPersistedUrl =
      getSelectedInput()?.value || document.body.dataset.profileBgUrl || null;
    this.applyProfileTheme(this.profileBackgroundPersistedUrl);

    const syncSelectedThumb = (selectedUrl) => {
      const thumbs = form.querySelectorAll(".profile-bg-thumb");
      thumbs.forEach((thumb) => {
        const input = thumb.querySelector("input[name='profile-bg-url']");
        const matches = !!(input && input.value === selectedUrl);
        thumb.classList.toggle("is-selected", matches);
        if (input) input.checked = matches;
      });
    };

    const openPanel = () => {
      panel.classList.remove("is-hidden");
      toggleBtn.setAttribute("aria-expanded", "true");
    };

    const closePanel = ({ restorePersisted = true } = {}) => {
      panel.classList.add("is-hidden");
      toggleBtn.setAttribute("aria-expanded", "false");
      if (restorePersisted) {
        syncSelectedThumb(this.profileBackgroundPersistedUrl);
        this.applyProfileTheme(this.profileBackgroundPersistedUrl);
      }
    };

    const applySelectedPreview = () => {
      const selectedUrl = getSelectedInput()?.value || null;
      syncSelectedThumb(selectedUrl);
      this.applyProfileTheme(selectedUrl);
    };

    this.addLocalListener(toggleBtn, "click", () => {
      if (panel.classList.contains("is-hidden")) {
        openPanel();
      } else {
        closePanel({ restorePersisted: true });
      }
    });

    this.addLocalListener(cancelBtn, "click", () => {
      closePanel({ restorePersisted: true });
    });

    form.querySelectorAll(".profile-bg-thumb").forEach((thumb) => {
      const input = thumb.querySelector("input[name='profile-bg-url']");
      if (!input) return;

      this.addLocalListener(thumb, "click", () => {
        input.checked = true;
        applySelectedPreview();
      });

      this.addLocalListener(input, "change", () => {
        applySelectedPreview();
      });
    });

    this.addLocalListener(document, "mousedown", (event) => {
      if (panel.classList.contains("is-hidden")) return;
      if (!shell.contains(event.target)) {
        closePanel({ restorePersisted: true });
      }
    });

    this.addLocalListener(document, "keydown", (event) => {
      if (event.key === "Escape" && !panel.classList.contains("is-hidden")) {
        closePanel({ restorePersisted: true });
      }
    });

    this.addLocalListener(saveBtn, "click", async () => {
      const selectedUrl = getSelectedInput()?.value || null;

      if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.textContent = "Saving...";
      }
      if (clearBtn) clearBtn.disabled = true;
      if (cancelBtn) cancelBtn.disabled = true;

      try {
        const resp = await fetch(`/api/users/${this.profileUserId}/profile-fields`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ profile_bg_url: selectedUrl, profile_bg_mode: "tile" }),
        });

        if (!resp.ok) throw new Error((await resp.json()).error || resp.statusText);

        this.profileBackgroundPersistedUrl = selectedUrl;
        this.applyProfileTheme(this.profileBackgroundPersistedUrl);
        closePanel({ restorePersisted: false });
        this.showSuccessToast("Background saved!");
      } catch (err) {
        this.showErrorToast("Failed to save background: " + err.message);
      } finally {
        if (saveBtn) {
          saveBtn.disabled = false;
          saveBtn.textContent = "Save";
        }
        if (clearBtn) clearBtn.disabled = false;
        if (cancelBtn) cancelBtn.disabled = false;
      }
    });

    this.addLocalListener(clearBtn, "click", async () => {
      if (clearBtn) {
        clearBtn.disabled = true;
        clearBtn.textContent = "Clearing...";
      }
      if (saveBtn) saveBtn.disabled = true;
      if (cancelBtn) cancelBtn.disabled = true;

      try {
        const resp = await fetch(`/api/users/${this.profileUserId}/profile-fields`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ profile_bg_url: null, profile_bg_mode: "tile" }),
        });

        if (!resp.ok) throw new Error((await resp.json()).error || resp.statusText);

        this.profileBackgroundPersistedUrl = null;
        syncSelectedThumb(null);
        this.applyProfileTheme(null);
        closePanel({ restorePersisted: false });
        this.showSuccessToast("Background cleared.");
      } catch (err) {
        this.showErrorToast("Failed to clear background: " + err.message);
      } finally {
        if (clearBtn) {
          clearBtn.disabled = false;
          clearBtn.textContent = "Clear";
        }
        if (saveBtn) saveBtn.disabled = false;
        if (cancelBtn) cancelBtn.disabled = false;
      }
    });
  }

  // ── Inline edit buttons ────────────────────────────────────────────────────
  setupInlineEdits() {
    if (!this.isOwner) return;
    this._wireEdit("identity");
    this._wireEdit("profile");
    this._wireEdit("bio");
    this._wireEdit("details");
    this._wireEdit("interests");
    this._wireTopNEdit();
  }

  // Generic inline edit wiring: show/hide form when pencil button clicked.
  _wireEdit(section) {
    const btn = document.getElementById(`edit-${section}-btn`);
    const form = document.getElementById(`edit-${section}-form`);
    const display = document.getElementById(`${section}-display`);
    if (!btn || !form) return;

    const isModal = form.classList.contains("profile-edit-form--modal");
    const isQuillForm = form.hasAttribute("data-quill-form");
    const isIdentitySection = section === "identity";
    const forceIdentitySetup = isIdentitySection && this.needsIdentitySetup;
    let backdrop = null;
    let quill = null;
    let interestsLimitNotified = false;

    const initQuill = () => {
      if (quill) return;
      const editorEl = form.querySelector("[id$='-quill-editor']");
      if (!editorEl) return;
      const hiddenTextarea = form.querySelector("[data-field='about_html']");
      const charCountEl = form.querySelector("[data-bio-char-count]");
      const charCountWrap = form.querySelector(".profile-bio-charcount");
      let bioLimitNotified = false;
      quill = new Quill(editorEl, {
        theme: "snow",
        placeholder: "Tell people about yourself...",
        modules: {
          toolbar: [
            ["bold", "italic", "underline", "strike"],
            [{ list: "ordered" }, { list: "bullet" }],
            ["link", "blockquote"],
            ["clean"],
          ],
        },
      });

      const updateBioCounter = () => {
        const count = this._getQuillTextLength(quill);
        if (charCountEl) charCountEl.textContent = String(count);
        if (charCountWrap) {
          charCountWrap.classList.toggle("is-at-limit", count >= ABOUT_HTML_MAX_CHARS);
        }
      };

      // Seed with existing content
      if (hiddenTextarea?.value) {
        quill.clipboard.dangerouslyPasteHTML(hiddenTextarea.value);
      }

      if (hiddenTextarea) hiddenTextarea.value = this._normalizeAboutHtml(quill.getSemanticHTML());
      updateBioCounter();

      // Keep hidden textarea in sync so _saveSection can read it normally
      quill.on("text-change", (_delta, _oldDelta, source) => {
        const count = this._getQuillTextLength(quill);
        if (count > ABOUT_HTML_MAX_CHARS) {
          quill.history.undo();
          if (source === "user" && !bioLimitNotified) {
            this.showErrorToast(`About Me is limited to ${ABOUT_HTML_MAX_CHARS} characters.`);
            bioLimitNotified = true;
          }
          updateBioCounter();
          return;
        }
        bioLimitNotified = false;
        if (hiddenTextarea)
          hiddenTextarea.value = this._normalizeAboutHtml(quill.getSemanticHTML());
        updateBioCounter();
      });
    };

    const openForm = () => {
      form.classList.add("active");
      btn.style.display = "none";
      if (display) display.style.display = "none";
      if (isQuillForm) initQuill();
      if (section === "interests") {
        this._initInterestsFieldCounters(form, PROFILE_INTERESTS_MAX_CHARS, () => {
          if (!interestsLimitNotified) {
            this.showErrorToast(
              `Interests fields are limited to ${PROFILE_INTERESTS_MAX_CHARS} characters each.`
            );
            interestsLimitNotified = true;
          }
        });
      }
      if (isModal) {
        backdrop = document.createElement("div");
        backdrop.className = "profile-modal-backdrop";
        if (!forceIdentitySetup) {
          backdrop.addEventListener("click", closeForm);
        } else {
          backdrop.classList.add("profile-modal-backdrop--locked");
        }
        document.body.appendChild(backdrop);
      }

      if (forceIdentitySetup) {
        document.body.classList.add("is-identity-setup-required");
      }
    };

    const closeForm = () => {
      if (forceIdentitySetup && this.needsIdentitySetup) return;
      form.classList.remove("active");
      btn.style.display = "";
      if (display) display.style.display = "";
      interestsLimitNotified = false;
      if (isIdentitySection) {
        document.body.classList.remove("is-identity-setup-required");
      }
      if (backdrop) {
        backdrop.remove();
        backdrop = null;
      }
    };

    // Expose for _saveSection to call after a successful save
    form._closeForm = closeForm;

    btn.addEventListener("click", () => {
      form.classList.contains("active") ? closeForm() : openForm();
    });

    const cancelBtn = form.querySelector(".profile-edit-cancel");
    if (forceIdentitySetup && cancelBtn) {
      cancelBtn.style.display = "none";
    }
    cancelBtn?.addEventListener("click", closeForm);
    form
      .querySelector(".profile-edit-save")
      ?.addEventListener("click", () => this._saveSection(section, form, display, btn));

    if (forceIdentitySetup) {
      openForm();
    }
  }

  async _saveSection(section, form, display, btn) {
    const saveBtn = form.querySelector(".profile-edit-save");
    saveBtn.disabled = true;
    saveBtn.textContent = "Saving...";

    try {
      const payload = {};
      const identityPayload = {};
      const identityFields = new Set(["username", "display_name"]);
      const previousUsername = this.currentUsername;

      form.querySelectorAll("[data-field]").forEach((el) => {
        if (el.disabled) return;
        if (identityFields.has(el.dataset.field)) {
          identityPayload[el.dataset.field] = el.value;
        } else {
          payload[el.dataset.field] = el.value;
        }
      });

      // Handle identity fields (username and display_name) separately
      let newUsername = null;
      if (Object.keys(identityPayload).length > 0) {
        // Validate username format if provided
        if (identityPayload.username) {
          const username = identityPayload.username.trim().toLowerCase();
          if (!/^[a-z0-9_-]{3,32}$/.test(username)) {
            throw new Error(
              "Username must be 3-32 characters, alphanumeric with underscores/hyphens only"
            );
          }
          if (this.needsIdentitySetup && /^visitor_[a-z0-9]+$/i.test(username)) {
            throw new Error("Please choose a custom username before continuing.");
          }
          identityPayload.username = username;
          newUsername = username;
        }

        // Validate display_name if provided
        if (identityPayload.display_name) {
          const cleanName = identityPayload.display_name.trim();
          if (!cleanName || cleanName.length > 60) {
            throw new Error("Display name must be 1-60 characters");
          }
          identityPayload.display_name = cleanName;
        }

        // Send identity update to separate endpoint
        const identityResp = await fetch(`/api/users/${this.profileUserId}/identity`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(identityPayload),
        });
        if (!identityResp.ok) {
          throw new Error(await this._readResponseError(identityResp, "Failed to update identity"));
        }

        if (identityPayload.username) {
          this.currentUsername = identityPayload.username;
          document.body.dataset.profileUsername = identityPayload.username;
        }

        if (identityPayload.display_name) {
          const heading = document.querySelector(".myspace-name");
          if (heading) heading.textContent = `${identityPayload.display_name}'s BriSpace`;
        }

        if (this.needsIdentitySetup) {
          this.needsIdentitySetup = false;
          document.body.dataset.needsIdentitySetup = "false";
          document.body.classList.remove("is-identity-setup-required");
        }
      }

      if (typeof payload.about_html === "string") {
        payload.about_html = this._normalizeAboutHtml(payload.about_html);
        if (
          section === "bio" &&
          this._getAboutTextLength(payload.about_html) > ABOUT_HTML_MAX_CHARS
        ) {
          throw new Error(`About Me is limited to ${ABOUT_HTML_MAX_CHARS} characters.`);
        }
      }

      if (section === "interests") {
        for (const fieldName of PROFILE_INTERESTS_FIELDS) {
          if (!(fieldName in payload) || typeof payload[fieldName] !== "string") continue;
          if (payload[fieldName].length > PROFILE_INTERESTS_MAX_CHARS) {
            throw new Error(
              `Interests fields are limited to ${PROFILE_INTERESTS_MAX_CHARS} characters each.`
            );
          }
        }
      }

      // Only send profile-fields request if there are non-identity fields
      if (Object.keys(payload).length > 0) {
        const resp = await fetch(`/api/users/${this.profileUserId}/profile-fields`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(payload),
        });
        if (!resp.ok)
          throw new Error(await this._readResponseError(resp, "Failed to save profile"));

        // Update display values in-place (skip fields with custom formatting)
        const SKIP_FIELDS = new Set(["about_html", "status", "age"]);
        form.querySelectorAll("[data-field]").forEach((el) => {
          if (SKIP_FIELDS.has(el.dataset.field)) return;
          const displayEl = document.querySelector(`[data-display="${el.dataset.field}"]`);
          if (displayEl) displayEl.textContent = el.value || "—";
        });

        // Special case: status — display with quotes
        if (section === "profile") {
          const statusInput = form.querySelector("[data-field='status']");
          const statusEl = document.querySelector("[data-display='status']");
          if (statusEl && statusInput)
            statusEl.textContent = statusInput.value ? `"${statusInput.value}"` : "—";

          const ageInput = form.querySelector("[data-field='age']");
          const ageEl = document.querySelector("[data-display='age']");
          if (ageEl && ageInput)
            ageEl.textContent = ageInput.value ? `${ageInput.value} yrs old` : "—";
        }

        // Special case: about_html display (rendered as HTML, not escaped text)
        if (section === "bio") {
          const aboutEl = document.getElementById("bio-display");
          const aboutInput = form.querySelector("[data-field='about_html']");
          if (aboutEl && aboutInput)
            aboutEl.innerHTML =
              this._sanitizeHtml(aboutInput.value) ||
              '<p class="profile-status-text">Nothing here yet.</p>';
        }
      }

      // If username changed, redirect to new profile URL
      if (newUsername && newUsername !== previousUsername) {
        if (typeof form._closeForm === "function") {
          form._closeForm();
        } else {
          form.classList.remove("active");
          btn.textContent = "✏ edit";
          if (display) display.style.display = "";
        }
        this.showSuccessToast("Saved! Redirecting to your new profile...");
        setTimeout(() => {
          window.location.href = `/users/${newUsername}`;
        }, 500);
        return;
      }

      if (typeof form._closeForm === "function") {
        form._closeForm();
      } else {
        form.classList.remove("active");
        btn.textContent = "✏ edit";
        if (display) display.style.display = "";
      }
      this.showSuccessToast("Saved!");
    } catch (err) {
      this.showErrorToast("Save failed: " + err.message);
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = "Save";
    }
  }

  // ── Top N inline edit ──────────────────────────────────────────────────────
  _wireTopNEdit() {
    const btn = document.getElementById("edit-topn-btn");
    const form = document.getElementById("edit-topn-form");
    const display = document.getElementById("topn-display");
    if (!btn || !form) return;

    btn.addEventListener("click", () => {
      const open = form.classList.toggle("active");
      btn.textContent = open ? "✕ cancel" : "✏ edit";
      if (display) display.style.display = open ? "none" : "";
    });

    form.querySelector(".profile-edit-cancel")?.addEventListener("click", () => {
      form.classList.remove("active");
      btn.textContent = "✏ edit";
      if (display) display.style.display = "";
    });

    form
      .querySelector(".profile-edit-save")
      ?.addEventListener("click", () => this._saveTopN(form, display, btn));
  }

  async _saveTopN(form, display, btn) {
    const saveBtn = form.querySelector(".profile-edit-save");
    saveBtn.disabled = true;
    saveBtn.textContent = "Saving...";

    const items = [];
    form.querySelectorAll(".top-n-edit-row input").forEach((input, i) => {
      if (input.value.trim()) items.push({ rank: i + 1, label: input.value.trim() });
    });

    try {
      const resp = await fetch(`/api/users/${this.profileUserId}/top-n`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ items }),
      });
      if (!resp.ok) throw new Error((await resp.json()).error || resp.statusText);

      // Re-render display
      if (display) {
        display.innerHTML = items.length
          ? items
              .map(
                (item) => `
              <div class="top-n-item">
                <span class="top-n-item__rank">#${item.rank}</span>
                <span class="top-n-item__label">${this._escapeHtml(item.label)}</span>
              </div>`
              )
              .join("")
          : `<p class="top-n-empty">None yet.</p>`;
        display.style.display = "";
      }

      form.classList.remove("active");
      btn.textContent = "✏ edit";
      this.showSuccessToast("Top list saved!");
    } catch (err) {
      this.showErrorToast("Save failed: " + err.message);
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = "Save";
    }
  }

  // ── Achievements ───────────────────────────────────────────────────────────
  async loadAchievements() {
    const container = document.getElementById("achievements-container");
    if (!container || !this.profileUserId) return;
    // If server already rendered achievements, skip client hydration to avoid duplicates
    try {
      if (container.classList && container.classList.contains("server-rendered")) return;
    } catch (e) {
      // ignore classList access errors
    }
    try {
      const { data, error } = await this.supabase
        .from("user_achievements")
        .select(
          "achievement_id, awarded_at, achievements!inner(name, image_url, is_visitor_eligible)"
        )
        .eq("user_id", this.profileUserId)
        .eq("achievements.is_visitor_eligible", true)
        .order("awarded_at", { ascending: false });

      if (error) throw error;
      if (!data || data.length === 0) {
        container.innerHTML = `<p class="achievements-empty">No achievements yet.</p>`;
        return;
      }
      container.innerHTML = data
        .map(
          (ua) => `
          <div class="achievement-badge" title="${this._escapeHtml(ua.achievements?.name || ua.achievement_key)}">
            <img src="${ua.achievements?.image_url || "images/star_icon.gif"}" alt="${this._escapeHtml(ua.achievements?.name || "")}"/>
            <span class="achievement-badge__name">${this._escapeHtml(ua.achievements?.name || ua.achievement_key)}</span>
          </div>`
        )
        .join("");
    } catch {
      container.innerHTML = `<p class="achievements-empty">Could not load achievements.</p>`;
    }
  }

  // ── Profile Wall ───────────────────────────────────────────────────────────
  async loadWall() {
    const container = document.getElementById("wall-entries");
    if (!container || !this.profileUserId) return;
    try {
      const resp = await fetch(`/api/users/${this.profileUserId}/wall`, { credentials: "include" });
      const { entries } = await resp.json();

      // Fetch headshots for all known authors in one query
      const userHeadshots = {};
      const userProfileKeys = {};
      const authorIds = [...new Set((entries || []).map((e) => e.author_user_id).filter(Boolean))];
      if (authorIds.length && this.supabase) {
        const { data: users } = await this.supabase
          .from("users")
          .select("id, username, headshot")
          .in("id", authorIds);
        if (users)
          users.forEach((u) => {
            if (u.headshot) userHeadshots[u.id] = u.headshot;
            userProfileKeys[u.id] = u.username || u.id;
          });
      }

      this._renderWall(entries || [], userHeadshots, userProfileKeys);
    } catch {
      container.innerHTML = `<p class="text-center">Could not load wall.</p>`;
    }
  }

  _renderWall(entries, userHeadshots = {}, userProfileKeys = {}) {
    const container = document.getElementById("wall-entries");
    if (!container) return;
    if (entries.length === 0) {
      const msg = this.isOwner
        ? "Nobody has written on your wall yet. Share your profile!"
        : "No comments yet. Be the first!";
      container.innerHTML = `<p class="text-center">${msg}</p>`;
      return;
    }
    container.innerHTML = "";
    const frag = document.createDocumentFragment();
    entries.forEach((e) => {
      const canDelete = this.isOwner || (e.author_user_id && e.author_user_id === this.userId);
      const avatarSrc =
        (e.author_user_id && userHeadshots[e.author_user_id]) || "/images/headshot.jpg";
      const dataHeadshot = e.author_user_id ? `user-${e.author_user_id}` : "user-default";
      frag.appendChild(
        createCommentCard({
          name: e.author_name,
          message: e.message,
          date: e.created_at,
          avatarSrc,
          dataHeadshot,
          profileHref: e.author_user_id
            ? `/users/${encodeURIComponent(userProfileKeys[e.author_user_id] || e.author_user_id)}`
            : "",
          entryId: e.id,
          canDelete,
          onDelete: (id) => this._deleteWallEntry(id),
        })
      );
    });
    container.appendChild(frag);
  }

  setupWallPost() {
    const form = document.getElementById("wall-post-form");
    if (!form) return;

    if (!this.userId) {
      form.innerHTML = `<p class="wall-login-prompt"><a href="/">Sign in</a> to leave a comment.</p>`;
      return;
    }

    const textarea = form.querySelector("textarea");
    const btn = form.querySelector(".wall-post-btn");

    btn?.addEventListener("click", async () => {
      const message = textarea?.value.trim();
      if (!message) return;
      btn.disabled = true;
      btn.textContent = "Posting...";
      try {
        const resp = await fetch(`/api/users/${this.profileUserId}/wall`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ message }),
        });
        if (!resp.ok) throw new Error((await resp.json()).error || resp.statusText);
        if (textarea) textarea.value = "";
        await this.loadWall();
        this.showSuccessToast("Comment posted!");
        EventBus.instance.emit("user:wall:posted", { userId: this.userId });
      } catch (err) {
        this.showErrorToast("Failed: " + err.message);
      } finally {
        btn.disabled = false;
        btn.textContent = "Post";
      }
    });
  }

  async _deleteWallEntry(entryId) {
    try {
      const resp = await fetch(`/api/users/${this.profileUserId}/wall/${entryId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!resp.ok) throw new Error((await resp.json()).error || resp.statusText);
      await this.loadWall();
    } catch (err) {
      this.showErrorToast("Delete failed: " + err.message);
    }
  }

  _escapeHtml(str) {
    if (!str) return "";
    return String(str).replace(
      /[&<>"']/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]
    );
  }

  // Sanitizes HTML using DOMPurify with a restricted tag allowlist.
  _normalizeAboutHtml(html) {
    if (!html) return "";
    return String(html)
      .replace(/&nbsp;/gi, " ")
      .replace(/\u00a0/g, " ");
  }

  _getQuillTextLength(quill) {
    if (!quill) return 0;
    const text = quill.getText() || "";
    return text.endsWith("\n") ? Math.max(0, text.length - 1) : text.length;
  }

  _getAboutTextLength(html) {
    if (!html) return 0;
    const el = document.createElement("div");
    el.innerHTML = this._sanitizeHtml(this._normalizeAboutHtml(html));
    return (el.textContent || "").length;
  }

  _initInterestsFieldCounters(form, maxChars, onLimitReached) {
    if (!form) return;
    const textareas = form.querySelectorAll("textarea[data-field]");
    textareas.forEach((textarea) => {
      const fieldName = textarea.dataset.field || "";
      if (!PROFILE_INTERESTS_FIELDS.has(fieldName)) return;

      const countEl = form.querySelector(`[data-field-char-count="${fieldName}"]`);
      const countWrap = form.querySelector(`[data-field-charcount-wrap="${fieldName}"]`);

      const updateCounter = () => {
        const count = textarea.value.length;
        if (countEl) countEl.textContent = String(count);
        if (countWrap) countWrap.classList.toggle("is-at-limit", count >= maxChars);
      };

      if (textarea.value.length > maxChars) {
        textarea.value = textarea.value.slice(0, maxChars);
      }
      textarea.maxLength = maxChars;
      updateCounter();

      if (textarea.dataset.counterBound === "1") return;

      textarea.addEventListener("input", () => {
        if (textarea.value.length > maxChars) {
          textarea.value = textarea.value.slice(0, maxChars);
          if (typeof onLimitReached === "function") onLimitReached();
        } else if (textarea.value.length === maxChars) {
          if (typeof onLimitReached === "function") onLimitReached();
        }
        updateCounter();
      });

      textarea.dataset.counterBound = "1";
    });
  }

  // Sanitizes HTML using DOMPurify with a restricted tag allowlist.
  _sanitizeHtml(
    html,
    {
      allowedTags = [
        "p",
        "b",
        "i",
        "em",
        "strong",
        "u",
        "s",
        "br",
        "a",
        "ul",
        "ol",
        "li",
        "blockquote",
        "span",
      ],
    } = {}
  ) {
    if (!html) return "";
    const normalizedHtml = this._normalizeAboutHtml(html);
    return DOMPurify.sanitize(normalizedHtml, {
      ALLOWED_TAGS: allowedTags,
      ALLOWED_ATTR: ["href", "target", "rel"],
      FORCE_BODY: true,
    });
  }

  cleanup() {
    this.localCleanup.forEach((cleanupFn) => {
      try {
        cleanupFn();
      } catch (error) {
        console.warn("user-profile cleanup listener removal failed", error);
      }
    });
    this.localCleanup = [];
    super.cleanup();
  }
}

export { UserProfilePage };
