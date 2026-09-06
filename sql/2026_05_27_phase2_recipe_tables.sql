-- ============================================================
-- Phase 2: Dedicated recipe tables + data migration
--
-- Creates purpose-built recipe tables and transfers all data
-- from the cocktail_* tables. The old cocktail_* tables are
-- intentionally left intact — do NOT drop them until you have
-- verified the app works correctly on the new tables.
--
-- Prerequisites:
--   1. 2026_05_23_phase1_add_recipe_fields.sql applied
--   2. 2026_05_23_phase1_recipe_detail_view.sql applied
--   3. 2026_05_27_add_recipe_categories_table.sql applied
--
-- After running:
--   recipe_detail_view is updated to read from the new tables.
--   The app should work identically — no server changes needed.
--
-- UUID preservation strategy:
--   cocktail_entries.id is reused as BOTH recipes.id AND
--   recipe_competition_entries.id. This lets cocktail_judgments
--   rows migrate with a direct INSERT (entry_id FK still resolves).
-- ============================================================


-- ============================================================
-- STEP 1: recipe_competitions
-- Direct clone of cocktail_competitions.
-- ============================================================
CREATE TABLE IF NOT EXISTS recipe_competitions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT NOT NULL,
  event_date       DATE,
  voting_open      BOOLEAN DEFAULT true,
  voting_closed_at TIMESTAMPTZ,
  created_at       TIMESTAMPTZ DEFAULT now()
);


