/**
 * Goblin King Easter Egg
 *
 * Injects a 1×1 invisible golden pixel at the viewport center.
 * Clicking it awards the "goblin_king" achievement and plays the
 * labyrinth audio — you have to know where to look.
 *
 * Does NOT run on pages using the `.myspace` body class.
 */

import { achievementService } from "/js/services/achievement-service.js";

// Inject stylesheet
(function injectStyles() {
  if (document.getElementById("goblin-king-styles")) return;
  const link = document.createElement("link");
  link.id = "goblin-king-styles";
  link.rel = "stylesheet";
  link.href = "/css/components/goblin-king.css";
  document.head.appendChild(link);
})();

export function initGoblinKing() {
  // Skip on myspace pages
  if (document.body && document.body.classList.contains("myspace")) return;

  // Don't double-init
  if (document.getElementById("goblinPixel")) return;

  // --- Golden Pixel ---
  const pixel = document.createElement("div");
  pixel.id = "goblinPixel";
  document.body.appendChild(pixel);

  // --- Overlay ---
  const overlay = document.createElement("div");
  overlay.id = "goblinOverlay";
  overlay.innerHTML = `
    <img src="/images/labyrinth-nope.gif" alt="You have no power over me" />
    <p>click to dismiss</p>
  `;
  document.body.appendChild(overlay);

  // Labyrinth audio (kept outside listener so we can stop it on dismiss)
  const labyrinthAudio = new Audio("/audio/labyrynth.mp3");
  labyrinthAudio.preload = "none";

  function showOverlay() {
    overlay.classList.add("goblin-active");
  }

  function hideOverlay() {
    overlay.classList.remove("goblin-active");
    labyrinthAudio.pause();
    labyrinthAudio.currentTime = 0;
  }

  function playLabyrinth() {
    labyrinthAudio.currentTime = 0;
    labyrinthAudio.play().catch(() => {
      // autoplay blocked — user already interacted via click, should be fine
    });
  }

  overlay.addEventListener("click", hideOverlay);

  pixel.addEventListener("click", async () => {
    showOverlay();

    // Award the achievement (idempotent — returns null if already awarded)
    const awarded = await achievementService.awardByKey("goblin_king");

    if (awarded) {
      // First time: let the success audio play (~2.5s) then start labyrinth
      setTimeout(playLabyrinth, 2500);
    } else {
      // Already earned: skip success sound, go straight to the babe
      playLabyrinth();
    }
  });
}
