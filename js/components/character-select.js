// js/components/character-select.js
// Creates a grid of canvases representing selectable characters.
// Usage: const el = createCharacterSelect({ characters, size:200, columns:4 });
// Listen for 'character:selected' on the returned element.
// Pass activeCounts: { [userId]: number } to disable players at the 2-challenge cap.
// Pass incompleteCounts: { [userId]: number } to disable players with no challenges left.

const CHALLENGE_CAP = 2;

export function createCharacterSelect({ characters = [], size = 120, columns = 6, gap = 0, activeCounts = {}, incompleteCounts = {} } = {}) {
  const root = document.createElement("div");
  root.className = "character-select";
  root.style.setProperty("--char-size", size + "px");
  root.style.setProperty("--char-gap", gap + "px");
  root.style.setProperty("--char-columns", String(columns));

  const grid = document.createElement("div");
  grid.className = "character-select__grid";
  root.appendChild(grid);

  // Render character tiles
  characters.forEach((ch) => {
    const activeCount = activeCounts[ch.id] || 0;
    const incompleteCount = incompleteCounts[ch.id] || 0;
    // Disabled if: 2+ active challenges, no assignments at all, or all assignments completed
    const atCap = activeCount >= CHALLENGE_CAP || incompleteCount === 0;

    const tile = document.createElement("button");
    tile.type = "button";
    tile.className = "character-select__tile" + (atCap ? " character-select__tile--at-cap" : "");
    tile.setAttribute("data-sound", atCap ? "" : "sf_select");
    tile.setAttribute("aria-label", ch.name || "character");
    tile.disabled = atCap;

    const imgEl = document.createElement("img");
    imgEl.className = "character-select__image";
    imgEl.alt = ch.name || "character";
    imgEl.crossOrigin = "anonymous";
    imgEl.src = ch.image || "/images/headshot.jpg";
    imgEl.onerror = () => {
      imgEl.src = "/images/headshot.jpg";
    };

    tile.appendChild(imgEl);
    grid.appendChild(tile);

    if (atCap) return; // No click handler when at cap

    // Selection handling
    tile.addEventListener("click", () => {
      root.dispatchEvent(
        new CustomEvent("character:selected", { detail: { id: ch.id, name: ch.name } })
      );
      // visual feedback
      grid
        .querySelectorAll(".character-select__tile--selected")
        .forEach((el) => el.classList.remove("character-select__tile--selected"));
      tile.classList.add("character-select__tile--selected");
    });
  });

  return root;
}