-- ============================================================
-- STEP 2: recipes
-- Pure recipe content, independent of competitions.
-- category is free TEXT for now; add FK to recipe_categories
-- later once existing rows have been backfilled with slugs.
-- ============================================================
CREATE TABLE IF NOT EXISTS recipes (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID REFERENCES users(id) ON DELETE SET NULL,
  title        TEXT NOT NULL,
  slug         TEXT,
  description  TEXT,
  ingredients  TEXT[] NOT NULL DEFAULT '{}',
  steps        TEXT[] NOT NULL DEFAULT '{}',
  notes        TEXT,
  prep_time    TEXT,
  cook_time    TEXT,
  servings     TEXT,
  difficulty   TEXT,
  image_url    TEXT,
  category     TEXT,
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_recipes_slug
  ON recipes (slug)
  WHERE slug IS NOT NULL;


-- ============================================================
-- STEP 3: recipe_competition_entries
-- Junction: which recipe was entered in which competition.
--
-- id is preserved from cocktail_entries.id so that
-- cocktail_judgments.entry_id still resolves after migration.
-- ============================================================
CREATE TABLE IF NOT EXISTS recipe_competition_entries (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id UUID NOT NULL REFERENCES recipe_competitions(id) ON DELETE CASCADE,
  recipe_id      UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  submitted_at   TIMESTAMPTZ DEFAULT now(),
  UNIQUE (competition_id, recipe_id)
);

CREATE INDEX IF NOT EXISTS idx_rce_competition ON recipe_competition_entries (competition_id);
CREATE INDEX IF NOT EXISTS idx_rce_recipe      ON recipe_competition_entries (recipe_id);


-- ============================================================
-- STEP 4: recipe_competition_judgments
-- Identical rubric to cocktail_judgments.
-- ============================================================
CREATE TABLE IF NOT EXISTS recipe_competition_judgments (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id           UUID NOT NULL REFERENCES recipe_competition_entries(id) ON DELETE CASCADE,
  judge_user_id      UUID REFERENCES users(id) ON DELETE SET NULL,
  taste_score        INTEGER CHECK (taste_score        BETWEEN 1 AND 5),
  presentation_score INTEGER CHECK (presentation_score BETWEEN 1 AND 5),
  workmanship_score  INTEGER CHECK (workmanship_score  BETWEEN 1 AND 5),
  creativity_score   INTEGER CHECK (creativity_score   BETWEEN 1 AND 5),
  notes              TEXT,
  submitted_at       TIMESTAMPTZ DEFAULT now(),
  updated_at         TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rcj_entry ON recipe_competition_judgments (entry_id);
CREATE INDEX IF NOT EXISTS idx_rcj_judge ON recipe_competition_judgments (judge_user_id);


-- ============================================================
-- STEP 5: recipe_competition_favorites
-- ============================================================
CREATE TABLE IF NOT EXISTS recipe_competition_favorites (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id UUID REFERENCES recipe_competitions(id) ON DELETE CASCADE,
  judge_user_id  UUID REFERENCES users(id) ON DELETE CASCADE,
  entry_id       UUID REFERENCES recipe_competition_entries(id) ON DELETE CASCADE,
  created_at     TIMESTAMPTZ DEFAULT now(),
  UNIQUE (competition_id, judge_user_id)
);


-- ============================================================
-- STEP 6: RLS (public read; writes go through service role)
-- ============================================================
ALTER TABLE recipe_competitions           ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipes                       ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipe_competition_entries    ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipe_competition_judgments  ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipe_competition_favorites  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "recipe_competitions_public_read"
  ON recipe_competitions FOR SELECT USING (true);

CREATE POLICY "recipes_public_read"
  ON recipes FOR SELECT USING (true);

CREATE POLICY "recipe_competition_entries_public_read"
  ON recipe_competition_entries FOR SELECT USING (true);

CREATE POLICY "recipe_competition_judgments_public_read"
  ON recipe_competition_judgments FOR SELECT USING (true);

CREATE POLICY "recipe_competition_favorites_public_read"
  ON recipe_competition_favorites FOR SELECT USING (true);


-- ============================================================
-- STEP 7: Migrate data
-- Run in order — parents before children.
-- ============================================================

-- 7a. cocktail_competitions → recipe_competitions
-- Straight copy; IDs preserved.
INSERT INTO recipe_competitions (id, name, event_date, voting_open, voting_closed_at, created_at)
SELECT id, name, event_date, voting_open, voting_closed_at, created_at
FROM cocktail_competitions
ON CONFLICT (id) DO NOTHING;


-- 7b. cocktail_entries → recipes
-- Preserves the UUID from cocktail_entries.id.
-- This same UUID becomes recipe_competition_entries.id in 7c,
-- which is why judgment FKs survive unchanged.
INSERT INTO recipes (
  id, user_id, title, slug, description,
  ingredients, steps, notes,
  prep_time, cook_time, servings, difficulty,
  image_url, category, created_at
)
SELECT
  id,
  user_id,
  entry_name,
  slug,
  description,
  ingredients,
  steps,
  notes,
  prep_time,
  cook_time,
  servings,
  difficulty,
  image_url,
  category,
  submitted_at
FROM cocktail_entries
ON CONFLICT (id) DO NOTHING;


-- 7c. cocktail_entries (competition links) → recipe_competition_entries
-- Only rows that were part of a competition.
-- id = cocktail_entries.id (preserved for judgment FK chain).
-- recipe_id = cocktail_entries.id (same UUID — the recipe is the entry).
INSERT INTO recipe_competition_entries (id, competition_id, recipe_id, submitted_at)
SELECT id, competition_id, id AS recipe_id, submitted_at
FROM cocktail_entries
WHERE competition_id IS NOT NULL
ON CONFLICT (id) DO NOTHING;


-- 7d. cocktail_judgments → recipe_competition_judgments
-- entry_id is unchanged: cocktail_judgments.entry_id referenced
-- cocktail_entries.id, which is now recipe_competition_entries.id.
INSERT INTO recipe_competition_judgments (
  id, entry_id, judge_user_id,
  taste_score, presentation_score, workmanship_score, creativity_score,
  notes, submitted_at, updated_at
)
SELECT
  id,
  entry_id,
  judge_user_id,
  taste_score,
  presentation_score,
  workmanship_score,
  creativity_score,
  notes,
  submitted_at,
  updated_at
FROM cocktail_judgments
ON CONFLICT (id) DO NOTHING;


-- 7e. cocktail_favorites → recipe_competition_favorites
INSERT INTO recipe_competition_favorites (id, competition_id, judge_user_id, entry_id, created_at)
SELECT id, competition_id, judge_user_id, entry_id, created_at
FROM cocktail_favorites
ON CONFLICT (id) DO NOTHING;


-- ============================================================
-- STEP 8: Verify row counts match before updating the view
--
-- Run these SELECT statements to confirm the migration was clean:
--
--   SELECT COUNT(*) FROM recipe_competitions;        -- should match: SELECT COUNT(*) FROM cocktail_competitions;
--   SELECT COUNT(*) FROM recipes;                    -- should match: SELECT COUNT(*) FROM cocktail_entries;
--   SELECT COUNT(*) FROM recipe_competition_entries; -- should match: SELECT COUNT(*) FROM cocktail_entries WHERE competition_id IS NOT NULL;
--   SELECT COUNT(*) FROM recipe_competition_judgments; -- should match: SELECT COUNT(*) FROM cocktail_judgments;
--   SELECT COUNT(*) FROM recipe_competition_favorites; -- should match: SELECT COUNT(*) FROM cocktail_favorites;
-- ============================================================


-- ============================================================
-- STEP 9: Update recipe_detail_view to read from new tables
--
-- The view signature (column names + types) is unchanged so
-- the server requires no code changes after this step.
--
-- If a recipe was entered into multiple competitions, DISTINCT ON
-- ensures it appears only once (using the best avg_score).
-- ============================================================
CREATE OR REPLACE VIEW recipe_detail_view AS
WITH scores AS (
  SELECT
    rce.recipe_id,
    rce.competition_id,
    rce.id                                                     AS entry_id,
    ROUND(
      AVG(
        (
          rcj.taste_score * 11
          + rcj.presentation_score * 3
          + rcj.workmanship_score * 3
          + rcj.creativity_score * 3
        )::numeric / 20
      )::numeric,
      3
    )                                                          AS avg_score,
    COUNT(rcj.id)                                              AS judgments_count
  FROM recipe_competition_entries rce
  JOIN recipe_competition_judgments rcj ON rcj.entry_id = rce.id
  GROUP BY rce.recipe_id, rce.competition_id, rce.id
),
ranked AS (
  SELECT
    r.id,
    r.slug,
    r.title,
    r.description,
    r.ingredients,
    r.steps,
    r.notes,
    r.prep_time,
    r.cook_time,
    r.servings,
    r.difficulty,
    r.image_url,
    r.category,
    r.created_at,
    u.username                              AS author_slug,
    COALESCE(u.display_name, u.username)    AS author,
    s.competition_id,
    rc.name                                 AS competition_name,
    s.avg_score,
    COALESCE(s.judgments_count, 0)          AS judgments_count,
    CASE
      WHEN s.competition_id IS NOT NULL THEN
        RANK() OVER (
          PARTITION BY s.competition_id
          ORDER BY s.avg_score DESC NULLS LAST
        )
      ELSE NULL
    END                                     AS competition_rank
  FROM recipes r
  JOIN users u ON u.id = r.user_id
  LEFT JOIN scores s ON s.recipe_id = r.id
  LEFT JOIN recipe_competitions rc ON rc.id = s.competition_id
)
SELECT DISTINCT ON (id)
  id,
  slug,
  title,
  description,
  ingredients,
  steps,
  notes,
  prep_time,
  cook_time,
  servings,
  difficulty,
  image_url,
  category,
  created_at,
  author_slug,
  author,
  competition_id,
  competition_name,
  avg_score,
  judgments_count,
  competition_rank,
  CASE competition_rank
    WHEN 1 THEN 'gold'
    WHEN 2 THEN 'silver'
    WHEN 3 THEN 'bronze'
    ELSE NULL
  END AS competition_medal
FROM ranked
ORDER BY id, avg_score DESC NULLS LAST;
