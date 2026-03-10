// js/pages/user-profile.js
// BriSpace user profile page — public view with owner-only inline editing.
import { BasePage } from "./base-page.js";
import { appState } from "../app.js";

class UserProfilePage extends BasePage {
  constructor() {
    // Public page — no forced auth redirect; softInit will load user if signed in.
    super({ requiresAuth: false, siteAward: false });
    this.profileUserId = document.body.dataset.profileUserId || null;
    this.isOwner = false;
  }

  // BasePage calls initAuth only if requiresAuth:true; for public pages it calls softInit.
  // onReady() fires after softInit completes.
  async onReady() {
    this.isOwner = !!(this.profileUserId && this.userId && this.userId === this.profileUserId);
    if (this.isOwner) document.body.classList.add("is-owner");

    this.setupHeadshotUpload();
    this.setupInlineEdits();
    this.loadAchievements();
    this.loadWall();
    this.setupWallPost();
  }

  // ── Headshot upload (owner only) ───────────────────────────────────────────
  setupHeadshotUpload() {
    if (!this.isOwner) return;
    const img = document.querySelector("[data-headshot='user-profile']");
    if (!img) return;
    img.style.cursor = "pointer";
    img.title = "Click to upload headshot";
    img.addEventListener("click", async () => {
      const { HeadshotUpload } = await import("../components/headshot-upload.js");
      const uploader = new HeadshotUpload(this.userId, this.supabase);
      uploader.trigger();
    });
  }

  // ── Inline edit buttons ────────────────────────────────────────────────────
  setupInlineEdits() {
    if (!this.isOwner) return;
    this._wireEdit("bio");
    this._wireEdit("details");
    this._wireTopNEdit();
  }

  // Generic inline edit wiring: show/hide form when pencil button clicked.
  _wireEdit(section) {
    const btn = document.getElementById(`edit-${section}-btn`);
    const form = document.getElementById(`edit-${section}-form`);
    const display = document.getElementById(`${section}-display`);
    if (!btn || !form) return;

    btn.addEventListener("click", () => {
      const open = form.classList.toggle("active");
      btn.textContent = open ? "✕ cancel" : "✏ edit";
      if (display) display.style.display = open ? "none" : "";
    });

    const saveBtn = form.querySelector(".profile-edit-save");
    const cancelBtn = form.querySelector(".profile-edit-cancel");

    cancelBtn?.addEventListener("click", () => {
      form.classList.remove("active");
      btn.textContent = "✏ edit";
      if (display) display.style.display = "";
    });

    saveBtn?.addEventListener("click", () => this._saveSection(section, form, display, btn));
  }

  async _saveSection(section, form, display, btn) {
    const saveBtn = form.querySelector(".profile-edit-save");
    saveBtn.disabled = true;
    saveBtn.textContent = "Saving...";

    try {
      const payload = {};
      form.querySelectorAll("[data-field]").forEach((el) => {
        payload[el.dataset.field] = el.value;
      });

      const resp = await fetch(`/api/users/${this.profileUserId}/profile-fields`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      if (!resp.ok) throw new Error((await resp.json()).error || resp.statusText);

      // Update display values in-place
      form.querySelectorAll("[data-field]").forEach((el) => {
        const displayEl = document.querySelector(`[data-display="${el.dataset.field}"]`);
        if (displayEl) displayEl.textContent = el.value || "—";
      });

      // Special case: about_html display
      if (section === "bio") {
        const aboutEl = document.getElementById("about-display");
        const aboutInput = form.querySelector("[data-field='about_html']");
        if (aboutEl && aboutInput) aboutEl.innerHTML = this._escapeHtml(aboutInput.value);
      }

      form.classList.remove("active");
      btn.textContent = "✏ edit";
      if (display) display.style.display = "";
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
    try {
      const { data, error } = await this.supabase
        .from("user_achievements")
        .select("achievement_id, awarded_at, achievements(name, image_url)")
        .eq("user_id", this.profileUserId)
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
      this._renderWall(entries || []);
    } catch {
      container.innerHTML = `<p class="wall-entry">Could not load wall.</p>`;
    }
  }

  _renderWall(entries) {
    const container = document.getElementById("wall-entries");
    if (!container) return;
    if (entries.length === 0) {
      container.innerHTML = `<p class="wall-entry">No comments yet — be the first!</p>`;
      return;
    }
    container.innerHTML = entries
      .map((e) => {
        const isMine = e.author_user_id && e.author_user_id === this.userId;
        return `
        <div class="wall-entry${isMine ? " is-mine" : ""}" data-entry-id="${e.id}">
          <div class="wall-entry__header">
            <span class="wall-entry__author">${this._escapeHtml(e.author_name)}</span>
            <span>${new Date(e.created_at).toLocaleDateString()}</span>
            <button class="wall-entry__delete" data-id="${e.id}" aria-label="Delete">✕</button>
          </div>
          <div class="wall-entry__message">${this._escapeHtml(e.message)}</div>
        </div>`;
      })
      .join("");

    container.querySelectorAll(".wall-entry__delete").forEach((btn) => {
      btn.addEventListener("click", () => this._deleteWallEntry(btn.dataset.id));
    });
  }

  setupWallPost() {
    const form = document.getElementById("wall-post-form");
    if (!form) return;

    if (!this.userId) {
      form.innerHTML = `<p class="wall-login-prompt"><a href="/">Sign in</a> to leave a comment.</p>`;
      return;
    }
    // Owner shouldn't post on their own wall
    if (this.isOwner) {
      form.style.display = "none";
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
}

export { UserProfilePage };
