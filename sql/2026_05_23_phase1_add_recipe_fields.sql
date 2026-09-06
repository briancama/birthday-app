-- Phase 1: Add structured recipe fields to cocktail_entries
-- Enables the recipe detail page to render real data.
-- Also makes competition_id nullable so standalone recipes
-- (not tied to any competition) can exist.
--
-- Apply this BEFORE 2026_05_23_phase1_recipe_detail_view.sql
-- Date: 2026-05-23

-- ============================================================
-- STEP 1: Make competition optional
-- Allows standalone recipe submissions outside of a competition.
-- ============================================================
ALTER TABLE cocktail_entries
  ALTER COLUMN competition_id DROP NOT NULL;


-- ============================================================
-- STEP 2: Add structured recipe content fields
-- ============================================================
ALTER TABLE cocktail_entries
  ADD COLUMN IF NOT EXISTS ingredients  TEXT[]  NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS steps        TEXT[]  NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS notes        TEXT,
  ADD COLUMN IF NOT EXISTS prep_time    TEXT,
  ADD COLUMN IF NOT EXISTS cook_time    TEXT,
  ADD COLUMN IF NOT EXISTS servings     TEXT,
  ADD COLUMN IF NOT EXISTS difficulty   TEXT,
  ADD COLUMN IF NOT EXISTS image_url    TEXT,
  ADD COLUMN IF NOT EXISTS category     TEXT,
  ADD COLUMN IF NOT EXISTS slug         TEXT;


-- ============================================================
-- STEP 3: Unique index on slug (allows NULLs, enforces
-- uniqueness only on non-null values — standard Postgres behavior)
-- ============================================================
CREATE UNIQUE INDEX IF NOT EXISTS idx_cocktail_entries_slug
  ON cocktail_entries (slug)
  WHERE slug IS NOT NULL;


-- ============================================================
-- STEP 4: Backfill slugs for existing entries
--
-- Generates a URL-safe slug from entry_name.
-- Example: "Green Chile Verde" -> "green-chile-verde"
--
-- Run this AFTER verifying the generated slugs look correct.
-- If two entries produce the same slug, append the entry id
-- suffix manually before running, or adjust the formula below.
-- ============================================================

-- Preview first (read-only):
-- SELECT id, entry_name,
--        lower(regexp_replace(trim(entry_name), '[^a-zA-Z0-9]+', '-', 'g')) AS proposed_slug
-- FROM cocktail_entries
-- WHERE slug IS NULL
-- ORDER BY submitted_at;

-- Apply when ready:
UPDATE cocktail_entries
SET slug = lower(regexp_replace(trim(entry_name), '[^a-zA-Z0-9]+', '-', 'g'))
WHERE slug IS NULL;


-- ============================================================
-- STEP 5: Column comments for documentation
-- ============================================================
COMMENT ON COLUMN cocktail_entries.competition_id IS
  'Optional competition this entry belongs to. NULL = standalone recipe not tied to a competition.';
COMMENT ON COLUMN cocktail_entries.ingredients IS
  'Ordered list of ingredient strings, e.g. "2 lbs pork shoulder, cut into ½-inch cubes".';
COMMENT ON COLUMN cocktail_entries.steps IS
  'Ordered list of instruction strings. Each element is one step.';
COMMENT ON COLUMN cocktail_entries.notes IS
  'Author tips, substitutions, or storage notes rendered in the callout block.';
COMMENT ON COLUMN cocktail_entries.prep_time IS
  'Human-readable prep time, e.g. "25 min". Stored as text to allow flexible formats.';
COMMENT ON COLUMN cocktail_entries.cook_time IS
  'Human-readable cook time, e.g. "2 hrs".';
COMMENT ON COLUMN cocktail_entries.servings IS
  'Human-readable yield, e.g. "6–8" or "12 cookies".';
COMMENT ON COLUMN cocktail_entries.difficulty IS
  'One of: Easy, Medium, Hard. Not enforced at DB level to keep entry flexible.';
COMMENT ON COLUMN cocktail_entries.image_url IS
  'Optional image URL. Recipe detail page renders this above ingredients when present.';
COMMENT ON COLUMN cocktail_entries.category IS
  'Category label, e.g. "Mains", "Desserts", "Drinks". Used for browse/filter.';
COMMENT ON COLUMN cocktail_entries.slug IS
  'URL-safe identifier for /recipes/:slug routing. Unique, nullable (NULL until set).';
