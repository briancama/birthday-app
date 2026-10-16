// 1-5 score picker for one judging category, with optional rubric level text.
import { escapeHtml } from "./kit-utils.js";

const SCORES = [1, 2, 3, 4, 5];

export function levelFor(category, score) {
  return (category.levels || []).find((l) => Number(l.score) === Number(score)) || null;
}

function levelText(category, score) {
  const level = score ? levelFor(category, score) : null;
  if (!level) return "";
  return [level.label, level.description].filter(Boolean).map(escapeHtml).join(": ");
}

export function scoreInputHtml(category, value) {
  const key = escapeHtml(category.key);
  return `
    <fieldset class="kit-score" id="score-${key}" data-score-cat="${key}">
      <legend class="kit-score__label">
        ${escapeHtml(category.label)} <span class="kit-weight">&times;${category.weight}</span>
      </legend>
      ${category.description ? `<p class="kit-hint kit-score__desc">${escapeHtml(category.description)}</p>` : ""}
      <div class="kit-score__options">
        ${SCORES.map(
          (n) => `
          <label class="kit-score__opt">
            <input type="radio" name="${key}" value="${n}" ${value === n ? "checked" : ""} required />
            <span>${n}</span>
          </label>`
        ).join("")}
      </div>
      <p class="kit-score__level" data-level-for="${key}">${levelText(category, value)}</p>
    </fieldset>`;
}

export function updateLevelText(form, category) {
  const picked = form.querySelector(`input[name="${CSS.escape(category.key)}"]:checked`);
  const el = form.querySelector(`[data-level-for="${CSS.escape(category.key)}"]`);
  if (el) el.innerHTML = levelText(category, picked ? Number(picked.value) : null);
}
