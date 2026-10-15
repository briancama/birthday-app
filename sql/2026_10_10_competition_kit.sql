-- ============================================================
-- Competition Kit: structured recipe writing, rubric levels,
-- private recipe photos, and pre-competition privacy.
--
-- Reveal states (mirrored in js/utils/competition-kit.js):
--   public   voting_closed_at set, OR no event_date, OR the
--            event_date has passed everywhere (UTC-12 date)
--   judging  voting_open (dish cards visible to registrants
--            through the server only)
--   hidden   everything else (author only, via the server)
-- Anon/authenticated keys only ever see public recipes.
--
-- Prerequisites: 2026_10_01_competition_platform.sql,
--                2026_10_01_recipe_detail_view_union.sql
-- Date: 2026-10-10
-- ============================================================


-- ============================================================
-- STEP 1: recipes — structured ingredients, allergens, photo
--   ingredient_groups  [{ "title": "For the batter",
--                         "items": [{ "qty", "unit", "item", "note" }] }]
--                      ingredients[] stays filled (flattened) for
--                      search and older readers.
--   allergens          catalog keys ('none' = explicitly none)
--   image_path         object path in the private recipe-photos
--                      bucket; image_url points at the gate route
--   thumb_path         240px copy for list thumbnails (?size=thumb)
-- ============================================================
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS ingredient_groups JSONB;
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS allergens TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS allergens_other TEXT;
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS image_path TEXT;
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS thumb_path TEXT;

ALTER TABLE recipes DROP CONSTRAINT IF EXISTS recipes_ingredient_groups_array;
ALTER TABLE recipes ADD CONSTRAINT recipes_ingredient_groups_array
  CHECK (ingredient_groups IS NULL OR jsonb_typeof(ingredient_groups) = 'array');


-- ============================================================
-- STEP 2: competition_categories.levels — rubric descriptors
--   [{ "score": 5, "label": "Perfect", "description": "..." }]
--   NULL = no descriptors for this category.
-- ============================================================
ALTER TABLE competition_categories ADD COLUMN IF NOT EXISTS levels JSONB;

ALTER TABLE competition_categories DROP CONSTRAINT IF EXISTS competition_categories_levels_array;
ALTER TABLE competition_categories ADD CONSTRAINT competition_categories_levels_array
  CHECK (levels IS NULL OR jsonb_typeof(levels) = 'array');


