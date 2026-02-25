// js/pages/event-info.js
import { BasePage } from "./base-page.js";
import { appState } from "../app.js";
import { Guestbook } from "../components/guestbook.js";

import { EventCard } from "../components/event-card.js";
import { EventBus } from "../events/event-bus.js";

class EventInfoPage extends BasePage {
  // Fallback avatars for comments without user_id
  fallbackAvatars = [
    "images/fallback1.jpg",
    "images/fallback2.jpg",
    "images/fallback3.jpg",
    "images/fallback4.jpg",
    "images/fallback5.jpg",
    "images/fallback6.jpg",
    "images/fallback7.jpg",
    "images/fallback8.jpg",
    "images/fallback9.jpg",
    "images/fallback10.jpg",
    "images/fallback11.jpg",
    "images/fallback12.jpg",
    // Add more as needed
  ];
  constructor() {
    super();
    this.components = [];
  }

  onReady() {
    this.setupPageTitleAndUser();
    this.setupHeadshot();
    this.loadAndRenderEvents();
    this.setupGuestbook();
    this.loadMyspaceComments();
    this.setupAddCommentLink();
  }

  setupPageTitleAndUser() {
    this.setPageTitle("Event Info");
    this.updateMarqueeUsername(appState.getCurrentUser()?.username || "Guest");
    const user = appState.getCurrentUser();
    const nameElem = document.getElementById("myspaceName");
    if (user && user.display_name && nameElem) {
      nameElem.textContent = user.display_name + "'s BriSpace";
      nameElem.classList.add("fade-in");
    }
  }

  setupHeadshot() {
    const user = appState.getCurrentUser();
    const headshotElem = document.querySelector(".myspace-headshot");
    if (headshotElem) {
      headshotElem.src = user && user.headshot ? `images/${user.headshot}` : "images/headshot.jpg";
    }
  }

