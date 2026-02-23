// js/pages/event-info.js
import { BasePage } from "./base-page.js";
import { appState } from "../app.js";
import { Guestbook } from "../components/guestbook.js";

class EventInfoPage extends BasePage {
  constructor() {
    super();
    this.components = [];
  }

  onReady() {
    this.setPageTitle("Event Info");
    this.updateMarqueeUsername(appState.getCurrentUser()?.username || "Guest");
    // Show user's first name in .myspace-name h2
    const user = appState.getCurrentUser();
    const nameElem = document.getElementById("myspaceName");
    if (user && user.display_name && nameElem) {
      nameElem.textContent = user.display_name + "'s BriSpace";
      // Trigger fade-in animation
      nameElem.classList.add("fade-in");
    }
    // Set headshot image if available
    const headshotElem = document.querySelector(".myspace-headshot");
    if (headshotElem) {
      if (user && user.headshot) {
        headshotElem.src = `images/${user.headshot}`;
      } else {
        headshotElem.src = "images/headshot.jpg"; // fallback temporary image
      }
    }
    // RSVP/Like logic
    document.querySelectorAll(".like-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        btn.classList.toggle("liked");
        let count = btn.querySelector(".like-count");
        count.textContent = btn.classList.contains("liked") ? "1" : "0";
      });
    });
    document.querySelectorAll(".rsvp-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        btn.classList.toggle("rsvped");
        btn.textContent = btn.classList.contains("rsvped") ? "RSVP’d" : "RSVP";
      });
    });
    // Guestbook logic
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
    // Add to calendar
    document.getElementById("add-calendar-btn").addEventListener("click", () => {
      this.showSuccess("Calendar export coming soon!");
    });
  }

  cleanup() {
    this.components.forEach((c) => c.cleanup?.());
    // Remove any additional listeners if needed
  }
}

export { EventInfoPage };