-- ============================================================
-- STEP 3: reveal helpers (SECURITY DEFINER so RLS policies can
-- look across tables without anon seeing them)
-- ============================================================
CREATE OR REPLACE FUNCTION recipe_competition_is_public(p_competition_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((
    SELECT c.voting_closed_at IS NOT NULL
        OR c.event_date IS NULL
        OR c.event_date < (now() AT TIME ZONE 'Etc/GMT+12')::date
    FROM recipe_competitions c
    WHERE c.id = p_competition_id
  ), true);
$$;

CREATE OR REPLACE FUNCTION recipe_is_public(p_recipe_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT NOT EXISTS (
    SELECT 1
    FROM recipe_competition_entries e
    WHERE e.recipe_id = p_recipe_id
      AND NOT recipe_competition_is_public(e.competition_id)
  );
$$;

REVOKE ALL ON FUNCTION recipe_competition_is_public(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION recipe_is_public(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION recipe_competition_is_public(UUID) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION recipe_is_public(UUID) TO anon, authenticated, service_role;


-- ============================================================
-- STEP 4: RLS — public keys never see pre-competition entries.
-- All app reads go through the server (service role bypasses RLS).
-- ============================================================
DROP POLICY IF EXISTS "recipes_public_read" ON recipes;
CREATE POLICY "recipes_public_read"
  ON recipes FOR SELECT USING (recipe_is_public(id));

DROP POLICY IF EXISTS "recipe_competition_entries_public_read" ON recipe_competition_entries;
CREATE POLICY "recipe_competition_entries_public_read"
  ON recipe_competition_entries FOR SELECT USING (recipe_competition_is_public(competition_id));

-- dish_working_title is a pre-competition detail; server-only now
DROP POLICY IF EXISTS "competition_registrations_public_read" ON competition_registrations;


-- ============================================================
-- STEP 5: recipe_detail_view — expose the new columns.
-- Same body as 2026_10_01_recipe_detail_view_union.sql with
-- ingredient_groups / allergens / allergens_other appended last
-- (CREATE OR REPLACE only allows new columns at the end).
-- ============================================================
CREATE OR REPLACE VIEW recipe_detail_view AS
WITH legacy_scores AS (
  SELECT
    rce.recipe_id,
    rce.competition_id,
    rce.id AS entry_id,
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
    )             AS avg_score,
    COUNT(rcj.id) AS judgments_count
  FROM recipe_competition_entries rce
  JOIN recipe_competition_judgments rcj ON rcj.entry_id = rce.id
  GROUP BY rce.recipe_id, rce.competition_id, rce.id
),
new_judge_totals AS (
  SELECT
    rce.recipe_id,
    rce.competition_id,
    rce.id AS entry_id,
    j.id   AS judgment_id,
    SUM(s.score * c.weight)::numeric / NULLIF(SUM(c.weight), 0) AS judge_avg
  FROM recipe_competition_entries rce
  JOIN competition_judgments j        ON j.entry_id = rce.id
  JOIN competition_judgment_scores s  ON s.judgment_id = j.id
  JOIN competition_categories c       ON c.id = s.category_id
  GROUP BY rce.recipe_id, rce.competition_id, rce.id, j.id
),
new_scores AS (
  SELECT
    recipe_id,
    competition_id,
    entry_id,
    ROUND(AVG(judge_avg)::numeric, 3) AS avg_score,
    COUNT(*)                          AS judgments_count
  FROM new_judge_totals
  GROUP BY recipe_id, competition_id, entry_id
),
combined_scores AS (
  SELECT recipe_id, competition_id, entry_id, avg_score, judgments_count FROM legacy_scores
  UNION ALL
  SELECT recipe_id, competition_id, entry_id, avg_score, judgments_count FROM new_scores
),
entry_links AS (
  SELECT
    rce.recipe_id,
    rce.competition_id,
    rce.id AS entry_id,
    cs.avg_score,
    COALESCE(cs.judgments_count, 0) AS judgments_count
  FROM recipe_competition_entries rce
  LEFT JOIN combined_scores cs ON cs.entry_id = rce.id
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
    el.competition_id,
    rc.name                                 AS competition_name,
    el.avg_score,
    COALESCE(el.judgments_count, 0)         AS judgments_count,
    EXISTS (
      SELECT 1 FROM competition_categories cc
      WHERE cc.competition_id = el.competition_id
    )                                       AS is_new_model,
    clv.competition_rank                    AS official_rank,
    clv.competition_medal                   AS official_medal,
    CASE
      WHEN el.competition_id IS NOT NULL THEN
        RANK() OVER (
          PARTITION BY el.competition_id
          ORDER BY el.avg_score DESC NULLS LAST
        )
      ELSE NULL
    END                                     AS legacy_rank,
    r.ingredient_groups,
    r.allergens,
    r.allergens_other
  FROM recipes r
  JOIN users u ON u.id = r.user_id
  LEFT JOIN entry_links el ON el.recipe_id = r.id
  LEFT JOIN recipe_competitions rc ON rc.id = el.competition_id
  LEFT JOIN competition_leaderboard_view clv ON clv.entry_id = el.entry_id
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
  CASE WHEN is_new_model THEN official_rank ELSE legacy_rank END AS competition_rank,
  CASE
    WHEN is_new_model THEN official_medal
    ELSE CASE legacy_rank
      WHEN 1 THEN 'gold'
      WHEN 2 THEN 'silver'
      WHEN 3 THEN 'bronze'
      ELSE NULL
    END
  END AS competition_medal,
  ingredient_groups,
  allergens,
  allergens_other
FROM ranked
ORDER BY id, avg_score DESC NULLS LAST;


-- ============================================================
-- STEP 6: Views run as their owner and skip RLS, so the public
-- keys lose direct access. Re-run these REVOKEs if a view is
-- ever dropped and recreated (default privileges re-grant).
-- ============================================================
REVOKE SELECT ON recipe_detail_view                FROM anon, authenticated;
REVOKE SELECT ON competition_leaderboard_view       FROM anon, authenticated;
REVOKE SELECT ON competition_category_averages_view FROM anon, authenticated;


-- ============================================================
-- STEP 7: private recipe-photos bucket (no storage.objects
-- policies: uploads use server-issued signed URLs, reads go
-- through GET /api/recipe-photos/:recipeId)
-- ============================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('recipe-photos', 'recipe-photos', false, 5242880,
        ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE
  SET public = false,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;


-- ============================================================
-- Verify after applying:
--
-- -- with the anon key, before voting_open: no entry rows
-- GET /rest/v1/recipe_competition_entries?select=id
-- GET /rest/v1/competition_registrations?select=dish_working_title   (empty)
-- GET /rest/v1/recipe_detail_view?select=slug                         (permission denied)
--
-- SELECT recipe_competition_is_public(id), slug FROM recipe_competitions;
-- ============================================================
