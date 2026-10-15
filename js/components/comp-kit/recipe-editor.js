// Recipe editor for a competition entry: dish card (required to confirm), ingredient
// sections, instruction steps, extras (incl. photo). Autosaves to the entry API.
// Events: "saved" (detail: { entry }), "status" (detail: { text, tone }).
import { escapeHtml, apiJson } from "./kit-utils.js";

const AUTOSAVE_MS = 1500;
const PHOTO_MAX_PX = 1600;
// 3x the largest judge-list thumbnail (--kit-thumb 64-80px)
const THUMB_MAX_PX = 240;
const PHOTO_QUALITY = 0.85;
// Client-only cap; the server still allows 2000 for older entries
const DESCRIPTION_MAX = 300;

// Ticked diet tag + any of these ticked = probably a mistake; warn, don't auto-clear
const DIET_CONFLICTS = {
  vegan: ["dairy", "egg", "fish", "shellfish"],
  vegetarian: ["fish", "shellfish"],
};

const blankItem = () => ({ qty: "", unit: "", item: "", note: "" });

function docFromEntry(entry, defaultTitle) {
  const e = entry || {};
  const groups = (e.ingredient_groups || []).map((g) => ({
    title: g.title || "",
    items: (g.items || []).map((i) => ({ ...blankItem(), ...i })),
  }));
  return {
    title: e.title || defaultTitle || "",
    description: e.description || "",
    allergens: new Set(e.allergens || []),
    allergensOther: e.allergens_other || "",
    groups: groups.length ? groups : [{ title: "", items: [blankItem()] }],
    steps: e.steps && e.steps.length ? [...e.steps] : [""],
    notes: e.notes || "",
    prepTime: e.prep_time || "",
    cookTime: e.cook_time || "",
    servings: e.servings || "",
  };
}

function encodeJpeg(bitmap, maxPx) {
  const scale = Math.min(1, maxPx / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Couldn't read that photo"))),
      "image/jpeg",
      PHOTO_QUALITY
    )
  );
}

// Re-encoding also drops EXIF (including GPS) from the original
async function shrinkPhoto(file) {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const [full, thumb] = await Promise.all([
      encodeJpeg(bitmap, PHOTO_MAX_PX),
      encodeJpeg(bitmap, THUMB_MAX_PX),
    ]);
    return { full, thumb };
  } finally {
    bitmap.close?.();
  }
}

export class RecipeEditor extends EventTarget {
  constructor(root, { competitionId, entry, allergens, defaultTitle }) {
    super();
    this.root = root;
    this.competitionId = competitionId;
    this.catalog = allergens || [];
    this.containsKeys = new Set(
      this.catalog.filter((a) => a.group === "contains").map((a) => a.key)
    );
    this.labels = Object.fromEntries(this.catalog.map((a) => [a.key, a.label]));
    this.entry = entry || null;
    this.doc = docFromEntry(entry, defaultTitle);
    this.dirty = !entry && !!defaultTitle;
    this.saving = null;
    this.timer = null;
    this.handlers = {
      input: (e) => this.onInput(e),
      change: (e) => this.onChange(e),
      click: (e) => this.onClick(e),
      keydown: (e) => this.onKeydown(e),
      beforeunload: (e) => {
        if (this.dirty) e.preventDefault();
      },
    };
  }

  mount() {
    this.render();
    ["input", "change", "click", "keydown"].forEach((t) =>
      this.root.addEventListener(t, this.handlers[t])
    );
    window.addEventListener("beforeunload", this.handlers.beforeunload);
    this.updateChecklist();
    this.setStatus(this.entry ? "All changes saved" : "Not saved yet", "muted");
  }

  destroy() {
    clearTimeout(this.timer);
    ["input", "change", "click", "keydown"].forEach((t) =>
      this.root.removeEventListener(t, this.handlers[t])
    );
    window.removeEventListener("beforeunload", this.handlers.beforeunload);
  }

