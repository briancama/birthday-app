-- ============================================================
-- Walktober: manual daily step logging + per-year season awards
--
-- walktober_seasons      one row per year (dates, edit window, min goal, close state)
-- walktober_participants setting a goal = joining; goal locks after first entry (API)
-- walktober_entries      one row per user per day; steps = 0 is a logged zero,
--                        no row = unlogged
-- walktober_totals       per-user season rollup (security_invoker, server-only)
--
-- RLS is on with no policies: everything goes through routes/api-walktober.js
-- with the service role.
--
-- Achievements are per-year keys, awarded by the admin Close action.
-- Next year: copy the season INSERT + achievements block with the new year.
-- Date: 2026-10-03
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.walktober_seasons (
  year        integer PRIMARY KEY,
  starts_on   date NOT NULL,
  ends_on     date NOT NULL,
  edit_until  date NOT NULL,
  min_goal    integer NOT NULL DEFAULT 5000 CHECK (min_goal > 0),
  closed_at   timestamptz,
  closed_by   uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_on >= starts_on),
  CHECK (edit_until >= ends_on)
);

CREATE TABLE IF NOT EXISTS public.walktober_participants (
  year        integer NOT NULL REFERENCES public.walktober_seasons(year) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  daily_goal  integer NOT NULL CHECK (daily_goal > 0 AND daily_goal <= 1000000),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (year, user_id)
);

CREATE TABLE IF NOT EXISTS public.walktober_entries (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  year        integer NOT NULL,
  user_id     uuid NOT NULL,
  step_date   date NOT NULL,
  steps       integer NOT NULL CHECK (steps >= 0 AND steps <= 200000),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, step_date),
  FOREIGN KEY (year, user_id)
    REFERENCES public.walktober_participants(year, user_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS walktober_entries_year_user_idx
  ON public.walktober_entries (year, user_id);

ALTER TABLE public.walktober_seasons      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.walktober_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.walktober_entries      ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE VIEW public.walktober_totals
WITH (security_invoker = true) AS
SELECT
  p.year,
  p.user_id,
  u.username,
  u.display_name,
  u.headshot,
  COALESCE(up.is_published, false)              AS is_published,
  p.daily_goal,
  (s.ends_on - s.starts_on + 1)                 AS days_in_season,
  COALESCE(e.total_steps, 0)                    AS total_steps,
  COALESCE(e.days_logged, 0)                    AS days_logged,
  COALESCE(e.days_hit_goal, 0)                  AS days_hit_goal,
  ROUND(
    100.0 * COALESCE(e.total_steps, 0) / (p.daily_goal * (s.ends_on - s.starts_on + 1)),
    1
  )                                             AS goal_progress_pct
FROM public.walktober_participants p
JOIN public.walktober_seasons s ON s.year = p.year
JOIN public.users u ON u.id = p.user_id
LEFT JOIN public.user_profile up ON up.user_id = p.user_id
LEFT JOIN LATERAL (
  SELECT
    SUM(we.steps)::integer                                        AS total_steps,
    COUNT(*)::integer                                             AS days_logged,
    (COUNT(*) FILTER (WHERE we.steps >= p.daily_goal))::integer   AS days_hit_goal
  FROM public.walktober_entries we
  WHERE we.year = p.year AND we.user_id = p.user_id
) e ON true;

-- ── Season 2026 ─────────────────────────────────────────────
INSERT INTO public.walktober_seasons (year, starts_on, ends_on, edit_until, min_goal)
VALUES (2026, '2026-10-01', '2026-10-31', '2026-11-07', 5000)
ON CONFLICT (year) DO UPDATE
SET
  starts_on  = EXCLUDED.starts_on,
  ends_on    = EXCLUDED.ends_on,
  edit_until = EXCLUDED.edit_until,
  min_goal   = EXCLUDED.min_goal;

INSERT INTO public.achievements (key, name, description, points, metadata, is_visitor_eligible, image_url)
VALUES
  (
    'walktober_2026_gold',
    'Walktober 2026: Most Steps',
    'Walked the most steps in Walktober 2026.',
    10,
    '{"trigger":"walktober:close","year":2026,"place":1}'::jsonb,
    true,
    '/images/gold-medal.gif'
  ),
  (
    'walktober_2026_silver',
    'Walktober 2026: 2nd Most Steps',
    'Walked the second most steps in Walktober 2026.',
    7,
    '{"trigger":"walktober:close","year":2026,"place":2}'::jsonb,
    true,
    '/images/silver-medal.gif'
  ),
  (
    'walktober_2026_bronze',
    'Walktober 2026: 3rd Most Steps',
    'Walked the third most steps in Walktober 2026.',
    5,
    '{"trigger":"walktober:close","year":2026,"place":3}'::jsonb,
    true,
    '/images/bronze-medal.gif'
  ),
  (
    'walktober_2026_goal_average',
    'Walktober 2026: Goal Met',
    'Averaged your daily step goal across all of Walktober 2026.',
    4,
    '{"trigger":"walktober:close","year":2026,"type":"goal_average"}'::jsonb,
    true,
    NULL
  )
ON CONFLICT (key) DO UPDATE
SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  points = EXCLUDED.points,
  metadata = EXCLUDED.metadata,
  is_visitor_eligible = EXCLUDED.is_visitor_eligible,
  image_url = EXCLUDED.image_url;

COMMIT;

-- ============================================================
-- Verify:
-- SELECT * FROM walktober_seasons;
-- SELECT key, points FROM achievements WHERE key LIKE 'walktober_2026_%';
-- SELECT * FROM walktober_totals WHERE year = 2026;
-- ============================================================
