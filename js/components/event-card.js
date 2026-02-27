// js/components/event-card.js
// Reusable EventCard component for displaying events and RSVP actions
import { EventBus } from "../events/event-bus.js";

export class EventCard extends EventTarget {
  constructor({
    event,
    rsvpStatus,
    rsvpCounts,
    rsvpUsers,
    variant = "myspace",
    showRSVPButtons = true,
  }) {
    super();
    this.event = event;
    this.rsvpStatus = rsvpStatus;
    this.rsvpCounts = rsvpCounts || {};
    this.rsvpUsers = rsvpUsers || [];
    this.variant = variant;
    this.showRSVPButtons = showRSVPButtons;
  }

  updateRSVPState({ rsvpStatus, rsvpCounts, rsvpUsers }) {
    this.rsvpStatus = rsvpStatus;
    this.rsvpCounts = rsvpCounts || {};
    this.rsvpUsers = rsvpUsers || [];
    // Update RSVP buttons
    const btns = this.cardEl?.querySelectorAll?.(".rsvp-btn");
    if (btns) {
      btns.forEach((btn) => {
        btn.classList.toggle("active", btn.dataset.status === rsvpStatus);
      });
    }
    // Update avatars
    const avatarsDiv = this.cardEl?.querySelector?.(".event-card-avatars");
    if (avatarsDiv) {
      avatarsDiv.innerHTML = "";
      this.rsvpUsers.forEach((u) => {
        if (u.status === "going") {
          const img = document.createElement("img");
          img.className = "event-card-avatar";
          img.src = u.headshot_url ? `images/${u.headshot_url}` : "images/headshot.jpg";
          img.alt = u.display_name;
          img.title = u.display_name;
          if (u.user_id) {
            img.setAttribute("data-headshot", `user-${u.user_id}`);
          }
          avatarsDiv.appendChild(img);
        }
      });
    }
    // Update counts
    const countsDiv = this.cardEl?.querySelector?.(".event-card-rsvp-counts");
    if (countsDiv) {
      countsDiv.innerHTML = "";
      ["going", "interested"].forEach((status) => {
        if (this.rsvpCounts[status] > 0) {
          const span = document.createElement("span");
          span.className = `rsvp-count rsvp-count--${status}`;
          span.textContent = `${this.rsvpCounts[status]} ${status}`;
          countsDiv.appendChild(span);
        }
      });
    }
  }

