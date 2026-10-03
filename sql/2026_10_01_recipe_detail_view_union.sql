-- ============================================================
-- recipe_detail_view: score new-model competitions too
--
-- Keeps the exact column signature from
-- 2026_05_27_phase2_recipe_tables.sql (STEP 9) so /recipes
-- routes and recipe.ejs need no changes.
--
-- Legacy competitions (no competition_categories rows) keep the
-- frozen fixed-column math from recipe_competition_judgments.
-- New-model competitions score from competition_judgment_scores:
--   avg_score = AVG per judge of SUM(score x weight) / SUM(weight)
--   (1-5 scale; identical to legacy /20 math for 11/3/3/3 weights)
-- Rank/medal for new-model entries come from
-- competition_leaderboard_view so AFewRecipes medals match the
-- official results (favorite bonus included, withdrawn excluded).
--
-- Prerequisites: 2026_10_01_competition_platform.sql applied.
-- Date: 2026-10-01
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
-- All entries (even unscored) so competition_name renders pre-judging
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
    END                                     AS legacy_rank
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
  END AS competition_medal
FROM ranked
ORDER BY id, avg_score DESC NULLS LAST;

COMMENT ON VIEW recipe_detail_view IS
  'Recipe detail for /recipes. Legacy competitions score from recipe_competition_judgments (frozen math); new-model competitions (with competition_categories) score from competition_judgment_scores and take rank/medal from competition_leaderboard_view.';


-- ============================================================
-- Verify after applying:
--
-- SELECT slug, title, competition_name, avg_score,
--        competition_rank, competition_medal
-- FROM recipe_detail_view
-- WHERE competition_id IS NOT NULL
-- ORDER BY competition_name, competition_rank;
--
-- Legacy rows must be identical to before this migration.
-- ============================================================
