-- cocktail_leaderboard.sql
-- ============================================
-- COCKTAIL LEADERBOARD MATERIALIZED TABLE
-- ============================================
-- This script creates and documents the cocktail_leaderboard table, which aggregates
-- cocktail competition results for leaderboard display. It is built from the schema in
-- create_cocktail_tables.sql (cocktail_competitions, cocktail_entries, cocktail_judgments, cocktail_favorites, users).
--
-- Date: 2026-02-09
--
-- Table definition:
CREATE TABLE IF NOT EXISTS public.cocktail_leaderboard (
  entry_id uuid PRIMARY KEY,                    -- PK ties to cocktail_entries.id
  competition_id uuid,                          -- optional: competition reference
  entry_name text,
  user_id uuid,                                 -- entry owner
  username text,
  avg_score numeric(6,3),                       -- overall average score (rounded)
  taste_avg numeric(6,3),                       -- per-criterion averages
  presentation_avg numeric(6,3),
  workmanship_avg numeric(6,3),
  creativity_avg numeric(6,3),
  judgments_count integer DEFAULT 0,            -- number of judgments
  favorites_count integer DEFAULT 0,            -- number of favorites
  last_judged_at timestamptz,                   -- most recent judgment timestamp
  submitted_at timestamptz,                     -- when entry was submitted
  created_at timestamptz DEFAULT now(),         -- record creation time
  updated_at timestamptz DEFAULT now()          -- record last update time
);

-- Indexes for leaderboard queries
CREATE INDEX IF NOT EXISTS idx_cocktail_leaderboard_avg_score_desc
  ON public.cocktail_leaderboard (avg_score DESC);
CREATE INDEX IF NOT EXISTS idx_cocktail_leaderboard_favorites_desc
  ON public.cocktail_leaderboard (favorites_count DESC);
CREATE INDEX IF NOT EXISTS idx_cocktail_leaderboard_user_id
  ON public.cocktail_leaderboard (user_id);

-- Upsert/refresh pattern for leaderboard population
INSERT INTO public.cocktail_leaderboard (
  entry_id, competition_id, entry_name, user_id, username,
  avg_score, taste_avg, presentation_avg, workmanship_avg, creativity_avg,
  judgments_count, favorites_count, last_judged_at, submitted_at, created_at, updated_at
)
SELECT
  e.id, e.competition_id, e.entry_name, e.user_id, u.username,
  ROUND( NULLIF( AVG(
    ((cj.taste_score::numeric
      + cj.presentation_score::numeric
      + cj.workmanship_score::numeric
      + cj.creativity_score::numeric) / 4.0)
  ), NULL )::numeric, 3) AS avg_score,
  ROUND( AVG(cj.taste_score::numeric) :: numeric, 3),
  ROUND( AVG(cj.presentation_score::numeric) :: numeric, 3),
  ROUND( AVG(cj.workmanship_score::numeric) :: numeric, 3),
  ROUND( AVG(cj.creativity_score::numeric) :: numeric, 3),
  COUNT(cj.id),
  COALESCE(fav.favorites_count, 0),
  MAX(cj.submitted_at),
  e.submitted_at,
  now(),
  now()
FROM public.cocktail_entries e
LEFT JOIN public.cocktail_judgments cj ON cj.entry_id = e.id
LEFT JOIN (
  SELECT entry_id, COUNT(*) AS favorites_count
  FROM public.cocktail_favorites
  GROUP BY entry_id
) fav ON fav.entry_id = e.id
LEFT JOIN public.users u ON u.id = e.user_id
GROUP BY e.id, e.competition_id, e.entry_name, e.user_id, u.username, fav.favorites_count, e.submitted_at
ON CONFLICT (entry_id) DO UPDATE
SET
  competition_id = EXCLUDED.competition_id,
  entry_name = EXCLUDED.entry_name,
  user_id = EXCLUDED.user_id,
  username = EXCLUDED.username,
  avg_score = EXCLUDED.avg_score,
  taste_avg = EXCLUDED.taste_avg,
  presentation_avg = EXCLUDED.presentation_avg,
  workmanship_avg = EXCLUDED.workmanship_avg,
  creativity_avg = EXCLUDED.creativity_avg,
  judgments_count = EXCLUDED.judgments_count,
  favorites_count = EXCLUDED.favorites_count,
  last_judged_at = EXCLUDED.last_judged_at,
  submitted_at = EXCLUDED.submitted_at,
  updated_at = EXCLUDED.updated_at;

-- Comment for documentation
COMMENT ON TABLE public.cocktail_leaderboard IS 'Materialized leaderboard for cocktail competitions. Rebuilt from cocktail_entries, cocktail_judgments, cocktail_favorites, and users.';
