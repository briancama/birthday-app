const express = require("express");
const router = express.Router();
const {
  getSupabase,
  requireSignedUser,
  createSanitizer,
  isAdminUser,
} = require("../js/utils/server-utils");
const {
  ALLERGENS,
  revealState,
  groupsFor,
  missingForEntry,
  normalizeRecipeBody,
} = require("../js/utils/competition-kit");

const supabase = getSupabase();
const DOMPurify = createSanitizer();
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RSVP_STATUSES = new Set(["going", "maybe", "not_going", "interested"]);
const COMPETITION_COLS =
  "id, name, slug, theme, event_date, voting_open, voting_closed_at, favorite_bonus, event_id";
const RECIPE_COLS =
  "id, user_id, title, slug, description, ingredients, ingredient_groups, steps, notes, prep_time, cook_time, servings, allergens, allergens_other, image_url, image_path, thumb_path, users ( username, display_name )";
const PHOTO_BUCKET = "recipe-photos";
const PHOTO_TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

function sanitizeText(value, maxLength) {
  if (typeof value !== "string") return null;
  const clean = DOMPurify.sanitize(value, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] }).trim();
  if (!clean) return null;
  return maxLength ? clean.slice(0, maxLength) : clean;
}

async function getCompetitionById(id) {
  if (!UUID_REGEX.test(id || "")) return null;
  const { data, error } = await supabase
    .from("recipe_competitions")
    .select(COMPETITION_COLS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function getCompetitionBySlug(slug) {
  if (typeof slug !== "string" || !slug || slug.length > 120) return null;
  const { data, error } = await supabase
    .from("recipe_competitions")
    .select(COMPETITION_COLS)
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function getActiveRegistration(competitionId, userId) {
  const { data, error } = await supabase
    .from("competition_registrations")
    .select("id, role, status, dish_working_title")
    .eq("competition_id", competitionId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data && data.status === "active" ? data : null;
}

function authorName(recipe) {
  const u = recipe.users;
  return (u && (u.display_name || u.username)) || "Someone";
}

// What judges see: no photo, steps, or notes; those stay on the recipe page
function entryCard(entry, userId) {
  const r = entry.recipes;
  return {
    id: entry.id,
    recipe_id: r.id,
    recipe_slug: r.slug,
    title: r.title,
    description: r.description,
    allergens: r.allergens || [],
    allergens_other: r.allergens_other,
    ingredient_groups: groupsFor(r),
    author: authorName(r),
    user_id: r.user_id,
    is_own: r.user_id === userId,
    missing: missingForEntry(r),
  };
}

function myEntryDoc(entry) {
  const r = entry.recipes;
  return {
    ...entryCard(entry, r.user_id),
    image_url: r.image_url,
    thumb_url: r.image_url && r.thumb_path ? `${r.image_url}&size=thumb` : r.image_url,
    steps: r.steps || [],
    notes: r.notes,
    prep_time: r.prep_time,
    cook_time: r.cook_time,
    servings: r.servings,
  };
}

// Single source for the competition page data (API + server-rendered kit pages).
// Pre-competition entry details only ever reach their author.
async function buildCompetitionPayload(competition, userId) {
  const signedIn = !!(userId && UUID_REGEX.test(userId));
  const state = revealState(competition);

  const [
    { data: categories, error: catErr },
    { data: entries, error: entErr },
    { data: registrations, error: regErr },
  ] = await Promise.all([
    supabase
      .from("competition_categories")
      .select("id, key, label, description, weight, sort_order, levels")
      .eq("competition_id", competition.id)
      .order("sort_order"),
    supabase
      .from("recipe_competition_entries")
      .select(`id, submitted_at, recipes ( ${RECIPE_COLS} )`)
      .eq("competition_id", competition.id)
      .order("submitted_at"),
    supabase
      .from("competition_registrations")
      .select("user_id, role, status, dish_working_title")
      .eq("competition_id", competition.id),
  ]);
  if (catErr) throw catErr;
  if (entErr) throw entErr;
  if (regErr) throw regErr;

  const myReg = signedIn ? (registrations || []).find((r) => r.user_id === userId) || null : null;
  const isActive = !!(myReg && myReg.status === "active");
  const withdrawn = new Set(
    (registrations || []).filter((r) => r.status === "withdrawn").map((r) => r.user_id)
  );
  const canSeeEntries = state === "public" || (state === "judging" && isActive);
  const allEntries = (entries || []).filter((e) => e.recipes);
  const visibleEntries = canSeeEntries
    ? allEntries.filter((e) => !withdrawn.has(e.recipes.user_id))
    : [];
  const mine = signedIn ? allEntries.find((e) => e.recipes.user_id === userId) : null;

  const payload = {
    competition,
    state,
    signedIn,
    categories: categories || [],
    allergens: ALLERGENS,
    entries: visibleEntries.map((e) => entryCard(e, userId)),
    registration: myReg
      ? { role: myReg.role, status: myReg.status, dish_working_title: myReg.dish_working_title }
      : null,
    myEntry: mine ? myEntryDoc(mine) : null,
    myJudgments: {},
    myFavoriteEntryId: null,
    rsvpStatus: null,
  };
  if (!signedIn) return payload;

  const entryIds = visibleEntries.map((e) => e.id);
  if (entryIds.length > 0) {
    const { data: judgments, error: judErr } = await supabase
      .from("competition_judgments")
      .select("id, entry_id, notes, competition_judgment_scores ( category_id, score )")
      .eq("judge_user_id", userId)
      .in("entry_id", entryIds);
    if (judErr) throw judErr;
    const categoryKeyById = Object.fromEntries((categories || []).map((c) => [c.id, c.key]));
    (judgments || []).forEach((j) => {
      const scores = {};
      (j.competition_judgment_scores || []).forEach((s) => {
        const key = categoryKeyById[s.category_id];
        if (key) scores[key] = s.score;
      });
      payload.myJudgments[j.entry_id] = { notes: j.notes, scores };
    });

    const { data: fav, error: favErr } = await supabase
      .from("recipe_competition_favorites")
      .select("entry_id")
      .eq("competition_id", competition.id)
      .eq("judge_user_id", userId)
      .maybeSingle();
    if (favErr) throw favErr;
    payload.myFavoriteEntryId = fav ? fav.entry_id : null;
  }

  if (competition.event_id) {
    const { data: rsvp, error: rsvpErr } = await supabase
      .from("event_rsvps")
      .select("status")
      .eq("event_id", competition.event_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (rsvpErr) throw rsvpErr;
    payload.rsvpStatus = rsvp ? rsvp.status : null;
  }

  return payload;
}

// ── GET /api/competitions/:slug ──────────────────────────────────────────────
router.get("/competitions/:slug", async (req, res) => {
  try {
    const competition = await getCompetitionBySlug(req.params.slug);
    if (!competition) return res.status(404).json({ error: "Competition not found" });
    return res.json(await buildCompetitionPayload(competition, requireSignedUser(req)));
  } catch (err) {
    console.error("GET /competitions/:slug error:", err);
    return res.status(500).json({ error: "Failed to load competition" });
  }
});

// ── POST /api/competitions/:id/register ──────────────────────────────────────
// Register (or re-register after withdrawal) as entrant or judge.
// Also upserts the linked event RSVP to 'going'.
router.post("/competitions/:id/register", async (req, res) => {
  try {
    const userId = requireSignedUser(req);
    if (!userId || !UUID_REGEX.test(userId)) {
      return res.status(401).json({ error: "Sign in required" });
    }
    const competition = await getCompetitionById(req.params.id);
    if (!competition) return res.status(404).json({ error: "Competition not found" });
    if (competition.voting_closed_at) {
      return res.status(400).json({ error: "This competition has ended" });
    }

    const role = req.body && req.body.role;
    if (role !== "entrant" && role !== "judge") {
      return res.status(400).json({ error: "role must be 'entrant' or 'judge'" });
    }
    const dishWorkingTitle = sanitizeText(req.body && req.body.dishWorkingTitle, 120);

    // Display name only applies to auto-provisioned accounts (temp visitor_*
    // username) — established Brispace names are never overwritten here.
    const displayName = sanitizeText(req.body && req.body.displayName, 80);
    if (displayName) {
      const { data: userRow, error: userErr } = await supabase
        .from("users")
        .select("username")
        .eq("id", userId)
        .maybeSingle();
      if (userErr) throw userErr;
      if (userRow && /^visitor_[a-z0-9]+$/i.test(userRow.username || "")) {
        const { error: nameErr } = await supabase
          .from("users")
          .update({ display_name: displayName })
          .eq("id", userId);
        if (nameErr) console.error("display_name update failed during registration:", nameErr);
      }
    }

    const { data: registration, error: regErr } = await supabase
      .from("competition_registrations")
      .upsert(
        [
          {
            competition_id: competition.id,
            user_id: userId,
            role,
            status: "active",
            dish_working_title: dishWorkingTitle,
            updated_at: new Date().toISOString(),
          },
        ],
        { onConflict: "competition_id,user_id" }
      )
      .select()
      .maybeSingle();
    if (regErr) throw regErr;

    if (competition.event_id) {
      const { error: rsvpErr } = await supabase
        .from("event_rsvps")
        .upsert([{ event_id: competition.event_id, user_id: userId, status: "going" }], {
          onConflict: "event_id,user_id",
        });
      if (rsvpErr) console.error("RSVP upsert failed during registration:", rsvpErr);
    }

    return res.json({ registration });
  } catch (err) {
    console.error("POST /competitions/:id/register error:", err);
    return res.status(500).json({ error: "Failed to register" });
  }
});

// ── POST /api/competitions/:id/withdraw ──────────────────────────────────────
// Soft withdraw: entry hidden from judging/leaderboard, data kept.
// RSVP is left unchanged (withdrawing an entry ≠ not attending).
router.post("/competitions/:id/withdraw", async (req, res) => {
  try {
    const userId = requireSignedUser(req);
    if (!userId || !UUID_REGEX.test(userId)) {
      return res.status(401).json({ error: "Sign in required" });
    }
    const competition = await getCompetitionById(req.params.id);
    if (!competition) return res.status(404).json({ error: "Competition not found" });

    const { data: registration, error } = await supabase
      .from("competition_registrations")
      .update({ status: "withdrawn", updated_at: new Date().toISOString() })
      .eq("competition_id", competition.id)
      .eq("user_id", userId)
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!registration) return res.status(404).json({ error: "No registration found" });

    return res.json({ registration });
  } catch (err) {
    console.error("POST /competitions/:id/withdraw error:", err);
    return res.status(500).json({ error: "Failed to withdraw" });
  }
});

// ── POST /api/competitions/:id/entries ───────────────────────────────────────
// Submit an entry. Requires an active 'entrant' registration;
// one entry per person per competition.
router.post("/competitions/:id/entries", async (req, res) => {
  try {
    const userId = requireSignedUser(req);
    if (!userId || !UUID_REGEX.test(userId)) {
      return res.status(401).json({ error: "Sign in required" });
    }
    const competition = await getCompetitionById(req.params.id);
    if (!competition) return res.status(404).json({ error: "Competition not found" });
    if (competition.voting_closed_at) {
      return res.status(400).json({ error: "This competition has ended" });
    }

    const registration = await getActiveRegistration(competition.id, userId);
    if (!registration || registration.role !== "entrant") {
      return res
        .status(403)
        .json({ error: "An active entrant registration is required to submit an entry" });
    }

    const fields = normalizeRecipeBody(req.body, sanitizeText);
    if (!fields.title) return res.status(400).json({ error: "Give your dish a name first" });

    // One entry per person per competition
    const { data: existingEntries, error: existingErr } = await supabase
      .from("recipe_competition_entries")
      .select("id, recipes!inner ( user_id )")
      .eq("competition_id", competition.id)
      .eq("recipes.user_id", userId);
    if (existingErr) throw existingErr;
    if ((existingEntries || []).length > 0) {
      return res.status(409).json({ error: "You already have an entry in this competition" });
    }

    const slugBase = fields.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80);
    const slug = `${slugBase || "entry"}-${Math.random().toString(36).slice(2, 7)}`;

    const { data: recipe, error: recipeErr } = await supabase
      .from("recipes")
      .insert([{ ...fields, user_id: userId, slug }])
      .select("id")
      .maybeSingle();
    if (recipeErr) throw recipeErr;

    const { data: entry, error: entryErr } = await supabase
      .from("recipe_competition_entries")
      .insert([{ competition_id: competition.id, recipe_id: recipe.id }])
      .select(`id, submitted_at, recipes ( ${RECIPE_COLS} )`)
      .maybeSingle();
    if (entryErr) throw entryErr;

    return res.status(201).json({ entry: myEntryDoc(entry) });
  } catch (err) {
    console.error("POST /competitions/:id/entries error:", err);
    return res.status(500).json({ error: "Failed to submit entry" });
  }
});

// The caller's own entry in this competition, or null
async function getOwnEntry(competitionId, entryId, userId) {
  if (!UUID_REGEX.test(entryId || "")) return null;
  const { data, error } = await supabase
    .from("recipe_competition_entries")
    .select(`id, competition_id, submitted_at, recipes ( ${RECIPE_COLS} )`)
    .eq("id", entryId)
    .maybeSingle();
  if (error) throw error;
  if (!data || data.competition_id !== competitionId || !data.recipes) return null;
  return data.recipes.user_id === userId ? data : null;
}

function thumbPathFor(imagePath) {
  return imagePath.replace(/\.(jpg|png|webp)$/, "-thumb.jpg");
}

function removePhotoObjects(recipe) {
  const paths = [recipe.image_path, recipe.thumb_path].filter(Boolean);
  if (!paths.length) return;
  supabase.storage
    .from(PHOTO_BUCKET)
    .remove(paths)
    .then(({ error }) => error && console.warn("Old recipe photo cleanup failed:", error.message));
}

// ── PATCH /api/competitions/:id/entries/:entryId ─────────────────────────────
// Author-only full save of the recipe. Allowed any time, even after the event.
router.patch("/competitions/:id/entries/:entryId", async (req, res) => {
  try {
    const userId = requireSignedUser(req);
    if (!userId || !UUID_REGEX.test(userId)) {
      return res.status(401).json({ error: "Sign in required" });
    }
    const competition = await getCompetitionById(req.params.id);
    if (!competition) return res.status(404).json({ error: "Competition not found" });
    const entry = await getOwnEntry(competition.id, req.params.entryId, userId);
    if (!entry) return res.status(404).json({ error: "Entry not found" });

    const fields = normalizeRecipeBody(req.body, sanitizeText);
    if (!fields.title) return res.status(400).json({ error: "Your dish needs a name" });

    const recipe = entry.recipes;
    const photoPath = req.body && req.body.photoPath;
    let replaced = false;
    if (typeof photoPath === "string" && photoPath !== recipe.image_path) {
      const prefix = `${userId}/${recipe.id}/`;
      if (
        !photoPath.startsWith(prefix) ||
        !/^\d+\.(jpg|png|webp)$/.test(photoPath.slice(prefix.length))
      ) {
        return res.status(400).json({ error: "Invalid photo" });
      }
      fields.image_path = photoPath;
      fields.thumb_path = thumbPathFor(photoPath);
      fields.image_url = `/api/recipe-photos/${recipe.id}?v=${Date.now()}`;
      replaced = true;
    } else if (req.body && req.body.removePhoto === true && recipe.image_path) {
      fields.image_path = null;
      fields.thumb_path = null;
      fields.image_url = null;
      replaced = true;
    }

    const { error: updErr } = await supabase
      .from("recipes")
      .update({ ...fields, updated_at: new Date().toISOString() })
      .eq("id", recipe.id);
    if (updErr) throw updErr;
    if (replaced) removePhotoObjects(recipe);

    const fresh = await getOwnEntry(competition.id, entry.id, userId);
    return res.json({ entry: myEntryDoc(fresh) });
  } catch (err) {
    console.error("PATCH entry error:", err);
    return res.status(500).json({ error: "Failed to save your recipe" });
  }
});

// ── POST /api/competitions/:id/entries/:entryId/photo-upload ─────────────────
// Signed one-time upload URLs (full + thumbnail) into the private bucket. The client
// uploads both, then PATCHes the entry with { photoPath } to attach them.
router.post("/competitions/:id/entries/:entryId/photo-upload", async (req, res) => {
  try {
    const userId = requireSignedUser(req);
    if (!userId || !UUID_REGEX.test(userId)) {
      return res.status(401).json({ error: "Sign in required" });
    }
    const competition = await getCompetitionById(req.params.id);
    if (!competition) return res.status(404).json({ error: "Competition not found" });
    const entry = await getOwnEntry(competition.id, req.params.entryId, userId);
    if (!entry) return res.status(404).json({ error: "Entry not found" });

    const ext = PHOTO_TYPES[req.body && req.body.contentType];
    if (!ext) return res.status(400).json({ error: "Photos must be JPEG, PNG, or WebP" });

    const path = `${userId}/${entry.recipes.id}/${Date.now()}.${ext}`;
    const bucket = supabase.storage.from(PHOTO_BUCKET);
    const [full, thumb] = await Promise.all([
      bucket.createSignedUploadUrl(path),
      bucket.createSignedUploadUrl(thumbPathFor(path)),
    ]);
    if (full.error) throw full.error;
    if (thumb.error) throw thumb.error;
    return res.json({
      path,
      uploads: { full: full.data.signedUrl, thumb: thumb.data.signedUrl },
    });
  } catch (err) {
    console.error("POST photo-upload error:", err);
    return res.status(500).json({ error: "Couldn't start the upload" });
  }
});

// ── GET /api/recipe-photos/:recipeId ─────────────────────────────────────────
// Photo gate: author only until every linked competition is public, then a
// short-lived signed URL. ?size=thumb serves the small copy when one exists.
router.get("/recipe-photos/:recipeId", async (req, res) => {
  try {
    const recipeId = req.params.recipeId;
    if (!UUID_REGEX.test(recipeId || "")) return res.status(404).end();
    const { data: recipe, error } = await supabase
      .from("recipes")
      .select(
        `id, user_id, image_path, thumb_path, recipe_competition_entries ( recipe_competitions ( ${COMPETITION_COLS} ) )`
      )
      .eq("id", recipeId)
      .maybeSingle();
    if (error) throw error;
    if (!recipe || !recipe.image_path) return res.status(404).end();

    const isAuthor = recipe.user_id === requireSignedUser(req);
    const isPublic = (recipe.recipe_competition_entries || []).every(
      (link) => revealState(link.recipe_competitions) === "public"
    );
    if (!isAuthor && !isPublic) return res.status(404).end();

    const objectPath =
      req.query.size === "thumb" && recipe.thumb_path ? recipe.thumb_path : recipe.image_path;
    const { data: signed, error: signErr } = await supabase.storage
      .from(PHOTO_BUCKET)
      .createSignedUrl(objectPath, 300);
    if (signErr) return res.status(404).end();
    res.set("Cache-Control", "private, no-store");
    return res.redirect(302, signed.signedUrl);
  } catch (err) {
    console.error("GET recipe photo error:", err);
    return res.status(500).end();
  }
});

// ── POST /api/competitions/:id/entries/:entryId/judgment ─────────────────────
// Upsert the caller's judgment. Scores must cover the competition's
// category set exactly, each 1-5. Gated on voting_open + active registration.
router.post("/competitions/:id/entries/:entryId/judgment", async (req, res) => {
  try {
    const userId = requireSignedUser(req);
    if (!userId || !UUID_REGEX.test(userId)) {
      return res.status(401).json({ error: "Sign in required" });
    }
    const competition = await getCompetitionById(req.params.id);
    if (!competition) return res.status(404).json({ error: "Competition not found" });
    if (!competition.voting_open) {
      return res.status(400).json({ error: "Judging is not open" });
    }

    const registration = await getActiveRegistration(competition.id, userId);
    if (!registration) {
      return res.status(403).json({ error: "Registration is required to judge" });
    }

    const entryId = req.params.entryId;
    if (!UUID_REGEX.test(entryId || "")) return res.status(400).json({ error: "Invalid entry id" });
    const { data: entry, error: entryErr } = await supabase
      .from("recipe_competition_entries")
      .select("id, competition_id, recipes ( user_id )")
      .eq("id", entryId)
      .maybeSingle();
    if (entryErr) throw entryErr;
    if (!entry || entry.competition_id !== competition.id) {
      return res.status(404).json({ error: "Entry not found in this competition" });
    }
    if (entry.recipes && entry.recipes.user_id === userId) {
      return res.status(403).json({ error: "You cannot judge your own entry" });
    }

    const { data: categories, error: catErr } = await supabase
      .from("competition_categories")
      .select("id, key")
      .eq("competition_id", competition.id);
    if (catErr) throw catErr;
    if (!categories || categories.length === 0) {
      return res.status(400).json({ error: "This competition has no judging categories" });
    }

    const scores = (req.body && req.body.scores) || {};
    const rows = [];
    for (const cat of categories) {
      const value = scores[cat.key];
      if (!Number.isInteger(value) || value < 1 || value > 5) {
        return res.status(400).json({ error: `Score for '${cat.key}' must be an integer 1-5` });
      }
      rows.push({ category_id: cat.id, score: value });
    }
    const extraKeys = Object.keys(scores).filter((k) => !categories.some((c) => c.key === k));
    if (extraKeys.length > 0) {
      return res.status(400).json({ error: `Unknown categories: ${extraKeys.join(", ")}` });
    }

    const notes = sanitizeText(req.body && req.body.notes, 2000);

    const { data: judgment, error: judErr } = await supabase
      .from("competition_judgments")
      .upsert(
        [
          {
            entry_id: entryId,
            judge_user_id: userId,
            notes,
            updated_at: new Date().toISOString(),
          },
        ],
        { onConflict: "entry_id,judge_user_id" }
      )
      .select()
      .maybeSingle();
    if (judErr) {
      // Self-judging trigger surfaces here as a raised exception
      if (String(judErr.message || "").includes("cannot judge")) {
        return res.status(403).json({ error: "You cannot judge your own entry" });
      }
      throw judErr;
    }

    // Replace score rows (category set may have been rescored)
    const { error: delErr } = await supabase
      .from("competition_judgment_scores")
      .delete()
      .eq("judgment_id", judgment.id);
    if (delErr) throw delErr;
    const { error: insErr } = await supabase
      .from("competition_judgment_scores")
      .insert(rows.map((r) => ({ ...r, judgment_id: judgment.id })));
    if (insErr) throw insErr;

    return res.json({ judgment: { ...judgment, scores } });
  } catch (err) {
    console.error("POST judgment error:", err);
    return res.status(500).json({ error: "Failed to save judgment" });
  }
});

// ── POST /api/competitions/:id/favorite ──────────────────────────────────────
router.post("/competitions/:id/favorite", async (req, res) => {
  try {
    const userId = requireSignedUser(req);
    if (!userId || !UUID_REGEX.test(userId)) {
      return res.status(401).json({ error: "Sign in required" });
    }
    const competition = await getCompetitionById(req.params.id);
    if (!competition) return res.status(404).json({ error: "Competition not found" });
    if (!competition.voting_open) return res.status(400).json({ error: "Judging is not open" });
    if (!(competition.favorite_bonus > 0)) {
      return res.status(400).json({ error: "Favorites are off for this competition" });
    }

    const registration = await getActiveRegistration(competition.id, userId);
    if (!registration) return res.status(403).json({ error: "Registration is required" });

    const entryId = req.body && req.body.entryId;
    if (!UUID_REGEX.test(entryId || "")) return res.status(400).json({ error: "Invalid entry id" });
    const { data: entry, error: entryErr } = await supabase
      .from("recipe_competition_entries")
      .select("id, competition_id, recipes ( user_id )")
      .eq("id", entryId)
      .maybeSingle();
    if (entryErr) throw entryErr;
    if (!entry || entry.competition_id !== competition.id) {
      return res.status(404).json({ error: "Entry not found in this competition" });
    }
    if (entry.recipes && entry.recipes.user_id === userId) {
      return res.status(403).json({ error: "You cannot favorite your own entry" });
    }

    const { data: favorite, error: favErr } = await supabase
      .from("recipe_competition_favorites")
      .upsert([{ competition_id: competition.id, judge_user_id: userId, entry_id: entryId }], {
        onConflict: "competition_id,judge_user_id",
      })
      .select()
      .maybeSingle();
    if (favErr) throw favErr;

    return res.json({ favorite });
  } catch (err) {
    console.error("POST favorite error:", err);
    return res.status(500).json({ error: "Failed to save favorite" });
  }
});

// ── DELETE /api/competitions/:id/favorite ────────────────────────────────────
router.delete("/competitions/:id/favorite", async (req, res) => {
  try {
    const userId = requireSignedUser(req);
    if (!userId || !UUID_REGEX.test(userId)) {
      return res.status(401).json({ error: "Sign in required" });
    }
    const { error } = await supabase
      .from("recipe_competition_favorites")
      .delete()
      .eq("competition_id", req.params.id)
      .eq("judge_user_id", userId);
    if (error) throw error;
    return res.json({ ok: true });
  } catch (err) {
    console.error("DELETE favorite error:", err);
    return res.status(500).json({ error: "Failed to remove favorite" });
  }
});

// ── POST /api/competitions/:id/judging (admin) ───────────────────────────────────
// open / pause / close (publishes results) / reopen
const JUDGING_ACTIONS = {
  open: () => ({ voting_open: true, voting_closed_at: null }),
  pause: () => ({ voting_open: false }),
  close: () => ({ voting_open: false, voting_closed_at: new Date().toISOString() }),
  reopen: () => ({ voting_open: true, voting_closed_at: null }),
};

router.post("/competitions/:id/judging", async (req, res) => {
  try {
    const userId = requireSignedUser(req);
    if (!(await isAdminUser(userId))) return res.status(403).json({ error: "Admins only" });
    const competition = await getCompetitionById(req.params.id);
    if (!competition) return res.status(404).json({ error: "Competition not found" });
    const action = JUDGING_ACTIONS[req.body && req.body.action];
    if (!action) return res.status(400).json({ error: "Unknown action" });

    const { data, error } = await supabase
      .from("recipe_competitions")
      .update(action())
      .eq("id", competition.id)
      .select(COMPETITION_COLS)
      .maybeSingle();
    if (error) throw error;
    return res.json({ competition: data, state: revealState(data) });
  } catch (err) {
    console.error("POST judging state error:", err);
    return res.status(500).json({ error: "Failed to update judging" });
  }
});

// ── POST /api/events/:id/rsvp ────────────────────────────────────────────────
// Standalone RSVP (maybes/spectators); registration auto-RSVPs separately.
router.post("/events/:id/rsvp", async (req, res) => {
  try {
    const userId = requireSignedUser(req);
    if (!userId || !UUID_REGEX.test(userId)) {
      return res.status(401).json({ error: "Sign in required" });
    }
    const eventId = req.params.id;
    if (!UUID_REGEX.test(eventId || "")) return res.status(400).json({ error: "Invalid event id" });

    const status = req.body && req.body.status;
    if (!RSVP_STATUSES.has(status)) {
      return res.status(400).json({ error: "Invalid RSVP status" });
    }

    const { data: event, error: eventErr } = await supabase
      .from("events")
      .select("id")
      .eq("id", eventId)
      .maybeSingle();
    if (eventErr) throw eventErr;
    if (!event) return res.status(404).json({ error: "Event not found" });

    const { data: rsvp, error } = await supabase
      .from("event_rsvps")
      .upsert([{ event_id: eventId, user_id: userId, status }], {
        onConflict: "event_id,user_id",
      })
      .select()
      .maybeSingle();
    if (error) throw error;

    return res.json({ rsvp });
  } catch (err) {
    console.error("POST /events/:id/rsvp error:", err);
    return res.status(500).json({ error: "Failed to save RSVP" });
  }
});

router.buildCompetitionPayload = buildCompetitionPayload;
router.getCompetitionBySlug = getCompetitionBySlug;
module.exports = router;
