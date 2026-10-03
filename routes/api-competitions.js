const express = require("express");
const router = express.Router();
const { getSupabase, requireSignedUser, createSanitizer } = require("../js/utils/server-utils");

const supabase = getSupabase();
const DOMPurify = createSanitizer();
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RSVP_STATUSES = new Set(["going", "maybe", "not_going", "interested"]);

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
    .select(
      "id, name, slug, theme, event_date, voting_open, voting_closed_at, favorite_bonus, event_id"
    )
    .eq("id", id)
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

// ── GET /api/competitions/:slug ──────────────────────────────────────────────
// Competition + categories + judgeable entries, plus the caller's
// registration, judgments, favorite, and RSVP when signed in.
router.get("/competitions/:slug", async (req, res) => {
  try {
    const { data: competition, error: compErr } = await supabase
      .from("recipe_competitions")
      .select(
        "id, name, slug, theme, event_date, voting_open, voting_closed_at, favorite_bonus, event_id"
      )
      .eq("slug", req.params.slug)
      .maybeSingle();
    if (compErr) throw compErr;
    if (!competition) return res.status(404).json({ error: "Competition not found" });

    const [
      { data: categories, error: catErr },
      { data: entries, error: entErr },
      { data: registrations, error: regErr },
    ] = await Promise.all([
      supabase
        .from("competition_categories")
        .select("id, key, label, description, weight, sort_order")
        .eq("competition_id", competition.id)
        .order("sort_order"),
      supabase
        .from("recipe_competition_entries")
        .select("id, submitted_at, recipes ( id, user_id, title, slug, description, image_url )")
        .eq("competition_id", competition.id),
      supabase
        .from("competition_registrations")
        .select("user_id, role, status")
        .eq("competition_id", competition.id),
    ]);
    if (catErr) throw catErr;
    if (entErr) throw entErr;
    if (regErr) throw regErr;

    const withdrawn = new Set(
      (registrations || []).filter((r) => r.status === "withdrawn").map((r) => r.user_id)
    );
    const userId = requireSignedUser(req);
    // Entries stay secret before competition day unless judging was opened early
    const today = new Date().toISOString().slice(0, 10);
    const revealed = competition.voting_open || !competition.event_date || competition.event_date <= today;
    const visibleEntries = (entries || []).filter(
      (e) =>
        e.recipes &&
        !withdrawn.has(e.recipes.user_id) &&
        (revealed || e.recipes.user_id === userId)
    );

    const payload = {
      competition,
      categories: categories || [],
      entries: visibleEntries,
      registration: null,
      myJudgments: {},
      myFavoriteEntryId: null,
      rsvpStatus: null,
    };

    if (userId && UUID_REGEX.test(userId)) {
      const myReg = (registrations || []).find((r) => r.user_id === userId) || null;
      payload.registration = myReg;

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
      }

      const { data: fav, error: favErr } = await supabase
        .from("recipe_competition_favorites")
        .select("entry_id")
        .eq("competition_id", competition.id)
        .eq("judge_user_id", userId)
        .maybeSingle();
      if (favErr) throw favErr;
      payload.myFavoriteEntryId = fav ? fav.entry_id : null;

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
    }

    return res.json(payload);
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

    const title = sanitizeText(req.body && req.body.title, 200);
    if (!title) return res.status(400).json({ error: "title is required" });
    const description = sanitizeText(req.body && req.body.description, 2000);
    const ingredients = Array.isArray(req.body && req.body.ingredients)
      ? req.body.ingredients.map((i) => sanitizeText(i, 300)).filter(Boolean)
      : [];
    const steps = Array.isArray(req.body && req.body.steps)
      ? req.body.steps.map((s) => sanitizeText(s, 1000)).filter(Boolean)
      : [];

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

    const slugBase = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80);
    const slug = `${slugBase}-${Math.random().toString(36).slice(2, 7)}`;

    const { data: recipe, error: recipeErr } = await supabase
      .from("recipes")
      .insert([
        {
          user_id: userId,
          title,
          slug,
          description,
          ingredients,
          steps,
          category: sanitizeText(req.body && req.body.category, 50),
        },
      ])
      .select()
      .maybeSingle();
    if (recipeErr) throw recipeErr;

    const { data: entry, error: entryErr } = await supabase
      .from("recipe_competition_entries")
      .insert([{ competition_id: competition.id, recipe_id: recipe.id }])
      .select()
      .maybeSingle();
    if (entryErr) throw entryErr;

    return res.status(201).json({ entry, recipe });
  } catch (err) {
    console.error("POST /competitions/:id/entries error:", err);
    return res.status(500).json({ error: "Failed to submit entry" });
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

module.exports = router;
