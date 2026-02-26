// js/components/user-events-section.js
// Renders a section of events the user is RSVP'd to for the dashboard
import { EventCard } from "./event-card.js";
import { appState } from "../app.js";

export class UserEventsSection {
  // Listen for RSVP events and update DB
  setupRSVPListener() {
    if (this.rsvpListenerCleanup) return;
    const handler = async (e) => {
      const { eventId, status } = e.detail;
      try {
        await this.supabase.from("event_rsvps").upsert(
          {
            event_id: eventId,
            user_id: this.userId,
            status,
          },
          { onConflict: ["event_id", "user_id"] }
        );
        // Refresh events after update
        await this.render();
      } catch (err) {
        console.error("Failed to update RSVP:", err);
      }
    };
    // Listen for RSVP events
    this.rsvpListenerCleanup = window.EventBus?.instance?.listen?.(
      window.EventBus?.EVENTS?.EVENT?.RSVP || "event:rsvp",
      handler
    );
  }
  constructor(containerId = "userEventsSection") {
    this.containerId = containerId;
    this.supabase = appState.getSupabase();
    this.userId = appState.getUserId();
  }

  async render() {
    this.setupRSVPListener();
    const container = document.getElementById(this.containerId);
    if (!container) return;
    container.innerHTML = '<div class="text-center">Loading your events...</div>';
    try {
      // Get all events the user is RSVP'd to (going or interested)
      const { data: rsvps, error } = await this.supabase
        .from("event_rsvps")
        .select("event_id, status, event:events(*)")
        .eq("user_id", this.userId)
        .in("status", ["going", "interested"]);
      if (error) throw error;
      if (!rsvps || rsvps.length === 0) {
        container.innerHTML = '<div class="empty">You have not RSVP’d to any events yet.</div>';
        return;
      }
      // Sort by event date/time ascending
      rsvps.sort((a, b) => {
        const d1 = a.event?.date || "";
        const d2 = b.event?.date || "";
        return d1.localeCompare(d2);
      });
      container.innerHTML = "";
      for (const rsvp of rsvps) {
        if (!rsvp.event) continue;
        // Always fetch RSVP counts and user objects for each event
        const { data: rsvpsData } = await this.supabase
          .from("event_rsvps")
          .select("status, user_id, user:users(display_name, headshot)")
          .eq("event_id", rsvp.event.id);
        const rsvpCounts = { going: 0, maybe: 0, interested: 0, not_going: 0 };
        const rsvpUsers = [];
        if (rsvpsData) {
          rsvpsData.forEach((r) => {
            if (rsvpCounts[r.status] !== undefined) rsvpCounts[r.status]++;
            rsvpUsers.push({
              ...r,
              display_name: r.user?.display_name,
              headshot_url: r.user?.headshot,
            });
          });
        }
        const card = new EventCard({
          event: rsvp.event,
          rsvpStatus: rsvp.status,
          rsvpCounts,
          rsvpUsers,
          variant: "dashboard",
        });
        const li = document.createElement("li");
        li.className = "event-list-item";
        const cardEl = card.create();
        li.appendChild(cardEl);
        container.appendChild(li);
      }
    } catch (err) {
      container.innerHTML = `<div class="empty">Error loading your events: ${err.message}</div>`;
    }
  }
}
