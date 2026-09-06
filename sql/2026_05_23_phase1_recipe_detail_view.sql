-- Phase 1: recipe_detail_view
-- A single view that provides everything the /recipes/:slug route
-- and recipe.ejs template need, including live-computed competition
-- rank and medal from cocktail_judgments.
--
-- Apply AFTER 2026_05_23_phase1_add_recipe_fields.sql
-- Date: 2026-05-23
--
-- Fields returned:
--   id, slug, title, description, ingredients, steps, notes,
--   prep_time, cook_time, servings, difficulty, image_url, category,
--   created_at, author_slug, author,
--   competition_id, competition_name,
--   avg_score, judgments_count,
--   competition_rank (1-based within competition, NULL for standalone)
--   competition_medal ('gold' | 'silver' | 'bronze' | NULL)

CREATE OR REPLACE VIEW recipe_detail_view AS
WITH scores AS (
  -- Compute avg score live from judgments (avoids stale leaderboard data)
  SELECT
    cj.entry_id,
    ROUND(
      AVG(
        (cj.taste_score + cj.presentation_score + cj.workmanship_score + cj.creativity_score)::numeric / 4
      )::numeric,
      3
    ) AS avg_score,
    COUNT(cj.id) AS judgments_count
  FROM cocktail_judgments cj
  GROUP BY cj.entry_id
),
ranked AS (
  SELECT
    e.id,
    e.slug,
    e.entry_name                              AS title,
    e.description,
    e.ingredients,
    e.steps,
    e.notes,
    e.prep_time,
    e.cook_time,
    e.servings,
    e.difficulty,
    e.image_url,
    e.category,
    e.submitted_at                            AS created_at,
    u.username                                AS author_slug,
    COALESCE(u.display_name, u.username)      AS author,
    e.competition_id,
    c.name                                    AS competition_name,
    COALESCE(s.avg_score, NULL)               AS avg_score,
    COALESCE(s.judgments_count, 0)            AS judgments_count,
    -- Only rank within a competition; standalone recipes get NULL
    CASE
      WHEN e.competition_id IS NOT NULL THEN
        RANK() OVER (
          PARTITION BY e.competition_id
          ORDER BY s.avg_score DESC NULLS LAST
        )
      ELSE NULL
    END AS competition_rank
  FROM cocktail_entries e
  JOIN users u
    ON u.id = e.user_id
  LEFT JOIN cocktail_competitions c
    ON c.id = e.competition_id
  LEFT JOIN scores s
    ON s.entry_id = e.id
)
SELECT
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
FROM ranked;

COMMENT ON VIEW recipe_detail_view IS
  'Single-query recipe detail for /recipes/:slug. Computes competition rank and medal live from cocktail_judgments. Standalone recipes (competition_id IS NULL) return NULL for rank/medal fields.';


-- ============================================================
-- Verify the view after applying:
--
-- SELECT slug, title, author, competition_name,
--        competition_rank, competition_medal, avg_score
-- FROM recipe_detail_view
-- ORDER BY competition_id NULLS LAST, competition_rank;
-- ============================================================