  async loadAndRenderEvents() {
    const eventList = document.getElementById("eventSchedule");
    if (!eventList) return;
    eventList.innerHTML = "<li>Loading events...</li>";
    this.eventCardMap = {};
    try {
      const { createClient } =
        await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.94.1/+esm");
      const { SUPABASE_CONFIG } = await import("../config.js");
      const supabase = createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.key);
      // Fetch events
      const { data: events, error } = await supabase
        .from("events")
        .select("*")
        .order("date", { ascending: true })
        .order("time_start", { ascending: true, nullsFirst: true });
      if (error) throw error;
      if (!events || events.length === 0) {
        eventList.innerHTML = "<li>No events scheduled.</li>";
        return;
      }
      eventList.innerHTML = "";
      for (const event of events) {
        // Fetch RSVP counts
        const { data: rsvps } = await supabase
          .from("event_rsvps")
          .select("status, user_id")
          .eq("event_id", event.id);
        const rsvpCounts = { going: 0, maybe: 0, interested: 0, not_going: 0 };
        const rsvpUsers = [];
        if (rsvps) {
          rsvps.forEach((r) => {
            if (rsvpCounts[r.status] !== undefined) rsvpCounts[r.status]++;
            rsvpUsers.push({ user_id: r.user_id, status: r.status });
          });
        }
        // Determine current user's RSVP status
        const currentUser = appState.getCurrentUser();
        let rsvpStatus = null;
        if (currentUser && rsvps) {
          const found = rsvps.find((r) => r.user_id === currentUser.id);
          if (found) rsvpStatus = found.status;
        }
        // Render EventCard
        const card = new EventCard({
          event,
          rsvpStatus,
          rsvpCounts,
          rsvpUsers,
          variant: "myspace",
        });
        const li = document.createElement("li");
        li.className = "event-list-item";
        const cardEl = card.create();
        li.appendChild(cardEl);
        eventList.appendChild(li);
        // Store reference for per-card updates
        this.eventCardMap[event.id] = { card, cardEl, li };
        // Listen for RSVP events from EventCard
        card.addEventListener("rsvp", (e) => {
          // Optionally handle local UI update
        });
      }
      // Listen for global RSVP events to update only the affected card
      EventBus.instance.listen(EventBus.EVENTS.EVENT.RSVP, async (e) => {
        const { eventId, status } = e.detail;
        const currentUser = appState.getCurrentUser();
        if (!currentUser) return;
        // Optimistic UI: update button state instantly
        const cardRef = this.eventCardMap[eventId];
        if (cardRef) {
          const btns = cardRef.cardEl.querySelectorAll(".rsvp-btn");
          btns.forEach((btn) => {
            btn.classList.toggle("active", btn.dataset.status === status);
            btn.disabled = true;
          });
        }
        try {
          await supabase.from("event_rsvps").upsert(
            {
              event_id: eventId,
              user_id: currentUser.id,
              status,
            },
            { onConflict: ["event_id", "user_id"] }
          );
          // Fetch latest RSVP data for this event only, joining users for display_name and headshot_url
          const { data: rsvps } = await supabase
            .from("event_rsvps")
            .select("status, user_id, user:users(display_name, headshot)")
            .eq("event_id", eventId);
          // Recompute counts and users
          const rsvpCounts = { going: 0, maybe: 0, interested: 0, not_going: 0 };
          const rsvpUsers = [];
          if (rsvps) {
            rsvps.forEach((r) => {
              if (rsvpCounts[r.status] !== undefined) rsvpCounts[r.status]++;
              rsvpUsers.push({
                ...r,
                display_name: r.user?.display_name,
                headshot_url: r.user?.headshot,
              });
            });
          }
          // Update card state and UI
          if (cardRef) {
            cardRef.card.updateRSVPState({
              rsvpStatus: status,
              rsvpCounts,
              rsvpUsers,
            });
            const btns = cardRef.cardEl.querySelectorAll(".rsvp-btn");
            btns.forEach((btn) => {
              btn.disabled = false;
            });
          }
        } catch (err) {
          // Revert UI and show error
          if (cardRef) {
            cardRef.card.updateRSVPState({
              rsvpStatus: cardRef.card.rsvpStatus,
              rsvpCounts: cardRef.card.rsvpCounts,
              rsvpUsers: cardRef.card.rsvpUsers,
            });
            const btns = cardRef.cardEl.querySelectorAll(".rsvp-btn");
            btns.forEach((btn) => {
              btn.disabled = false;
            });
          }
          this.showError("Failed to update RSVP: " + err.message);
        }
      });
    } catch (err) {
      eventList.innerHTML = `<li style="color: #FF0000;">Error loading events: ${err.message}</li>`;
    }
  }

  setupGuestbook() {
    const guestbook = new Guestbook("event-info");
    guestbook.init({
      triggerId: "guestbookTrigger",
      modalId: "guestbookModal",
      formId: "guestbookForm",
      entriesId: "guestbookEntries",
      errorId: "guestbookError",
      successId: "guestbookSuccess",
    });
    this.components.push(guestbook);
    this.guestbook = guestbook;
  }

  setupAddCommentLink() {
    const addCommentLink = document.getElementById("addCommentBtn");
    const viewAllCommentsLink = document.getElementById("viewAllComments");
    const openModal = (e) => {
      if (e) e.preventDefault();
      document.getElementById("guestbookModal").style.display = "block";
      document.body.style.overflow = "hidden";
      // Load entries in modal as well
      this.guestbook.loadEntries("guestbookEntries");
    };
    if (addCommentLink) {
      addCommentLink.addEventListener("click", openModal);
    }
    if (viewAllCommentsLink) {
      viewAllCommentsLink.textContent = "Add Comment";
      viewAllCommentsLink.addEventListener("click", openModal);
    }

    // Cancel button closes modal
    const cancelBtn = document.getElementById("cancelGuestbook");
    if (cancelBtn) {
      cancelBtn.addEventListener("click", (e) => {
        e.preventDefault();
        document.getElementById("guestbookModal").style.display = "none";
        document.body.style.overflow = "auto";
      });
    }

    // ESC key closes modal
    document.addEventListener("keydown", (e) => {
      const modal = document.getElementById("guestbookModal");
      if (modal && modal.style.display === "block" && e.key === "Escape") {
        modal.style.display = "none";
        document.body.style.overflow = "auto";
      }
    });
  }

  async loadMyspaceComments() {
    // Fetch guestbook entries from Supabase
    const commentsList = document.getElementById("myspaceCommentsList");
    const countElem = document.getElementById("commentsCount");
    const totalElem = document.getElementById("commentsTotal");
    if (!commentsList) return;
    commentsList.innerHTML = '<p class="text-center">Loading comments...</p>';
    try {
      const { createClient } =
        await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.94.1/+esm");
      const { SUPABASE_CONFIG } = await import("../config.js");
      const supabase = createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.key);
      const { data, error, count } = await supabase
        .from("guestbook")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      if (!data || data.length === 0) {
        commentsList.innerHTML =
          '<p class="text-center">No comments yet. Be the first to comment!</p>';
        countElem.textContent = "0";
        totalElem.textContent = "0";
        return;
      }
      countElem.textContent = data.length;
      totalElem.textContent = count || data.length;
      commentsList.innerHTML = data
        .map((entry, idx) => this.renderMyspaceComment(entry, idx))
        .join("");
    } catch (err) {
      commentsList.innerHTML = `<p class="text-center" style="color: #FF0000;">Error loading comments: ${err.message}</p>`;
      countElem.textContent = "0";
      totalElem.textContent = "0";
    }
  }

  renderMyspaceComment(entry) {
    const name = this.escapeHtml(entry.name);
    const date = new Date(entry.created_at).toLocaleString();
    const message = this.escapeHtml(entry.message);
    const currentUser = appState.getCurrentUser();
    const canEdit =
      currentUser && currentUser.display_name && currentUser.display_name === entry.name;

    // Avatar logic: use user profile image if user_id is present, else fallback
    let avatar = "";
    // Accept idx as second argument
    const idx = arguments[1] || 0;
    if (entry.user_id && entry.user_profile_image) {
      avatar = entry.user_profile_image;
    } else {
      // Use fallback avatar in order by array index
      const fallbackArr = this.fallbackAvatars;
      avatar = fallbackArr[(fallbackArr.length - 1 - idx) % fallbackArr.length];
    }

    return `
      <div class="myspace-comment-card">
        <div class="myspace-comment-sidebar">
          <div class="myspace-comment-name">${name}</div>
          <img src="${avatar}" alt="avatar" class="myspace-comment-avatar" />
        </div>
        <div class="myspace-comment-content">
          <div class="myspace-comment-header">
            <span class="myspace-comment-date">${date}</span>
          </div>
          <div class="myspace-comment-message">${message}</div>
          <div class="myspace-comment-actions">
            ${canEdit ? '<a href=\"#\" class=\"edit-btn\">Edit</a>' : ""}
          </div>
        </div>
      </div>
    `;
  }

  escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  cleanup() {
    this.components.forEach((c) => c.cleanup?.());
    // Remove any additional listeners if needed
  }
}

export { EventInfoPage };
