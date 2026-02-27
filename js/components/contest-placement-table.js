// js/components/contest-placement-table.js
// Table to display historical contest placements for an event
import { appState } from "../app.js";

export class ContestPlacementTable {
  constructor() {
    this.element = null;
    this.placements = [];
  }

  async loadPlacements(eventId) {
    const supabase = appState.getSupabase();
    const { data } = await supabase
      .from("competition_placements")
      .select("*, users: user_id (display_name, username)")
      .eq("event_id", eventId)
      .order("place");
    this.placements = data || [];
  }

  render() {
    this.element = document.createElement("table");
    this.element.className = "contest-placement-table";
    this.element.innerHTML = `
      <thead>
        <tr>
          <th>Place</th>
          <th>User</th>
          <th>Points</th>
        </tr>
      </thead>
      <tbody>
        ${this.placements
          .map(
            (p) => `
          <tr>
            <td>${p.place}</td>
            <td>${p.users?.display_name || p.users?.username || p.user_id}</td>
            <td>${p.points}</td>
          </tr>
        `
          )
          .join("")}
      </tbody>
    `;
    return this.element;
  }

  async init(eventId) {
    await this.loadPlacements(eventId);
    return this.render();
  }
}
