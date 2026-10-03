-- ============================================================
-- Competition Platform: per-competition judging categories
--
-- Generalizes judging so each competition defines its own
-- category set (count, labels, weights). Scale is fixed 1-5.
-- Built on Phase 2 recipe tables (recipe_competitions,
-- recipe_competition_entries). Legacy cocktail_* tables and
-- the fixed-column recipe_competition_judgments stay frozen —
-- new competitions use the normalized tables below.
--
-- Prerequisites: 2026_05_27_phase2_recipe_tables.sql applied.
-- Date: 2026-10-01
-- ============================================================


-- ============================================================
-- STEP 1: recipe_competitions — platform columns
--   slug           URL identity (/competitions/:slug)
--   theme          CSS skin key for judging/results pages
--   favorite_bonus points added per favorite in final score
--   event_id       events row used for RSVP/headcount
-- ============================================================
ALTER TABLE recipe_competitions ADD COLUMN IF NOT EXISTS slug TEXT;
ALTER TABLE recipe_competitions ADD COLUMN IF NOT EXISTS theme TEXT;
ALTER TABLE recipe_competitions ADD COLUMN IF NOT EXISTS favorite_bonus INTEGER NOT NULL DEFAULT 3;
ALTER TABLE recipe_competitions ADD COLUMN IF NOT EXISTS event_id UUID REFERENCES events(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_recipe_competitions_slug
  ON recipe_competitions (slug)
  WHERE slug IS NOT NULL;


-- ============================================================
-- STEP 2: competition_categories
-- One row per judging category per competition.
-- A competition with rows here is a "new model" competition;
-- legacy competitions have none and are scored the old way.
-- ============================================================
CREATE TABLE IF NOT EXISTS competition_categories (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id UUID NOT NULL REFERENCES recipe_competitions(id) ON DELETE CASCADE,
  key            TEXT NOT NULL,
  label          TEXT NOT NULL,
  description    TEXT,
  weight         INTEGER NOT NULL CHECK (weight > 0),
  sort_order     INTEGER NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ DEFAULT now(),
  UNIQUE (competition_id, key)
);

CREATE INDEX IF NOT EXISTS idx_cc_competition ON competition_categories (competition_id);


-- ============================================================
-- STEP 3: competition_judgments (header, one per judge+entry)
-- ============================================================
CREATE TABLE IF NOT EXISTS competition_judgments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id      UUID NOT NULL REFERENCES recipe_competition_entries(id) ON DELETE CASCADE,
  judge_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  notes         TEXT,
  submitted_at  TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE (entry_id, judge_user_id)
);

CREATE INDEX IF NOT EXISTS idx_cjg_entry ON competition_judgments (entry_id);
CREATE INDEX IF NOT EXISTS idx_cjg_judge ON competition_judgments (judge_user_id);


-- ============================================================
-- STEP 4: competition_judgment_scores (one per category)
-- ============================================================
CREATE TABLE IF NOT EXISTS competition_judgment_scores (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  judgment_id UUID NOT NULL REFERENCES competition_judgments(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES competition_categories(id) ON DELETE CASCADE,
  score       INTEGER NOT NULL CHECK (score BETWEEN 1 AND 5),
  UNIQUE (judgment_id, category_id)
);

CREATE INDEX IF NOT EXISTS idx_cjs_judgment ON competition_judgment_scores (judgment_id);


-- ============================================================
-- STEP 5: competition_registrations
--   role    'entrant' (brings food, may also judge)
--           'judge'   (taster only, no entry)
--   status  soft withdraw — entry hidden from judging and
--           leaderboard, data kept; re-register restores.
-- Registering also upserts event_rsvps to 'going' (server-side).
-- ============================================================
CREATE TABLE IF NOT EXISTS competition_registrations (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id     UUID NOT NULL REFERENCES recipe_competitions(id) ON DELETE CASCADE,
  user_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role               TEXT NOT NULL CHECK (role IN ('entrant', 'judge')),
  status             TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'withdrawn')),
  dish_working_title TEXT,
  created_at         TIMESTAMPTZ DEFAULT now(),
  updated_at         TIMESTAMPTZ DEFAULT now(),
  UNIQUE (competition_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_cr_competition ON competition_registrations (competition_id);
CREATE INDEX IF NOT EXISTS idx_cr_user        ON competition_registrations (user_id);


-- ============================================================
-- STEP 6: No self-judging (mirrors 2026_03_20_no_self_judging.sql;
-- entry ownership lives on recipes in the Phase 2 model)
-- ============================================================
CREATE OR REPLACE FUNCTION prevent_self_judgment_platform()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM recipe_competition_entries e
    JOIN recipes r ON r.id = e.recipe_id
    WHERE e.id = NEW.entry_id AND r.user_id = NEW.judge_user_id
  ) THEN
    RAISE EXCEPTION 'Users cannot judge their own entry.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_self_judgment_platform ON competition_judgments;
CREATE TRIGGER trg_prevent_self_judgment_platform
  BEFORE INSERT OR UPDATE ON competition_judgments
  FOR EACH ROW EXECUTE FUNCTION prevent_self_judgment_platform();


-- ============================================================
-- STEP 7: RLS (public read; all writes via service role.
-- event_rsvps RLS intentionally left disabled — legacy
-- event-info/user-events pages still write it with the anon key.)
-- ============================================================
ALTER TABLE competition_categories      ENABLE ROW LEVEL SECURITY;
ALTER TABLE competition_judgments       ENABLE ROW LEVEL SECURITY;
ALTER TABLE competition_judgment_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE competition_registrations   ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "competition_categories_public_read" ON competition_categories;
CREATE POLICY "competition_categories_public_read"
  ON competition_categories FOR SELECT USING (true);

