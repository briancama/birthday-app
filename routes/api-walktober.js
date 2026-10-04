const express = require("express");
const router = express.Router();
const { getSupabase, requireSignedUser, isAdminUser } = require("../js/utils/server-utils");
const { createAndDeliverNotification } = require("../js/utils/notification-delivery");

const supabase = getSupabase();
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const MAX_STEPS = 200000;
const MAX_GOAL = 1000000;
const MEDALS = ["gold", "silver", "bronze"];
const TOP_LIST_LIMIT = 4;
const DAY_MS = 24 * 60 * 60 * 1000;
const SEASON_COLUMNS = "year, starts_on, ends_on, edit_until, min_goal, closed_at";

function utcToday() {
  return new Date().toISOString().slice(0, 10);
}

// Latest calendar date anywhere on Earth (UTC+14), so every timezone can log its own "today"
function latestPossibleToday() {
  return new Date(Date.now() + 14 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function parseYear(raw) {
  const year = Number(raw);
  return Number.isInteger(year) && year >= 2000 && year <= 2999 ? year : null;
}

function isRealDate(value) {
  if (!DATE_REGEX.test(value || "")) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function getSignedUserId(req) {
  const id = requireSignedUser(req);
  return id && UUID_REGEX.test(id) ? id : null;
}

async function getSeason(year) {
  const { data, error } = await supabase
    .from("walktober_seasons")
    .select(SEASON_COLUMNS)
    .eq("year", year)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function getLatestSeason() {
  const { data, error } = await supabase
    .from("walktober_seasons")
    .select(SEASON_COLUMNS)
    .order("year", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

function describeSeason(season) {
  const today = utcToday();
  const daysInSeason =
    Math.round((Date.parse(season.ends_on) - Date.parse(season.starts_on)) / DAY_MS) + 1;
  return {
    ...season,
    days_in_season: daysInSeason,
    has_started: latestPossibleToday() >= season.starts_on,
    has_ended: today > season.ends_on,
    is_closed: !!season.closed_at,
    is_editable: !season.closed_at && today <= season.edit_until,
  };
}

function toWalker(row) {
  return {
    user_id: row.user_id,
    username: row.username,
    display_name: row.display_name,
    headshot: row.headshot,
    is_published: !!row.is_published,
    daily_goal: row.daily_goal,
    total_steps: row.total_steps,
    days_logged: row.days_logged,
    days_hit_goal: row.days_hit_goal,
    goal_progress_pct: Number(row.goal_progress_pct) || 0,
  };
}

// Dense rank on total steps: everyone tied at a distinct total shares that place.
function rankByTotal(rows) {
  const sorted = rows
    .filter((r) => r.total_steps > 0)
    .sort((a, b) => b.total_steps - a.total_steps);
  const distinctTotals = [...new Set(sorted.map((r) => r.total_steps))];
  return sorted.map((r) => ({ ...r, place: distinctTotals.indexOf(r.total_steps) + 1 }));
}

function earnedGoalAverage(row) {
  return row.total_steps >= row.daily_goal * row.days_in_season;
}

function goalPct(row) {
  return Number(row.goal_progress_pct) || 0;
}

function densePlace(rows, valueOf, target) {
  const distinct = [...new Set(rows.map(valueOf))].sort((a, b) => b - a);
  return distinct.indexOf(valueOf(target)) + 1;
}

function mean(rows, valueOf) {
  return rows.length ? rows.reduce((sum, r) => sum + valueOf(r), 0) / rows.length : 0;
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

// Averages cover walkers who've logged at least one day, so sign-ups who never log don't drag them down.
function crewAverages(totals) {
  const active = totals.filter((r) => r.days_logged > 0);
  return {
    active_walkers: active.length,
    days_logged: round1(mean(active, (r) => r.days_logged)),
    days_hit_goal: round1(mean(active, (r) => r.days_hit_goal)),
    daily_average: Math.round(mean(active, (r) => r.total_steps / r.days_logged)),
    daily_goal: Math.round(mean(totals, (r) => r.daily_goal)),
  };
}

async function getTotals(year) {
  const { data, error } = await supabase.from("walktober_totals").select("*").eq("year", year);
  if (error) throw error;
  return data || [];
}

async function getDailyLeaders(year) {
  const { data, error } = await supabase
    .from("walktober_daily_leaders")
    .select("step_date, user_id, steps")
    .eq("year", year)
    .order("step_date");
  if (error) throw error;
  return data || [];
}

// One entry per day; tied walkers share the day.
function groupDailyLeaders(leaderRows, totals) {
  const totalsById = new Map(totals.map((r) => [r.user_id, r]));
  const byDate = new Map();
  leaderRows.forEach((row) => {
    const walker = totalsById.get(row.user_id);
    if (!walker) return;
    if (!byDate.has(row.step_date)) {
      byDate.set(row.step_date, { date: row.step_date, steps: row.steps, walkers: [] });
    }
    byDate.get(row.step_date).walkers.push(toWalker(walker));
  });
  return [...byDate.values()];
}

function goalBoard(totals) {
  return totals
    .map((r) => ({ ...toWalker(r), place: densePlace(totals, goalPct, r) }))
    .sort((a, b) => b.goal_progress_pct - a.goal_progress_pct || b.total_steps - a.total_steps);
}

function displayName(row) {
  return (row.display_name || row.username || "").toLowerCase();
}

async function countEntries(year, userId) {
  const { count, error } = await supabase
    .from("walktober_entries")
    .select("id", { count: "exact", head: true })
    .eq("year", year)
    .eq("user_id", userId);
  if (error) throw error;
  return count || 0;
}

// Shared guard for entry writes: returns { season } or sends an error response.
async function loadEditableDay(req, res) {
  const userId = getSignedUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Sign in to log steps." });
    return null;
  }
  const year = parseYear(req.params.year);
  if (!year) {
    res.status(400).json({ error: "Invalid year" });
    return null;
  }
  const season = await getSeason(year);
  if (!season) {
    res.status(404).json({ error: "Walktober season not found" });
    return null;
  }
  const date = req.params.date;
  if (!isRealDate(date) || date < season.starts_on || date > season.ends_on) {
    res.status(400).json({ error: "That day isn't part of Walktober." });
    return null;
  }
  if (date > latestPossibleToday()) {
    res.status(400).json({ error: "You can't log steps for a future day." });
    return null;
  }
  if (!describeSeason(season).is_editable) {
    res.status(409).json({ error: "Walktober is closed for edits." });
    return null;
  }
  const { data: participant, error } = await supabase
    .from("walktober_participants")
    .select("daily_goal")
    .eq("year", year)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!participant) {
    res.status(409).json({ error: "Set your daily goal first." });
    return null;
  }
  return { userId, year, date };
}

// Season + community stats for everyone; the caller's goal and entries when signed in.
async function buildSeasonPayload(season, userId) {
  const year = season.year;
  const [totals, leaderRows, entriesResult, isAdmin] = await Promise.all([
    getTotals(year),
    getDailyLeaders(year),
    userId
      ? supabase
          .from("walktober_entries")
          .select("step_date, steps")
          .eq("year", year)
          .eq("user_id", userId)
          .order("step_date")
      : Promise.resolve({ data: [], error: null }),
    userId ? isAdminUser(userId) : Promise.resolve(false),
  ]);
  if (entriesResult.error) throw entriesResult.error;

  const ranked = rankByTotal(totals);
  const mine = userId ? totals.find((r) => r.user_id === userId) : null;
  const myRanked = mine ? ranked.find((r) => r.user_id === mine.user_id) : null;
  const crewTotal = totals.reduce((sum, r) => sum + (r.total_steps || 0), 0);

  const payload = {
    season: describeSeason(season),
    today: utcToday(),
    community: {
      crew_total_steps: crewTotal,
      walker_count: totals.length,
      averages: crewAverages(totals),
      walkers: goalBoard(totals),
      top_totals: ranked
        .filter((r) => r.place <= TOP_LIST_LIMIT)
        .map((r) => ({ ...toWalker(r), place: r.place })),
      daily_leaders: groupDailyLeaders(leaderRows, totals),
    },
    me: userId
      ? {
          user_id: userId,
          daily_goal: mine ? mine.daily_goal : null,
          entries: entriesResult.data || [],
          goal_locked: (entriesResult.data || []).length > 0,
          standing: mine
            ? {
                total_steps: mine.total_steps,
                steps_place: myRanked ? myRanked.place : null,
                steps_ranked: ranked.length,
                goal_progress_pct: goalPct(mine),
                goal_place: densePlace(totals, goalPct, mine),
                walker_count: totals.length,
                share_pct: crewTotal ? round1((mine.total_steps / crewTotal) * 100) : 0,
                days_on_top: leaderRows.filter((r) => r.user_id === userId).length,
              }
            : null,
        }
      : null,
    isAdmin,
  };

  if (isAdmin) {
    payload.closePreview = {
      medalists: ranked
        .filter((r) => r.place <= MEDALS.length)
        .map((r) => ({ username: r.username, place: r.place, total_steps: r.total_steps })),
      goal_average: totals
        .filter(earnedGoalAverage)
        .map((r) => ({ username: r.username, total_steps: r.total_steps })),
    };
  }

  return payload;
}

// Full boards for everyone who joined, including walkers who haven't logged yet.
async function buildLeaderboardPayload(season, userId) {
  const totals = await getTotals(season.year);
  const ranked = rankByTotal(totals).map((r) => ({ ...toWalker(r), place: r.place }));
  const unlogged = totals
    .filter((r) => !(r.total_steps > 0))
    .sort((a, b) => displayName(a).localeCompare(displayName(b)))
    .map((r) => ({ ...toWalker(r), place: null }));

  return {
    season: describeSeason(season),
    me_id: userId,
    crew_total_steps: totals.reduce((sum, r) => sum + (r.total_steps || 0), 0),
    walker_count: totals.length,
    steps: [...ranked, ...unlogged],
    goal: goalBoard(totals),
  };
}

// ── GET /api/walktober/:year ─────────────────────────────────────────────────
router.get("/walktober/:year", async (req, res) => {
  try {
    const year = parseYear(req.params.year);
    if (!year) return res.status(400).json({ error: "Invalid year" });
    const season = await getSeason(year);
    if (!season) return res.status(404).json({ error: "Walktober season not found" });
    return res.json(await buildSeasonPayload(season, getSignedUserId(req)));
  } catch (err) {
    console.error("GET /api/walktober/:year error:", err);
    return res.status(500).json({ error: "Failed to load Walktober" });
  }
});

// ── GET /api/walktober/:year/leaderboard ─────────────────────────────────────
router.get("/walktober/:year/leaderboard", async (req, res) => {
  try {
    const year = parseYear(req.params.year);
    if (!year) return res.status(400).json({ error: "Invalid year" });
    const season = await getSeason(year);
    if (!season) return res.status(404).json({ error: "Walktober season not found" });
    return res.json(await buildLeaderboardPayload(season, getSignedUserId(req)));
  } catch (err) {
    console.error("GET /api/walktober/:year/leaderboard error:", err);
    return res.status(500).json({ error: "Failed to load the Walktober leaderboard" });
  }
});

// ── PUT /api/walktober/:year/goal ────────────────────────────────────────────
// Setting a goal joins the season. Locked once the caller has any entry.
router.put("/walktober/:year/goal", async (req, res) => {
  try {
    const userId = getSignedUserId(req);
    if (!userId) return res.status(401).json({ error: "Sign in to join Walktober." });
    const year = parseYear(req.params.year);
    if (!year) return res.status(400).json({ error: "Invalid year" });
    const season = await getSeason(year);
    if (!season) return res.status(404).json({ error: "Walktober season not found" });
    if (!describeSeason(season).is_editable) {
      return res.status(409).json({ error: "Walktober is closed." });
    }

    const goal = Number(req.body && req.body.daily_goal);
    if (!Number.isInteger(goal) || goal < season.min_goal || goal > MAX_GOAL) {
      return res
        .status(400)
        .json({ error: `Pick a whole number of at least ${season.min_goal.toLocaleString()}.` });
    }

    if ((await countEntries(year, userId)) > 0) {
      return res.status(409).json({ error: "Your goal is locked once you've logged steps." });
    }

    const { data, error } = await supabase
      .from("walktober_participants")
      .upsert(
        { year, user_id: userId, daily_goal: goal, updated_at: new Date().toISOString() },
        { onConflict: "year,user_id" }
      )
      .select("year, daily_goal")
      .single();
    if (error) throw error;
    return res.json({ participant: data });
  } catch (err) {
    console.error("PUT /api/walktober/:year/goal error:", err);
    return res.status(500).json({ error: "Failed to save goal" });
  }
});

// ── PUT /api/walktober/:year/entries/:date ───────────────────────────────────
router.put("/walktober/:year/entries/:date", async (req, res) => {
  try {
    const ctx = await loadEditableDay(req, res);
    if (!ctx) return;

    const steps = Number(req.body && req.body.steps);
    if (!Number.isInteger(steps) || steps < 0 || steps > MAX_STEPS) {
      return res
        .status(400)
        .json({ error: `Steps must be a whole number from 0 to ${MAX_STEPS.toLocaleString()}.` });
    }

    const { data, error } = await supabase
      .from("walktober_entries")
      .upsert(
        {
          year: ctx.year,
          user_id: ctx.userId,
          step_date: ctx.date,
          steps,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,step_date" }
      )
      .select("step_date, steps")
      .single();
    if (error) throw error;
    return res.json({ entry: data });
  } catch (err) {
    console.error("PUT /api/walktober/:year/entries/:date error:", err);
    return res.status(500).json({ error: "Failed to save steps" });
  }
});

// ── DELETE /api/walktober/:year/entries/:date ────────────────────────────────
// Clears a day back to unlogged.
router.delete("/walktober/:year/entries/:date", async (req, res) => {
  try {
    const ctx = await loadEditableDay(req, res);
    if (!ctx) return;

    const { error } = await supabase
      .from("walktober_entries")
      .delete()
      .eq("year", ctx.year)
      .eq("user_id", ctx.userId)
      .eq("step_date", ctx.date);
    if (error) throw error;
    return res.json({ cleared: ctx.date });
  } catch (err) {
    console.error("DELETE /api/walktober/:year/entries/:date error:", err);
    return res.status(500).json({ error: "Failed to clear day" });
  }
});

// ── POST /api/walktober/:year/close ──────────────────────────────────────────
// Admin only. Awards medals + goal-average achievements and locks edits.
// Safe to re-run: the award RPC is idempotent and only new awards notify.
router.post("/walktober/:year/close", async (req, res) => {
  try {
    const userId = getSignedUserId(req);
    if (!userId) return res.status(401).json({ error: "Not authenticated" });
    if (!(await isAdminUser(userId))) return res.status(403).json({ error: "Admins only" });

    const year = parseYear(req.params.year);
    if (!year) return res.status(400).json({ error: "Invalid year" });
    const season = await getSeason(year);
    if (!season) return res.status(404).json({ error: "Walktober season not found" });
    if (!describeSeason(season).has_ended) {
      return res.status(409).json({ error: "Walktober isn't over yet." });
    }

    const keys = [...MEDALS, "goal_average"].map((suffix) => `walktober_${year}_${suffix}`);
    const { data: achievements, error: achErr } = await supabase
      .from("achievements")
      .select("key, name, points")
      .in("key", keys);
    if (achErr) throw achErr;
    const achByKey = new Map((achievements || []).map((a) => [a.key, a]));
    const missing = keys.filter((k) => !achByKey.has(k));
    if (missing.length) {
      return res.status(500).json({ error: `Missing achievement rows: ${missing.join(", ")}` });
    }

    const totals = await getTotals(year);
    const awards = [];
    rankByTotal(totals)
      .filter((r) => r.place <= MEDALS.length)
      .forEach((r) => {
        awards.push({
          row: r,
          key: `walktober_${year}_${MEDALS[r.place - 1]}`,
          details: { year, place: r.place, total_steps: r.total_steps },
        });
      });
    totals.filter(earnedGoalAverage).forEach((r) => {
      awards.push({
        row: r,
        key: `walktober_${year}_goal_average`,
        details: { year, total_steps: r.total_steps, daily_goal: r.daily_goal },
      });
    });

    const results = [];
    for (const award of awards) {
      const { data: rpcData, error: rpcErr } = await supabase.rpc("rpc_award_achievement_by_key", {
        p_user_id: award.row.user_id,
        p_key: award.key,
        p_details: award.details,
      });
      if (rpcErr) throw rpcErr;
      const rpcRow = Array.isArray(rpcData) ? rpcData[0] : rpcData;
      const newlyAwarded = !!(rpcRow && rpcRow.awarded);
      const ach = achByKey.get(award.key);

      if (newlyAwarded) {
        try {
          await createAndDeliverNotification({
            userId: award.row.user_id,
            type: "walktober_award",
            title: `Walktober ${year}`,
            body: `You earned "${ach.name}" (+${ach.points} pts).`,
            url: "/walktober",
            data: { action_label: "See results", achievement_key: award.key },
          });
        } catch (notifyErr) {
          console.warn("Walktober award notification failed:", notifyErr.message || notifyErr);
        }
      }

      results.push({ username: award.row.username, key: award.key, newlyAwarded });
    }

    if (!season.closed_at) {
      const { error: closeErr } = await supabase
        .from("walktober_seasons")
        .update({ closed_at: new Date().toISOString(), closed_by: userId })
        .eq("year", year);
      if (closeErr) throw closeErr;
    }

    return res.json({ closed: true, awards: results });
  } catch (err) {
    console.error("POST /api/walktober/:year/close error:", err);
    return res.status(500).json({ error: "Failed to close Walktober" });
  }
});

module.exports = router;
module.exports.getLatestSeason = getLatestSeason;
module.exports.getSignedUserId = getSignedUserId;
module.exports.buildSeasonPayload = buildSeasonPayload;
module.exports.buildLeaderboardPayload = buildLeaderboardPayload;
