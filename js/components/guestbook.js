// js/components/guestbook.js
// Shared Guestbook logic for modal, form, and Supabase integration

import { SUPABASE_CONFIG } from "../config.js";
import { appState } from "../app.js";
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.94.1/+esm";
import { EventBus } from "../events/event-bus.js";

const supabase = createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.key);

export class Guestbook {
  constructor(pageName = "guestbook") {
    this.pageName = pageName;
    this.images = [
      "images/guestbook_fire.gif",
      "images/guestbook_jessica_simpson.gif",
      "images/guestbook_lion.gif",
      "images/guestbook_rock.gif",
      "images/guestbook_unicorn.gif",
      "images/guestbook_cop.gif",
      "images/guestbook_donald.gif",
      "images/guestbook_nanny.gif",
      "images/guestbook_lightning.gif",
      "images/guestbook_boop.gif",
      "images/guestbook_ken-ryu.gif",
    ];
  }

  init({
    triggerId = "guestbookTrigger",
    modalId = "guestbookModal",
    formId = "guestbookForm",
    entriesId = "guestbookEntries",
    errorId = "guestbookError",
    successId = "guestbookSuccess",
  } = {}) {
    // Set random guestbook image
    if (triggerId && document.getElementById(triggerId)) {
      const randomImage = this.images[Math.floor(Math.random() * this.images.length)];
      document.getElementById(triggerId).src = randomImage;
      document.getElementById(triggerId).addEventListener("click", () => {
        document.getElementById(modalId).style.display = "block";
        document.body.style.overflow = "hidden";
        this.loadEntries(entriesId);
      });
    }
    // Close modal
    if (modalId && document.getElementById(modalId)) {
      document.getElementById("closeGuestbook").addEventListener("click", () => {
        document.getElementById(modalId).style.display = "none";
        document.body.style.overflow = "auto";
      });
      document.querySelector(".guestbook-modal-overlay").addEventListener("click", () => {
        document.getElementById(modalId).style.display = "none";
        document.body.style.overflow = "auto";
      });
    }
    // Form submit
    if (formId && document.getElementById(formId)) {
      document.getElementById("signGuestbook").addEventListener("click", () => {
        this.sign(formId, entriesId, errorId, successId);
      });
    }
  }

  async loadEntries(entriesId) {
    const container = document.getElementById(entriesId);
    if (!container) return;
    try {
      const { data, error } = await supabase
        .from("guestbook")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      if (!data || data.length === 0) {
        container.innerHTML =
          '<p class="text-center">No entries yet!!! Be the first to sign!!!</p>';
        return;
      }
      container.innerHTML = data
        .map(
          (entry) => `
          <div class="guestbook-entry">
            <div class="entry-header">
              <span class="entry-name">${this.escapeHtml(entry.name)}</span>
              <span class="entry-date">${new Date(entry.created_at).toLocaleDateString()}</span>
            </div>
            <div class="entry-message">${this.escapeHtml(entry.message)}</div>
          </div>
        `
        )
        .join("");
    } catch (err) {
      container.innerHTML = `<p class="text-center" style="color: #FF0000;">Error loading guestbook: ${err.message}</p>`;
    }
  }

  async sign(formId, entriesId, errorId, successId) {
    const nameInput = document.getElementById("guestName");
    const messageInput = document.getElementById("guestMessage");
    const errorDiv = document.getElementById(errorId);
    const button = document.getElementById("signGuestbook");
    const successDiv = document.getElementById(successId);
    const name = nameInput.value.trim();
    const message = messageInput.value.trim();
    errorDiv.textContent = "";
    errorDiv.style.display = "none";
    // Rate limiting
    const lastSubmit = localStorage.getItem("lastGuestbookSubmit");
    if (lastSubmit && Date.now() - parseInt(lastSubmit) < 15000) {
      const secondsLeft = Math.ceil((15000 - (Date.now() - parseInt(lastSubmit))) / 1000);
      errorDiv.textContent = `Please wait ${secondsLeft} seconds before submitting again!!!`;
      errorDiv.style.display = "block";
      return;
    }
    // Validate
    if (!name || !message) {
      errorDiv.textContent = "Please fill in both fields!!!";
      errorDiv.style.display = "block";
      return;
    }
    if (name.length > 50) {
      errorDiv.textContent = "Name must be 50 characters or less!!!";
      errorDiv.style.display = "block";
      return;
    }
    if (message.length > 500) {
      errorDiv.textContent = "Message must be 500 characters or less!!!";
      errorDiv.style.display = "block";
      return;
    }
    button.disabled = true;
    button.textContent = "SIGNING...";
    try {
      const inserted = await addComment({ name, message, user_id: appState.getUserId() });
      // Emit guestbook sign event for achievements
      try {
        EventBus.instance.emit("user:guestbook:sign", {
          userId: appState.getUserId(),
          commentId: inserted?.id,
        });
      } catch (emitErr) {
        // noop
      }
      localStorage.setItem("lastGuestbookSubmit", Date.now().toString());
      successDiv.textContent = "✓ SUCCESS!!! Your message has been signed!!!";
      successDiv.style.display = "block";
      nameInput.value = "";
      messageInput.value = "";
      await this.loadEntries(entriesId);
      setTimeout(() => {
        successDiv.style.display = "none";
      }, 3000);
    } catch (err) {
      errorDiv.textContent = `Error: ${err.message}`;
      errorDiv.style.display = "block";
    } finally {
      button.disabled = false;
      button.textContent = "SIGN IT!!!";
    }
  }

  escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }
}

/**
 * addComment: statelessly adds a guestbook entry
 * @param {Object} data - { name, message, user_id, event_id, ... }
 * @returns {Promise}
 */
export function addComment(data) {
  const supabase = appState.getSupabase();
  // Only pass allowed fields
  const entry = {
    name: data.name,
    message: data.message,
    user_id: data.user_id,
    created_at: data.created_at || new Date().toISOString(),
  };
  return (async () => {
    const { data: inserted, error } = await supabase
      .from("guestbook")
      .insert([entry])
      .select()
      .maybeSingle();
    if (error) throw error;
    return inserted;
  })();
}

// Legacy sign function for backward compatibility
export function sign(name, message, options = {}) {
  return addComment({ name, message, ...options });
}
