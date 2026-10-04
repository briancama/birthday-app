-- ============================================================
-- Walktober: daily top walkers
--
-- walktober_daily_leaders  the top stepper(s) for each logged day.
--                          Ties all count; days where everyone logged 0 have no leader.
--                          security_invoker + RLS on the base table = server-only.
-- Date: 2026-10-03
-- ============================================================

CREATE OR REPLACE VIEW public.walktober_daily_leaders
WITH (security_invoker = true) AS
SELECT year, step_date, user_id, steps
FROM (
  SELECT
    we.year,
    we.step_date,
    we.user_id,
    we.steps,
    RANK() OVER (PARTITION BY we.year, we.step_date ORDER BY we.steps DESC) AS day_rank
  FROM public.walktober_entries we
  WHERE we.steps > 0
) ranked
WHERE day_rank = 1;

-- ============================================================
-- Verify:
-- SELECT * FROM walktober_daily_leaders WHERE year = 2026 ORDER BY step_date;
-- ============================================================
