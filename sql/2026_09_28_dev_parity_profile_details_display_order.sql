-- Dev parity: columns that existed in prod but were missing from the dev project,
-- discovered by scripts/db-pull.js drift detection on 2026-09-28.
-- Already applied to: dev (2026-09-28). Prod already had both columns.

-- Legacy jsonb profile blob from before the flat-column migration
-- (sql/2026_03_10_migrate_profile_to_flat_columns.sql); prod still carries it.
ALTER TABLE public.user_profile
  ADD COLUMN IF NOT EXISTS profile_details jsonb;

-- From sql/2026_03_20_add_cocktail_entry_order.sql, which was never applied to dev.
ALTER TABLE public.cocktail_entries
  ADD COLUMN IF NOT EXISTS display_order integer;