  // ── Rendering ──
  render() {
    const d = this.doc;
    this.root.innerHTML = `
      <form class="kit-editor" novalidate>
        <section class="kit-card kit-card--banded kit-ed-section">
          <header class="kit-card__head"><h2>Dish card</h2>${this.reqHtml(true)}</header>
          <div class="kit-card__body">
          <label class="kit-field">
            <span class="kit-label">Dish name</span>
            <input class="kit-input" data-f="title" maxlength="200" value="${escapeHtml(d.title)}" placeholder="What are you bringing?" />
          </label>
          <label class="kit-field">
            <span class="kit-label">Short description</span>
            <span class="kit-hint">A sentence or two the judges see on your dish card.</span>
            <textarea class="kit-input kit-input--short" data-f="description" rows="2" maxlength="${Math.max(DESCRIPTION_MAX, d.description.length)}" placeholder="Dill spear in cornmeal batter, fried to order.">${escapeHtml(d.description)}</textarea>
            <span class="kit-count" data-count></span>
          </label>
          <fieldset class="kit-field kit-allergens">
            <legend class="kit-label">Allergens</legend>
            <p class="kit-hint">Tick every one your dish contains, or pick "None of these."</p>
            <div class="kit-checks kit-checks--grid">${this.allergenChecks("contains")}</div>
            <p class="kit-or" aria-hidden="true">or</p>
            <div class="kit-checks">${this.allergenChecks("none")}</div>
          </fieldset>
          <fieldset class="kit-field kit-allergens">
            <legend class="kit-label">Suitable for <span class="kit-opt">optional</span></legend>
            <div class="kit-checks kit-checks--grid">${this.allergenChecks("diet")}</div>
            <p class="kit-conflict" data-conflict role="status"></p>
          </fieldset>
          <label class="kit-field">
            <span class="kit-label">Anything else to flag? <span class="kit-opt">optional</span></span>
            <span class="kit-hint">Other allergens or ingredients guests might want to avoid.</span>
            <input class="kit-input" data-f="allergensOther" maxlength="200" value="${escapeHtml(d.allergensOther)}" placeholder="e.g. mustard, coconut, honey" />
          </label>
          </div>
        </section>

        <section class="kit-card kit-card--banded kit-ed-section">
          <header class="kit-card__head"><h2>Ingredients</h2>${this.reqHtml(true)}</header>
          <div class="kit-card__body">
          <p class="kit-hint">Split into sections if it helps, like "For the batter" and "For the dip". Press Enter in an ingredient to add the next one.</p>
          <div data-groups>${this.groupsHtml()}</div>
          <button type="button" class="kit-linklike" data-act="add-group">+ Add another section</button>
          </div>
        </section>

        <section class="kit-card kit-card--banded kit-ed-section">
          <header class="kit-card__head"><h2>Instructions</h2>${this.reqHtml()}</header>
          <div class="kit-card__body">
          <p class="kit-hint">Finish this any time, even after the event.</p>
          <div data-steps>${this.stepsHtml()}</div>
          <button type="button" class="kit-btn kit-btn--add" data-act="add-step">+ Add a step</button>
          </div>
        </section>

        <section class="kit-card kit-card--banded kit-ed-section">
          <header class="kit-card__head"><h2>Extras</h2>${this.reqHtml()}</header>
          <div class="kit-card__body">
          <div class="kit-row3">
            <label class="kit-field"><span class="kit-label">Prep time</span>
              <input class="kit-input" data-f="prepTime" maxlength="40" value="${escapeHtml(d.prepTime)}" placeholder="20 min" /></label>
            <label class="kit-field"><span class="kit-label">Cook time</span>
              <input class="kit-input" data-f="cookTime" maxlength="40" value="${escapeHtml(d.cookTime)}" placeholder="1 hr" /></label>
            <label class="kit-field"><span class="kit-label">Makes</span>
              <input class="kit-input" data-f="servings" maxlength="40" value="${escapeHtml(d.servings)}" placeholder="24 sticks" /></label>
          </div>
          <label class="kit-field">
            <span class="kit-label">Notes &amp; tips</span>
            <textarea class="kit-input" data-f="notes" rows="3" maxlength="2000">${escapeHtml(d.notes)}</textarea>
          </label>
          <div class="kit-field kit-ed-photo-field">
            <span class="kit-label">Photo</span>
            <p class="kit-hint">Shows on your recipe page after the event.</p>
            <div data-photo>${this.photoHtml()}</div>
          </div>
          </div>
        </section>

        <div class="kit-savebar">
          <ul class="kit-checklist" data-checklist></ul>
          <span class="kit-savebar__status" data-status role="status"></span>
          <button type="button" class="kit-btn kit-btn--primary" data-act="save">Save</button>
        </div>
      </form>`;
  }

  reqHtml(required = false) {
    return `<span class="kit-req">${required ? "Required" : "Optional"}</span>`;
  }

  allergenChecks(group) {
    return this.catalog
      .filter((a) => a.group === group)
      .map(
        (a) => `
        <label class="kit-check${a.key === "none" ? " kit-check--none" : ""}">
          <input type="checkbox" name="allergen" value="${a.key}" ${this.doc.allergens.has(a.key) ? "checked" : ""} />
          <span>${escapeHtml(a.label)}</span>
        </label>`
      )
      .join("");
  }

