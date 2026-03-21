-- Prevent users from judging their own cocktail entries.
-- Two layers of protection:
--   1. DB trigger on cocktail_judgments (hard block)
--   2. Leaderboard refresh query excludes self-judgments (see note at bottom)

-- ── 1. Trigger ───────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION prevent_self_judgment()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM cocktail_entries
    WHERE id = NEW.entry_id AND user_id = NEW.judge_user_id
  ) THEN
    RAISE EXCEPTION 'Users cannot judge their own cocktail entry.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_self_judgment ON cocktail_judgments;
CREATE TRIGGER trg_prevent_self_judgment
  BEFORE INSERT OR UPDATE ON cocktail_judgments
  FOR EACH ROW EXECUTE FUNCTION prevent_self_judgment();

-- ── 2. Self-judgment cleanup ──────────────────────────────────────────────────
-- Run this to delete any self-judgments that snuck in before the trigger.

DELETE FROM cocktail_judgments cj
USING cocktail_entries e
WHERE cj.entry_id = e.id AND cj.judge_user_id = e.user_id;

-- ── NOTE: Leaderboard refresh ─────────────────────────────────────────────────
-- Rebuilds leaderboard excluding self-judgments. Live table uses `id` as PK.

INSERT INTO public.cocktail_leaderboard (
  entry_id, competition_id, entry_name, user_id, username,
  avg_score, taste_avg, presentation_avg, workmanship_avg, creativity_avg,
  judgments_count, favorites_count, last_judged_at, submitted_at, created_at, updated_at
)
SELECT
  e.id, e.competition_id, e.entry_name, e.user_id, u.username,
  COALESCE(ROUND(AVG(
    ((cj.taste_score::numeric
      + cj.presentation_score::numeric
      + cj.workmanship_score::numeric
      + cj.creativity_score::numeric) / 4.0)
  )::numeric, 3), 0) AS avg_score,
  COALESCE(ROUND(AVG(cj.taste_score::numeric)::numeric, 3), 0) AS taste_avg,
  COALESCE(ROUND(AVG(cj.presentation_score::numeric)::numeric, 3), 0) AS presentation_avg,
  COALESCE(ROUND(AVG(cj.workmanship_score::numeric)::numeric, 3), 0) AS workmanship_avg,
  COALESCE(ROUND(AVG(cj.creativity_score::numeric)::numeric, 3), 0) AS creativity_avg,
  COUNT(cj.id) AS judgments_count,
  COALESCE(fav.favorites_count, 0) AS favorites_count,
  MAX(cj.submitted_at) AS last_judged_at,
  e.submitted_at,
  now(),
  now()
FROM public.cocktail_entries e
LEFT JOIN public.cocktail_judgments cj
  ON cj.entry_id = e.id
  AND cj.judge_user_id != e.user_id   -- exclude self-judgments
LEFT JOIN (
  SELECT entry_id, COUNT(*) AS favorites_count
  FROM public.cocktail_favorites
  GROUP BY entry_id
) fav ON fav.entry_id = e.id
LEFT JOIN public.users u ON u.id = e.user_id
GROUP BY e.id, e.competition_id, e.entry_name, e.user_id, u.username, fav.favorites_count, e.submitted_at
ON CONFLICT (entry_id) DO UPDATE
SET
  competition_id      = EXCLUDED.competition_id,
  entry_name          = EXCLUDED.entry_name,
  user_id             = EXCLUDED.user_id,
  username            = EXCLUDED.username,
  avg_score           = EXCLUDED.avg_score,
  taste_avg           = EXCLUDED.taste_avg,
  presentation_avg    = EXCLUDED.presentation_avg,
  workmanship_avg     = EXCLUDED.workmanship_avg,
  creativity_avg      = EXCLUDED.creativity_avg,
  judgments_count     = EXCLUDED.judgments_count,
  favorites_count     = EXCLUDED.favorites_count,
  last_judged_at      = EXCLUDED.last_judged_at,
  submitted_at        = EXCLUDED.submitted_at,
  updated_at          = EXCLUDED.updated_at;

