// js/components/contest-placement-form.js
// Admin form for adding/updating contest placements
import { appState } from "../app.js";

export class ContestPlacementForm {
  constructor({ onSubmit }) {
    this.onSubmit = onSubmit;
    this.element = null;
    this.events = [];
    this.users = [];
  }

  async loadData() {
    const supabase = appState.getSupabase();
    // Fetch events
    const { data: events } = await supabase.from("events").select("id, title").order("date");
    this.events = events || [];
    // Fetch users
    const { data: users } = await supabase
      .from("users")
      .select("id, display_name, username")
      .order("display_name");
    this.users = users || [];
  }

  render() {
    this.element = document.createElement("form");
    this.element.className = "contest-placement-form";
    this.element.innerHTML = `
      <label>Event:
        <select name="event" required>
          <option value="">Select event</option>
          ${this.events.map((e) => `<option value="${e.id}">${e.title}</option>`).join("")}
        </select>
      </label>
      <label>User:
        <select name="user" required>
          <option value="">Select user</option>
          ${this.users.map((u) => `<option value="${u.id}">${u.display_name || u.username}</option>`).join("")}
        </select>
      </label>
      <label>Place:
        <input type="number" name="place" min="1" placeholder="e.g. 1 for 1st" required />
      </label>
      <label>Points:
        <input type="number" name="points" min="0" placeholder="Override" />
      </label>
      <button type="submit">Assign Placement</button>
    `;
    this.element.addEventListener("submit", (e) => {
      e.preventDefault();
      const formData = new FormData(this.element);
      const place = Number(formData.get("place"));
      let points = formData.get("points");
      points =
        points !== null && points !== ""
          ? Number(points)
          : ContestPlacementForm.defaultPoints(place);
      this.onSubmit({
        event_id: formData.get("event"),
        user_id: formData.get("user"),
        place,
        points,
      });
    });
    return this.element;
  }

  // Default points logic
  static defaultPoints(place) {
    if (place === 1) return 10;
    if (place === 2) return 8;
    if (place === 3) return 7;
    if (place === 4) return 6;
    if (place === 5) return 5;
    if (place === 6) return 4;
    if (place === 7) return 3;
    if (place === 8) return 2;
    return 1;
  }

  async init() {
    await this.loadData();
    return this.render();
  }
}