  photoHtml() {
    const e = this.entry;
    const url = e && (e.thumb_url || e.image_url);
    return `
      <div class="kit-ed-photo__row">
        ${url ? `<img class="kit-ed-photo" src="${escapeHtml(url)}" alt="" />` : ""}
        <label class="kit-linklike">
          ${url ? "Replace photo" : "Add a photo"}
          <input type="file" accept="image/jpeg,image/png,image/webp" data-photo-input hidden />
        </label>
        ${url ? `<button type="button" class="kit-linklike" data-act="remove-photo">Remove</button>` : ""}
      </div>`;
  }

  groupsHtml() {
    const many = this.doc.groups.length > 1;
    return this.doc.groups
      .map(
        (g, gi) => `
        <div class="kit-group" data-group="${gi}">
          <div class="kit-group__head">
            <input class="kit-input kit-group__title" data-g="${gi}" data-f="groupTitle" maxlength="80"
              value="${escapeHtml(g.title)}" placeholder="${many ? "Section name" : "Section name (optional)"}" />
            ${many ? `<button type="button" class="kit-icon-btn" data-act="remove-group" data-g="${gi}" aria-label="Remove section">&times;</button>` : ""}
          </div>
          <ol class="kit-items">
            ${g.items.map((it, ii) => this.itemHtml(gi, ii, it, g.items.length)).join("")}
          </ol>
          <button type="button" class="kit-btn kit-btn--add kit-add-item" data-act="add-item" data-g="${gi}">+ Add ingredient</button>
        </div>`
      )
      .join("");
  }

  itemHtml(gi, ii, it, count) {
    const at = `data-g="${gi}" data-i="${ii}"`;
    return `
      <li class="kit-item">
        <input class="kit-input kit-item__qty" ${at} data-f="qty" maxlength="20" value="${escapeHtml(it.qty)}" placeholder="Qty" aria-label="Quantity" />
        <input class="kit-input kit-item__unit" ${at} data-f="unit" maxlength="30" value="${escapeHtml(it.unit)}" placeholder="Unit" aria-label="Unit" />
        <input class="kit-input kit-item__item" ${at} data-f="item" maxlength="200" value="${escapeHtml(it.item)}" placeholder="Ingredient" aria-label="Ingredient" />
        <input class="kit-input kit-item__note" ${at} data-f="note" maxlength="200" value="${escapeHtml(it.note)}" placeholder="Note (diced, room temp...)" aria-label="Note" />
        <span class="kit-item__tools">
          <button type="button" class="kit-icon-btn" data-act="move-item" data-dir="-1" ${at} ${ii === 0 ? "disabled" : ""} aria-label="Move up">&uarr;</button>
          <button type="button" class="kit-icon-btn" data-act="move-item" data-dir="1" ${at} ${ii === count - 1 ? "disabled" : ""} aria-label="Move down">&darr;</button>
          <button type="button" class="kit-icon-btn" data-act="remove-item" ${at} aria-label="Remove ingredient">&times;</button>
        </span>
      </li>`;
  }

  stepsHtml() {
    const count = this.doc.steps.length;
    return `<ol class="kit-steps-ed">${this.doc.steps
      .map(
        (s, si) => `
        <li class="kit-step">
          <textarea class="kit-input" data-s="${si}" data-f="step" rows="2" maxlength="1000" placeholder="Step ${si + 1}" aria-label="Step ${si + 1}">${escapeHtml(s)}</textarea>
          <span class="kit-item__tools">
            <button type="button" class="kit-icon-btn" data-act="move-step" data-dir="-1" data-s="${si}" ${si === 0 ? "disabled" : ""} aria-label="Move step up">&uarr;</button>
            <button type="button" class="kit-icon-btn" data-act="move-step" data-dir="1" data-s="${si}" ${si === count - 1 ? "disabled" : ""} aria-label="Move step down">&darr;</button>
            <button type="button" class="kit-icon-btn" data-act="insert-step" data-s="${si}" aria-label="Add a step after this one">+</button>
            <button type="button" class="kit-icon-btn" data-act="remove-step" data-s="${si}" aria-label="Remove step">&times;</button>
          </span>
        </li>`
      )
      .join("")}</ol>`;
  }

  rerender(part, focusSelector) {
    const html = part === "groups" ? this.groupsHtml() : this.stepsHtml();
    this.root.querySelector(`[data-${part}]`).innerHTML = html;
    if (focusSelector) this.root.querySelector(focusSelector)?.focus();
  }

