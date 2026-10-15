// Shared helpers for Competition Kit pages (standalone; no appState/BasePage).

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function readKitData() {
  const el = document.getElementById("kitData");
  return el ? JSON.parse(el.textContent) : null;
}

export async function apiJson(url, { method = "GET", body } = {}) {
  const res = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Something went wrong. Try again.");
  return data;
}

export async function refreshKitData(slug) {
  return apiJson(`/api/competitions/${encodeURIComponent(slug)}`);
}

// Allergen chips for a dish card or recipe
export function allergenChips(entry, catalog) {
  const labels = Object.fromEntries((catalog || []).map((a) => [a.key, a.label]));
  const chips = (entry.allergens || [])
    .filter((k) => labels[k])
    .map(
      (k) =>
        `<li class="kit-chip kit-chip--${k}">${k === "none" ? "No common allergens" : escapeHtml(labels[k])}</li>`
    );
  if (entry.allergens_other)
    chips.push(`<li class="kit-chip">${escapeHtml(entry.allergens_other)}</li>`);
  return chips.length
    ? `<ul class="kit-chips" aria-label="Allergens and diet">${chips.join("")}</ul>`
    : "";
}

export function ingredientList(groups) {
  return (groups || [])
    .map(
      (g) => `
      ${g.title ? `<h4 class="kit-ingredients__group">${escapeHtml(g.title)}</h4>` : ""}
      <ul class="kit-ingredients">
        ${g.items
          .map((i) => {
            const qty = [i.qty, i.unit].filter(Boolean).join(" ");
            return `<li>${qty ? `<span class="kit-ingredients__qty">${escapeHtml(qty)}</span> ` : ""}${escapeHtml(i.item)}${
              i.note ? `<span class="kit-ingredients__note">, ${escapeHtml(i.note)}</span>` : ""
            }</li>`;
          })
          .join("")}
      </ul>`
    )
    .join("");
}

// Minimal modal shell; content is rendered into the returned step element
export class KitModal {
  constructor(label) {
    this.root = document.getElementById("kitModalRoot");
    this.label = label;
    this.onKey = (e) => e.key === "Escape" && this.close();
  }

  open() {
    this.root.innerHTML = `
      <div class="kit-modal-backdrop">
        <div class="kit-modal" role="dialog" aria-modal="true" aria-label="${escapeHtml(this.label)}">
          <button class="kit-modal__close" type="button" aria-label="Close">&times;</button>
          <div class="kit-modal__step"></div>
        </div>
      </div>`;
    document.body.classList.add("kit-modal-open");
    this.root.querySelector(".kit-modal-backdrop").addEventListener("click", (e) => {
      if (e.target === e.currentTarget) this.close();
    });
    this.root.querySelector(".kit-modal__close").addEventListener("click", () => this.close());
    document.addEventListener("keydown", this.onKey);
    return this.root.querySelector(".kit-modal__step");
  }

  close() {
    document.removeEventListener("keydown", this.onKey);
    this.root.innerHTML = "";
    document.body.classList.remove("kit-modal-open");
  }
}
