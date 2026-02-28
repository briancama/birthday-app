// js/pages/event-info.js
import { BasePage } from "./base-page.js";
import { appState } from "../app.js";
import { Guestbook } from "../components/guestbook.js";

import { EventCard } from "../components/event-card.js";
import { EventBus } from "../events/event-bus.js";
import { MUSIC_SONGS } from "../constants/music-songs.js";

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
  ].reverse();
  constructor() {
    super();
    this.components = [];
    this.headshotUpload = null;
  }

  async init() {
    await super.init();
  }

  onReady() {
    this.setupPageTitleAndUser();
    this.setupHeadshot();
    this.setupHeadshotUpload();
    this.setupMusicPlayer();
    this.loadAndRenderEvents();
    this.setupGuestbook();
    this.loadMyspaceComments();
    this.setupAddCommentLink();
  }

  /**
   * Insert and initialize the retro MusicPlayer component
   */
  setupMusicPlayer() {
    // Dynamically import the MusicPlayer web component
    import("../components/music-player.js").then(({ MusicPlayer }) => {
      // Find or create the container for the music player
      let container = document.getElementById("musicPlayerContainer");
      if (!container) {
        container = document.createElement("div");
        container.id = "musicPlayerContainer";
        // Insert at the top of the .myspace-about section if present
        const aboutDiv = document.querySelector(".myspace-about");
        if (aboutDiv) {
          aboutDiv.insertBefore(container, aboutDiv.firstChild);
        } else {
          document.body.insertBefore(container, document.body.firstChild);
        }
      }
      // Use static song list
      const player = document.createElement("music-player");
      player.setSongs(MUSIC_SONGS);
      container.innerHTML = "";
      container.appendChild(player);
      // Optionally: handle song select event
      // player.setOnSongSelect((song) => { ... });
    });
  }

  setupPageTitleAndUser() {
    this.setPageTitle("Event Info");
    this.updateMarqueeUsername(appState.getCurrentUser()?.username || "Guest");
    const user = appState.getCurrentUser();
    const nameElem = document.getElementById("myspaceName");
    // Only set the title on the client if the server didn't already render it.
    if (nameElem) {
      const existing = nameElem.textContent && nameElem.textContent.trim();
      if (!existing) {
        if (user && user.display_name) {
          nameElem.textContent = user.display_name + "'s BriSpace";
          nameElem.classList.add("fade-in");
        }
      }
    }
  }

  setupHeadshot() {
    const user = appState.getCurrentUser();
    const headshotElem = document.querySelector(".myspace-headshot");
    if (headshotElem) {
      headshotElem.src = user && user.headshot ? user.headshot : "images/headshot.jpg";
      // Always set data-headshot to user-{userId} (or user-unknown if not logged in)
      const userId = user && user.id ? user.id : "unknown";
      headshotElem.setAttribute("data-headshot", `user-${userId}`);
    }
  }

  setupHeadshotUpload() {
    // Insert upload link into .myspace-about
    import("../components/headshot-upload.js").then(({ HeadshotUpload }) => {
      const aboutDiv = document.querySelector(".myspace-about");
      if (!aboutDiv) return;
      this.headshotUpload = new HeadshotUpload();
      this.headshotUpload.init().then((uploadEl) => {
        aboutDiv.appendChild(uploadEl);
      });
    });
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
        // Fetch RSVP counts and users (with join)
        const { data: rsvps } = await supabase
          .from("event_rsvps")
          .select("status, user_id, user:users(display_name, headshot)")
          .eq("event_id", event.id);
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
        // Add data-headshot to event avatar images
        const eventAvatarImgs = cardEl.querySelectorAll(".event-avatar, .myspace-event-avatar");
        eventAvatarImgs.forEach((img) => {
          // Set data-headshot to user-{userId} for RSVP avatars
          const rsvpUser = rsvpUsers.find(
            (u) => u.user_id && img.classList.contains("event-avatar")
          );
          if (rsvpUser && rsvpUser.user_id) {
            img.setAttribute("data-headshot", `user-${rsvpUser.user_id}`);
          } else {
            img.setAttribute("data-headshot", `user-default`);
          }
        });
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
      formId: null,
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

    // Add comment button handler
    const submitBtn = document.getElementById("commentSubmit");
    if (submitBtn) {
      submitBtn.addEventListener("click", async (e) => {
        e.preventDefault();
        const messageInput = document.getElementById("guestMessage");
        const errorDiv = document.getElementById("guestbookError");
        const successDiv = document.getElementById("guestbookSuccess");
        errorDiv.textContent = "";
        errorDiv.style.display = "none";
        successDiv.textContent = "";
        successDiv.style.display = "none";
        if (!messageInput) {
          errorDiv.textContent = "Comment form not loaded. Please try again.";
          errorDiv.style.display = "block";
          return;
        }
        const user = appState.getCurrentUser();
        const name = (user && user.display_name) || "Anonymous";
        const message = messageInput.value.trim();
        if (!message) {
          errorDiv.textContent = "Please enter a message.";
          errorDiv.style.display = "block";
          return;
        }
        try {
          // Add comment and capture inserted row so we can emit the achievement event
          const inserted = await import("../components/guestbook.js").then(({ addComment }) =>
            addComment({
              name,
              message,
              user_id: user ? user.id : null,
              event_id: null,
              created_at: new Date().toISOString(),
            })
          );

          // Emit the same event Guestbook.sign would emit so AchievementService reacts
          try {
            EventBus.instance.emit("user:guestbook:sign", {
              userId: user ? user.id : null,
              commentId: inserted?.id,
            });
          } catch (emitErr) {
            console.warn("Failed to emit guestbook sign event:", emitErr);
          }

          successDiv.textContent = "Comment added!";
          successDiv.style.display = "block";
          messageInput.value = "";

          // Append the newly inserted comment to the page's comments list (avoid full reload)
          try {
            const myspaceList = document.getElementById("myspaceCommentsList");
            const headshot = user && user.headshot ? user.headshot : "images/headshot.jpg";
            const newElem = this.createMyspaceCommentElement(
              { ...inserted, user_id: user ? user.id : null },
              null,
              { [user ? user.id : "unknown"]: headshot }
            );

            // Prepend to myspace comments (newest first) and update counts
            if (myspaceList) {
              myspaceList.prepend(newElem);
              const countElem = document.getElementById("commentsCount");
              const totalElem = document.getElementById("commentsTotal");
              if (countElem) {
                const current = Number(countElem.textContent || "0");
                countElem.textContent = String(current + 1);
              }
              if (totalElem) {
                const currentT = Number(totalElem.textContent || "0");
                totalElem.textContent = String(currentT + 1);
              }

              // Smoothly reveal the newly-added comment at the top
              try {
                newElem.scrollIntoView({ behavior: "smooth" });
              } catch (e) {
                // ignore scroll errors on old browsers
              }
            }
          } catch (appendErr) {
            console.warn("Failed to append comment to UI:", appendErr);
          }
        } catch (err) {
          errorDiv.textContent = "Failed to add comment: " + err.message;
          errorDiv.style.display = "block";
        }
      });
    }
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
      // Assign fallback avatars only to oldest 12 legacy comments (no user_id)
      let fallbackIdx = 0;
      // Build userId->headshot map from all users using existing supabase client
      const userHeadshots = {};
      const { data: users } = await supabase.from("users").select("id, headshot");
      if (users) {
        users.forEach((u) => {
          if (u.headshot) userHeadshots[u.id] = u.headshot;
        });
      }
      // Separate legacy and user_id comments
      const legacyComments = data.filter((entry) => !entry.user_id);
      const userComments = data.filter((entry) => entry.user_id);
      // Sort legacy comments oldest first
      legacyComments.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
      // Take oldest 12
      const legacyToShow = legacyComments.slice(0, 12);
      // Sort user_id comments newest first
      userComments.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
      // Combine with legacy comments
      const combined = [...legacyToShow, ...userComments];
      // Reverse so newest overall appears first
      commentsList.innerHTML = combined
        .reverse()
        .map((entry) => {
          let avatarIdx = null;
          if (!entry.user_id && fallbackIdx < this.fallbackAvatars.length) {
            avatarIdx = fallbackIdx;
            fallbackIdx++;
          }
          return this.renderMyspaceComment(entry, avatarIdx, userHeadshots);
        })
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

    // Avatar logic: fallback only if no user_id, otherwise use headshot
    let avatar = "";
    const avatarIdx = arguments[1];
    const userHeadshots = arguments[2] || {};
    let dataAttr = "";
    if (entry.user_id && userHeadshots[entry.user_id]) {
      avatar = `${userHeadshots[entry.user_id]}`;
      dataAttr = `data-headshot='user-${entry.user_id}'`;
    } else if (!entry.user_id && avatarIdx !== null && avatarIdx !== undefined) {
      avatar = this.fallbackAvatars[avatarIdx];
      dataAttr = `data-headshot='user-fallback-${avatarIdx}'`;
    } else {
      avatar = "images/headshot.jpg";
      dataAttr = `data-headshot='user-default'`;
    }

    return `
      <div class="myspace-comment-card">
        <div class="myspace-comment-sidebar">
          <div class="myspace-comment-name">${name}</div>
          <img src="${avatar}" alt="avatar" class="myspace-comment-avatar" ${dataAttr} />
        </div>
        <div class="myspace-comment-content">
          <div class="myspace-comment-header">
            <span class="myspace-comment-date">${date}</span>
          </div>
          <div class="myspace-comment-message">${message}</div>
        </div>
      </div>
    `;
  }

  // Create and return a DOM node for a myspace comment (safer for single-item insertions)
  createMyspaceCommentElement(entry, avatarIdx, userHeadshots) {
    const nameText = entry.name || "Anonymous";
    const dateText = new Date(entry.created_at).toLocaleString();
    const messageText = entry.message || "";

    // Determine avatar and data-headshot attribute
    let avatarSrc = "images/headshot.jpg";
    let dataHeadshot = "user-default";
    if (entry.user_id && userHeadshots && userHeadshots[entry.user_id]) {
      avatarSrc = userHeadshots[entry.user_id];
      dataHeadshot = `user-${entry.user_id}`;
    } else if (!entry.user_id && typeof avatarIdx === "number") {
      avatarSrc = this.fallbackAvatars[avatarIdx] || avatarSrc;
      dataHeadshot = `user-fallback-${avatarIdx}`;
    }

    const card = document.createElement("div");
    card.className = "myspace-comment-card";

    const sidebar = document.createElement("div");
    sidebar.className = "myspace-comment-sidebar";

    const nameDiv = document.createElement("div");
    nameDiv.className = "myspace-comment-name";
    nameDiv.textContent = nameText;

    const img = document.createElement("img");
    img.className = "myspace-comment-avatar";
    img.alt = "avatar";
    img.src = avatarSrc;
    img.setAttribute("data-headshot", dataHeadshot);

    sidebar.appendChild(nameDiv);
    sidebar.appendChild(img);

    const content = document.createElement("div");
    content.className = "myspace-comment-content";

    const header = document.createElement("div");
    header.className = "myspace-comment-header";

    const dateSpan = document.createElement("span");
    dateSpan.className = "myspace-comment-date";
    dateSpan.textContent = dateText;
    header.appendChild(dateSpan);

    const msg = document.createElement("div");
    msg.className = "myspace-comment-message";
    msg.textContent = messageText;

    content.appendChild(header);
    content.appendChild(msg);

    card.appendChild(sidebar);
    card.appendChild(content);

    return card;
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
