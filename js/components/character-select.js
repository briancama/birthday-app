// js/components/character-select.js
// Creates a grid of canvases representing selectable characters.
// Usage: const el = createCharacterSelect({ characters, size:200, columns:4 });
// Listen for 'character:selected' on the returned element.

export function createCharacterSelect({ characters = [], size = 120, columns = 6, gap = 0 } = {}) {
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
    const tile = document.createElement("button");
    tile.type = "button";
    tile.className = "character-select__tile";
    tile.setAttribute('data-sound', 'sf_select');
    tile.setAttribute("aria-label", ch.name || "character");

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
