// Competition Kit shared server logic: reveal state, allergen catalog, recipe input cleanup.
// Reveal rules must match recipe_competition_is_public() in sql/2026_10_10_competition_kit.sql.

const ALLERGENS = [
  { key: "gluten", label: "Gluten / wheat", group: "contains" },
  { key: "dairy", label: "Dairy", group: "contains" },
  { key: "egg", label: "Egg", group: "contains" },
  { key: "peanut", label: "Peanuts", group: "contains" },
  { key: "tree_nut", label: "Tree nuts", group: "contains" },
  { key: "soy", label: "Soy", group: "contains" },
  { key: "sesame", label: "Sesame", group: "contains" },
  { key: "fish", label: "Fish", group: "contains" },
  { key: "shellfish", label: "Shellfish", group: "contains" },
  { key: "none", label: "None of these", group: "none" },
  { key: "vegetarian", label: "Vegetarian", group: "diet" },
  { key: "vegan", label: "Vegan", group: "diet" },
];
const ALLERGEN_KEYS = new Set(ALLERGENS.map((a) => a.key));
const CONTAINS_KEYS = new Set(ALLERGENS.filter((a) => a.group === "contains").map((a) => a.key));
const ALLERGEN_LABELS = Object.fromEntries(ALLERGENS.map((a) => [a.key, a.label]));

const LIMITS = {
  title: 200,
  description: 2000,
  notes: 2000,
  time: 40,
  allergensOther: 200,
  groups: 10,
  groupTitle: 80,
  items: 60,
  qty: 20,
  unit: 30,
  item: 200,
  itemNote: 200,
  steps: 50,
  step: 1000,
};

// Date where it is earliest on Earth (UTC-12), so a day ends everywhere before it counts as past
function earliestToday(now = Date.now()) {
  return new Date(now - 12 * 3600 * 1000).toISOString().slice(0, 10);
}

function revealState(competition, now) {
  if (!competition) return "hidden";
  if (
    competition.voting_closed_at ||
    !competition.event_date ||
    competition.event_date < earliestToday(now)
  ) {
    return "public";
  }
  return competition.voting_open ? "judging" : "hidden";
}

function flattenGroups(groups) {
  const lines = [];
  (groups || []).forEach((g) => {
    (g.items || []).forEach((i) => {
      const head = [i.qty, i.unit, i.item].filter(Boolean).join(" ");
      lines.push(i.note ? `${head}, ${i.note}` : head);
    });
  });
  return lines;
}

// Recipes saved before ingredient_groups existed load as one untitled group
function groupsFor(recipe) {
  if (Array.isArray(recipe.ingredient_groups) && recipe.ingredient_groups.length) {
    return recipe.ingredient_groups;
  }
  const flat = Array.isArray(recipe.ingredients) ? recipe.ingredients : [];
  if (!flat.length) return [];
  return [{ title: "", items: flat.map((item) => ({ qty: "", unit: "", item, note: "" })) }];
}

function hasAllergenAnswer(allergens) {
  return (allergens || []).some((k) => k === "none" || CONTAINS_KEYS.has(k));
}

// Required to confirm an entry: title, blurb, allergen answer, at least one ingredient
function missingForEntry(recipe) {
  const missing = [];
  if (!recipe.title) missing.push("title");
  if (!recipe.description) missing.push("description");
  if (!hasAllergenAnswer(recipe.allergens)) missing.push("allergens");
  if (!flattenGroups(groupsFor(recipe)).length) missing.push("ingredients");
  return missing;
}

// Returns the full set of editable recipe columns from a request body.
function normalizeRecipeBody(body, sanitizeText) {
  const b = body || {};
  const groups = (Array.isArray(b.ingredientGroups) ? b.ingredientGroups : [])
    .slice(0, LIMITS.groups)
    .map((g) => ({
      title: sanitizeText(g && g.title, LIMITS.groupTitle) || "",
      items: (Array.isArray(g && g.items) ? g.items : [])
        .slice(0, LIMITS.items)
        .map((i) => ({
          qty: sanitizeText(i && i.qty, LIMITS.qty) || "",
          unit: sanitizeText(i && i.unit, LIMITS.unit) || "",
          item: sanitizeText(i && i.item, LIMITS.item) || "",
          note: sanitizeText(i && i.note, LIMITS.itemNote) || "",
        }))
        .filter((i) => i.item),
    }))
    .filter((g) => g.items.length || g.title);

  const steps = (Array.isArray(b.steps) ? b.steps : [])
    .slice(0, LIMITS.steps)
    .map((s) => sanitizeText(s, LIMITS.step))
    .filter(Boolean);

  let allergens = [
    ...new Set((Array.isArray(b.allergens) ? b.allergens : []).filter((k) => ALLERGEN_KEYS.has(k))),
  ];
  if (allergens.some((k) => CONTAINS_KEYS.has(k)))
    allergens = allergens.filter((k) => k !== "none");

  return {
    title: sanitizeText(b.title, LIMITS.title),
    description: sanitizeText(b.description, LIMITS.description),
    ingredient_groups: groups,
    ingredients: flattenGroups(groups),
    steps,
    notes: sanitizeText(b.notes, LIMITS.notes),
    prep_time: sanitizeText(b.prepTime, LIMITS.time),
    cook_time: sanitizeText(b.cookTime, LIMITS.time),
    servings: sanitizeText(b.servings, LIMITS.time),
    allergens,
    allergens_other: sanitizeText(b.allergensOther, LIMITS.allergensOther),
  };
}

module.exports = {
  ALLERGENS,
  ALLERGEN_LABELS,
  earliestToday,
  revealState,
  groupsFor,
  missingForEntry,
  normalizeRecipeBody,
};