  // ── Input handling ──
  onInput(e) {
    const t = e.target;
    const f = t.dataset.f;
    if (!f) return;
    const g = Number(t.dataset.g);
    if (f === "groupTitle") this.doc.groups[g].title = t.value;
    else if (t.dataset.i !== undefined) this.doc.groups[g].items[Number(t.dataset.i)][f] = t.value;
    else if (f === "step") this.doc.steps[Number(t.dataset.s)] = t.value;
    else this.doc[f] = t.value;
    this.touch();
  }

  onChange(e) {
    const t = e.target;
    if (t.name === "allergen") {
      const { allergens } = this.doc;
      if (t.checked) allergens.add(t.value);
      else allergens.delete(t.value);
      // "None of these" and any "contains" box are mutually exclusive
      if (t.checked && t.value === "none") this.containsKeys.forEach((k) => allergens.delete(k));
      if (t.checked && this.containsKeys.has(t.value)) allergens.delete("none");
      // Vegan implies vegetarian
      if (t.checked && t.value === "vegan") allergens.add("vegetarian");
      if (!t.checked && t.value === "vegetarian") allergens.delete("vegan");
      this.root.querySelectorAll('input[name="allergen"]').forEach((box) => {
        box.checked = allergens.has(box.value);
      });
      this.touch();
    } else if (t.matches("[data-photo-input]") && t.files && t.files[0]) {
      this.uploadPhoto(t.files[0]);
    }
  }

  onKeydown(e) {
    if (e.key !== "Enter" || e.target.dataset.f !== "item" || e.isComposing) return;
    e.preventDefault();
    const g = Number(e.target.dataset.g);
    const i = Number(e.target.dataset.i);
    this.doc.groups[g].items.splice(i + 1, 0, blankItem());
    this.rerender("groups", `[data-g="${g}"][data-i="${i + 1}"][data-f="qty"]`);
    this.touch();
  }

  onClick(e) {
    const btn = e.target.closest("[data-act]");
    if (!btn) return;
    const act = btn.dataset.act;
    const g = Number(btn.dataset.g);
    const i = Number(btn.dataset.i);
    const s = Number(btn.dataset.s);
    const dir = Number(btn.dataset.dir);
    const { groups, steps } = this.doc;

    switch (act) {
      case "save":
        this.save();
        return;
      case "remove-photo":
        this.save({ removePhoto: true });
        return;
      case "add-group":
        groups.push({ title: "", items: [blankItem()] });
        this.rerender("groups", `[data-g="${groups.length - 1}"][data-f="groupTitle"]`);
        break;
      case "remove-group":
        if (
          groups[g].items.some((it) => it.item) &&
          !confirm("Remove this section and its ingredients?")
        )
          return;
        groups.splice(g, 1);
        this.rerender("groups");
        break;
      case "add-item":
        groups[g].items.push(blankItem());
        this.rerender(
          "groups",
          `[data-g="${g}"][data-i="${groups[g].items.length - 1}"][data-f="qty"]`
        );
        break;
      case "remove-item":
        groups[g].items.splice(i, 1);
        if (!groups[g].items.length) groups[g].items.push(blankItem());
        this.rerender("groups");
        break;
      case "move-item": {
        const items = groups[g].items;
        [items[i], items[i + dir]] = [items[i + dir], items[i]];
        this.rerender(
          "groups",
          `[data-act="move-item"][data-dir="${dir}"][data-g="${g}"][data-i="${i + dir}"]`
        );
        break;
      }
      case "add-step":
        steps.push("");
        this.rerender("steps", `[data-s="${steps.length - 1}"][data-f="step"]`);
        break;
      case "insert-step":
        steps.splice(s + 1, 0, "");
        this.rerender("steps", `[data-s="${s + 1}"][data-f="step"]`);
        break;
      case "remove-step":
        steps.splice(s, 1);
        if (!steps.length) steps.push("");
        this.rerender("steps");
        break;
      case "move-step":
        [steps[s], steps[s + dir]] = [steps[s + dir], steps[s]];
        this.rerender("steps", `[data-act="move-step"][data-dir="${dir}"][data-s="${s + dir}"]`);
        break;
      default:
        return;
    }
    this.touch();
  }

  // ── Saving ──
  touch() {
    this.dirty = true;
    this.updateChecklist();
    this.setStatus("Unsaved changes", "muted");
    clearTimeout(this.timer);
    if (this.doc.title.trim()) this.timer = setTimeout(() => this.save(), AUTOSAVE_MS);
  }