  create() {
    const card = document.createElement("div");
    card.className = `event-card event-card--${this.variant}`;
    this.cardEl = card;

    // Header row: title (left), date+time (right)
    const header = document.createElement("div");
    header.className = "event-card-header";

    const title = document.createElement("h4");
    title.className = "event-card-title";
    title.textContent = this.event.title;
    header.appendChild(title);

    // Date and time formatting in Pacific Time (treat input as Pacific, not UTC)
    let dateTimeStr = "";
    if (this.event.date) {
      // Always display the date as stored (no timezone conversion)
      const [year, month, day] = this.event.date.split("-").map(Number);
      const jsDate = new Date(year, month - 1, day);
      const weekday = jsDate.toLocaleDateString(undefined, { weekday: "long" });
      const monthStr = jsDate.toLocaleDateString(undefined, { month: "long" });
      const dayNum = jsDate.getDate();
      const getOrdinal = (n) => {
        if (n > 3 && n < 21) return "th";
        switch (n % 10) {
          case 1:
            return "st";
          case 2:
            return "nd";
          case 3:
            return "rd";
          default:
            return "th";
        }
      };
      let dateStr = `${weekday}, ${monthStr} ${dayNum}${getOrdinal(dayNum)}`;
      let timeStr = "";
      if (this.event.time_label) {
        timeStr = this.event.time_label;
      } else if (this.event.time_start) {
        // Display the time as stored (no timezone conversion)
        const [h, m, s] = this.event.time_start.split(":").map(Number);
        const pad = (n) => n.toString().padStart(2, "0");
        let startStr = `${h % 12 === 0 ? 12 : h % 12}:${pad(m)}${s ? ":" + pad(s) : ""} ${h < 12 ? "AM" : "PM"}`;
        let endStr = "";
        if (this.event.time_end) {
          const [eh, em, es] = this.event.time_end.split(":").map(Number);
          endStr = `${eh % 12 === 0 ? 12 : eh % 12}:${pad(em)}${es ? ":" + pad(es) : ""} ${eh < 12 ? "AM" : "PM"}`;
        }
        timeStr = endStr ? `${startStr} - ${endStr}` : startStr;
      }
      dateTimeStr = dateStr;
      if (timeStr) dateTimeStr += ` • ${timeStr}`;
    }
    const dateDiv = document.createElement("div");
    dateDiv.className = "event-card-datetime";
    dateDiv.textContent = dateTimeStr;
    header.appendChild(dateDiv);
    card.appendChild(header);

    // Title and description
    if (this.event.description) {
      const desc = document.createElement("div");
      desc.className = "event-card-desc";
      desc.textContent = this.event.description;
      card.appendChild(desc);
    }

    // Location (with directions link if present)
    if (this.event.location) {
      const loc = document.createElement("div");
      loc.className = "event-card-location";
      if (this.event.directions_url) {
        const a = document.createElement("a");
        a.href = this.event.directions_url;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        a.textContent = this.event.location;
        loc.appendChild(a);
      } else {
        loc.textContent = this.event.location;
      }
      card.appendChild(loc);
    }

    // General link (if present)
    if (this.event.link_url) {
      const link = document.createElement("a");
      link.href = this.event.link_url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.className = "event-card-link";
      link.textContent = this.event.link_label || "More Info";
      card.appendChild(link);
    }

    // RSVP buttons (optional)
    if (this.showRSVPButtons) {
      card.appendChild(this.renderRSVPButtons());
    }

    // RSVP user avatars (optional)
    if (this.rsvpUsers && this.rsvpUsers.length > 0) {
      const avatars = document.createElement("div");
      avatars.className = "event-card-avatars";
      this.rsvpUsers.forEach((u) => {
        if (u.status === "going") {
          const img = document.createElement("img");
          img.className = "event-card-avatar";
          img.src = u.headshot_url ? `${u.headshot_url}` : "images/headshot.jpg";
          img.alt = u.display_name;
          img.title = u.display_name;
          img.dataset.headshot = u.user_id ? `user-${u.user_id}` : "user-default";
          avatars.appendChild(img);
        }
      });
      card.appendChild(avatars);
    }

    // RSVP counts (optional)
    if (this.rsvpCounts && Object.keys(this.rsvpCounts).length > 0) {
      const counts = document.createElement("div");
      counts.className = "event-card-rsvp-counts";
      ["going", "interested"].forEach((status) => {
        if (this.rsvpCounts[status] > 0) {
          const span = document.createElement("span");
          span.className = `rsvp-count rsvp-count--${status}`;
          span.textContent = `${this.rsvpCounts[status]} ${status}`;
          counts.appendChild(span);
        }
      });
      card.appendChild(counts);
    }

    return card;
  }

  renderRSVPButtons() {
    const rsvpSection = document.createElement("div");
    rsvpSection.className = "event-card-rsvp";
    ["going", "interested", "not_going"].forEach((status) => {
      const btn = document.createElement("button");
      btn.className = `rsvp-btn rsvp-btn--${status}`;
      btn.dataset.status = status;
      let label = "";
      if (status === "going")
        label = '<img class="icon-gif" src="images/yes_face.gif" alt="✅" /> I\'m in';
      else if (status === "interested")
        label = '<img class="icon-gif" src="images/maybe_face.gif" alt="✨" /> Hmmm';
      else if (status === "not_going")
        label = '<img class="icon-gif" src="images/nope_face.gif" alt="❌" /> Nope';
      btn.innerHTML = label;
      if (this.rsvpStatus === status) btn.classList.add("active");
      btn.addEventListener("click", () => {
        EventBus.instance.emit(EventBus.EVENTS.EVENT.RSVP, {
          eventId: this.event.id,
          status,
        });
      });
      rsvpSection.appendChild(btn);
    });
    return rsvpSection;
  }
}
