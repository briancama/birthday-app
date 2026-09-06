-- ============================================================
-- Add recipe_comments table
--
-- Purpose:
-- Keep recipe discussion data independent from competition judging data.
-- This supports recipes added outside competitions and preserves a single,
-- recipe-native comments model for the recipe detail view.
-- ============================================================

CREATE TABLE IF NOT EXISTS recipe_comments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id   UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  guest_name  TEXT,
  comment     TEXT NOT NULL CHECK (length(trim(comment)) > 0),
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- Remove any accidental duplicates by normalized recipe/commenter/comment,
-- keeping the oldest created row.
DELETE FROM recipe_comments rc
USING (
  SELECT
    ctid,
    ROW_NUMBER() OVER (
      PARTITION BY
        recipe_id,
        COALESCE(user_id::text, '__guest__:' || COALESCE(lower(trim(guest_name)), '__anon__')),
        lower(trim(comment))
      ORDER BY created_at ASC, id ASC
    ) AS rn
  FROM recipe_comments
) d
WHERE rc.ctid = d.ctid
  AND d.rn > 1;

-- Hard guard against future duplicates for normalized recipe/commenter/comment.
CREATE UNIQUE INDEX IF NOT EXISTS idx_recipe_comments_unique_normalized
  ON recipe_comments (
    recipe_id,
    COALESCE(user_id::text, '__guest__:' || COALESCE(lower(trim(guest_name)), '__anon__')),
    lower(trim(comment))
  );

CREATE INDEX IF NOT EXISTS idx_recipe_comments_recipe_created
  ON recipe_comments (recipe_id, created_at DESC);

ALTER TABLE recipe_comments ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'recipe_comments'
      AND policyname = 'recipe_comments_public_read'
  ) THEN
    CREATE POLICY "recipe_comments_public_read"
      ON recipe_comments FOR SELECT USING (true);
  END IF;
END $$;

-- ============================================================
-- Optional one-time backfill from competition judgment notes
--
-- Dedupe guard:
-- 1) Dedupes rows inside the source set itself.
-- 2) Skips rows that already exist in recipe_comments.
-- Safe to rerun.
-- ============================================================
WITH source_notes AS (
  SELECT
    rce.recipe_id,
    rcj.judge_user_id AS user_id,
    NULL::text AS guest_name,
    trim(rcj.notes) AS comment,
    COALESCE(rcj.submitted_at, now()) AS created_at,
    COALESCE(rcj.updated_at, rcj.submitted_at, now()) AS updated_at,
    ROW_NUMBER() OVER (
      PARTITION BY rce.recipe_id, rcj.judge_user_id, lower(trim(rcj.notes))
      ORDER BY COALESCE(rcj.updated_at, rcj.submitted_at, now()) DESC, rcj.id DESC
    ) AS rn
  FROM recipe_competition_judgments rcj
  JOIN recipe_competition_entries rce ON rce.id = rcj.entry_id
  WHERE rcj.notes IS NOT NULL
    AND length(trim(rcj.notes)) > 0
),
deduped_source AS (
  SELECT recipe_id, user_id, guest_name, comment, created_at, updated_at
  FROM source_notes
  WHERE rn = 1
)
INSERT INTO recipe_comments (recipe_id, user_id, guest_name, comment, created_at, updated_at)
SELECT
  ds.recipe_id,
  ds.user_id,
  ds.guest_name,
  ds.comment,
  ds.created_at,
  ds.updated_at
FROM deduped_source ds
WHERE NOT EXISTS (
  SELECT 1
  FROM recipe_comments c
  WHERE c.recipe_id = ds.recipe_id
    AND c.user_id IS NOT DISTINCT FROM ds.user_id
    AND lower(trim(c.comment)) = lower(trim(ds.comment))
);