  missing() {
    const d = this.doc;
    const missing = [];
    if (!d.title.trim()) missing.push("Dish name");
    if (!d.description.trim()) missing.push("Description");
    if (![...d.allergens].some((k) => k === "none" || this.containsKeys.has(k)))
      missing.push("Allergens");
    if (!d.groups.some((g) => g.items.some((it) => it.item.trim()))) missing.push("Ingredients");
    return missing;
  }

  updateChecklist() {
    const el = this.root.querySelector("[data-checklist]");
    if (!el) return;
    const missing = this.missing();
    el.innerHTML = missing.length
      ? `<li class="kit-checklist__todo">Still needed: ${missing.join(", ")}</li>`
      : `<li class="kit-checklist__done">Entry confirmed</li>`;

    const len = this.doc.description.length;
    const count = this.root.querySelector("[data-count]");
    count.textContent = `${len} / ${DESCRIPTION_MAX}`;
    count.dataset.near = len > DESCRIPTION_MAX - 40 ? "true" : "false";

    const { allergens } = this.doc;
    const diet = ["vegan", "vegetarian"].find((k) => allergens.has(k));
    const clash = diet ? DIET_CONFLICTS[diet].filter((k) => allergens.has(k)) : [];
    this.root.querySelector("[data-conflict]").textContent = clash.length
      ? `${this.labels[diet]}, but ${clash.map((k) => this.labels[k]).join(" and ")} ${clash.length > 1 ? "are" : "is"} ticked. Worth a double-check.`
      : "";
  }

  setStatus(text, tone = "muted") {
    const el = this.root.querySelector("[data-status]");
    if (el) {
      el.textContent = text;
      el.dataset.tone = tone;
    }
    this.dispatchEvent(new CustomEvent("status", { detail: { text, tone } }));
  }

  body(extra = {}) {
    const d = this.doc;
    return {
      title: d.title,
      description: d.description,
      allergens: [...d.allergens],
      allergensOther: d.allergensOther,
      ingredientGroups: d.groups,
      steps: d.steps,
      notes: d.notes,
      prepTime: d.prepTime,
      cookTime: d.cookTime,
      servings: d.servings,
      ...extra,
    };
  }

  // Saves are serialized; a save requested mid-flight runs once the current one ends
  async save(extra) {
    clearTimeout(this.timer);
    if (!this.doc.title.trim()) {
      this.setStatus("Give your dish a name to save", "error");
      return false;
    }
    if (this.saving) {
      await this.saving.catch(() => {});
      if (!this.dirty && !extra) return true;
    }
    this.dirty = false;
    this.setStatus("Saving...", "muted");
    const base = `/api/competitions/${this.competitionId}/entries`;
    this.saving = this.entry
      ? apiJson(`${base}/${this.entry.id}`, { method: "PATCH", body: this.body(extra) })
      : apiJson(base, { method: "POST", body: this.body() });
    try {
      const { entry } = await this.saving;
      const photoChanged = !this.entry || entry.image_url !== this.entry.image_url;
      this.entry = entry;
      if (photoChanged) this.root.querySelector("[data-photo]").innerHTML = this.photoHtml();
      this.setStatus(this.dirty ? "Unsaved changes" : "All changes saved", "ok");
      this.dispatchEvent(new CustomEvent("saved", { detail: { entry } }));
      return true;
    } catch (err) {
      this.dirty = true;
      this.setStatus(err.message, "error");
      return false;
    } finally {
      this.saving = null;
    }
  }

  async uploadPhoto(file) {
    const wrap = this.root.querySelector("[data-photo]");
    if (!this.entry && !(await this.save())) return;
    this.setStatus("Uploading photo...", "muted");
    wrap.classList.add("is-busy");
    try {
      const { full, thumb } = await shrinkPhoto(file).catch(() => {
        throw new Error("Couldn't read that photo. Try a JPEG or PNG.");
      });
      const { uploads, path } = await apiJson(
        `/api/competitions/${this.competitionId}/entries/${this.entry.id}/photo-upload`,
        { method: "POST", body: { contentType: "image/jpeg" } }
      );
      const puts = await Promise.all(
        [
          [uploads.full, full],
          [uploads.thumb, thumb],
        ].map(([url, blob]) =>
          fetch(url, { method: "PUT", headers: { "Content-Type": "image/jpeg" }, body: blob })
        )
      );
      if (puts.some((r) => !r.ok)) throw new Error("Photo upload failed. Try again.");
      await this.save({ photoPath: path });
    } catch (err) {
      this.setStatus(err.message, "error");
    } finally {
      wrap.classList.remove("is-busy");
    }
  }
}