DROP POLICY IF EXISTS "competition_judgments_public_read" ON competition_judgments;
CREATE POLICY "competition_judgments_public_read"
  ON competition_judgments FOR SELECT USING (true);

DROP POLICY IF EXISTS "competition_judgment_scores_public_read" ON competition_judgment_scores;
CREATE POLICY "competition_judgment_scores_public_read"
  ON competition_judgment_scores FOR SELECT USING (true);

DROP POLICY IF EXISTS "competition_registrations_public_read" ON competition_registrations;
CREATE POLICY "competition_registrations_public_read"
  ON competition_registrations FOR SELECT USING (true);


-- ============================================================
-- STEP 8: Views
--
-- competition_leaderboard_view
--   Per-judge weighted total = SUM(score x weight); with the
--   seeded 11/3/3/3 weights the 1-5 scale yields 20-100,
--   matching the legacy cocktail math.
--   final_score = AVG(weighted totals) + favorites x favorite_bonus.
--   Scoped to new-model competitions (those with categories).
--   Entries from withdrawn entrants are excluded (soft withdraw).
-- ============================================================
CREATE OR REPLACE VIEW competition_leaderboard_view AS
WITH judge_totals AS (
  SELECT
    j.entry_id,
    j.id AS judgment_id,
    SUM(s.score * c.weight) AS weighted_total
  FROM competition_judgments j
  JOIN competition_judgment_scores s ON s.judgment_id = j.id
  JOIN competition_categories c      ON c.id = s.category_id
  GROUP BY j.entry_id, j.id
),
entry_scores AS (
  SELECT
    entry_id,
    ROUND(AVG(weighted_total)::numeric, 3) AS avg_score,
    COUNT(*)                               AS judgments_count
  FROM judge_totals
  GROUP BY entry_id
),
favs AS (
  SELECT entry_id, COUNT(*) AS favorites_count
  FROM recipe_competition_favorites
  GROUP BY entry_id
),
base AS (
  SELECT
    e.id                                   AS entry_id,
    e.competition_id,
    comp.name                              AS competition_name,
    comp.slug                              AS competition_slug,
    r.id                                   AS recipe_id,
    r.slug                                 AS recipe_slug,
    r.title,
    r.image_url,
    r.user_id,
    u.username,
    COALESCE(u.display_name, u.username)   AS display_name,
    es.avg_score,
    COALESCE(es.judgments_count, 0)        AS judgments_count,
    COALESCE(f.favorites_count, 0)         AS favorites_count,
    CASE
      WHEN es.avg_score IS NULL THEN NULL
      ELSE es.avg_score + COALESCE(f.favorites_count, 0) * comp.favorite_bonus
    END                                    AS final_score,
    e.submitted_at
  FROM recipe_competition_entries e
  JOIN recipe_competitions comp ON comp.id = e.competition_id
  JOIN recipes r                ON r.id = e.recipe_id
  LEFT JOIN users u             ON u.id = r.user_id
  LEFT JOIN entry_scores es     ON es.entry_id = e.id
  LEFT JOIN favs f              ON f.entry_id = e.id
  WHERE EXISTS (
    SELECT 1 FROM competition_categories cc
    WHERE cc.competition_id = e.competition_id
  )
  AND NOT EXISTS (
    SELECT 1 FROM competition_registrations reg
    WHERE reg.competition_id = e.competition_id
      AND reg.user_id = r.user_id
      AND reg.status = 'withdrawn'
  )
)
SELECT
  base.*,
  RANK() OVER (
    PARTITION BY competition_id
    ORDER BY final_score DESC NULLS LAST
  ) AS competition_rank,
  CASE RANK() OVER (
    PARTITION BY competition_id
    ORDER BY final_score DESC NULLS LAST
  )
    WHEN 1 THEN 'gold'
    WHEN 2 THEN 'silver'
    WHEN 3 THEN 'bronze'
    ELSE NULL
  END AS competition_medal
FROM base;

COMMENT ON VIEW competition_leaderboard_view IS
  'Weighted leaderboard for new-model competitions (those with competition_categories rows). final_score = avg per-judge SUM(score x weight) + favorites x favorite_bonus. Withdrawn entrants excluded.';


-- competition_category_averages_view
--   Per-entry per-category average for results pages
--   (category count varies, so this stays long-form).
CREATE OR REPLACE VIEW competition_category_averages_view AS
SELECT
  j.entry_id,
  c.competition_id,
  c.id                                   AS category_id,
  c.key                                  AS category_key,
  c.label                                AS category_label,
  c.weight,
  c.sort_order,
  ROUND(AVG(s.score)::numeric, 3)        AS avg_score,
  COUNT(s.id)                            AS scores_count
FROM competition_judgment_scores s
JOIN competition_judgments j  ON j.id = s.judgment_id
JOIN competition_categories c ON c.id = s.category_id
GROUP BY j.entry_id, c.competition_id, c.id, c.key, c.label, c.weight, c.sort_order;


-- ============================================================
-- Verify after applying:
--
-- SELECT slug, theme, favorite_bonus FROM recipe_competitions;
-- SELECT * FROM competition_categories ORDER BY competition_id, sort_order;
-- SELECT * FROM competition_leaderboard_view;
-- ============================================================
