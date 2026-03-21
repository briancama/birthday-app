-- Add display_order to cocktail_entries
-- Allows manual control over the judging order.
-- NULL entries fall to the end (ORDER BY display_order ASC NULLS LAST).
-- Set via Supabase table editor or direct SQL before the competition starts.
-- Example: UPDATE cocktail_entries SET display_order = 1 WHERE entry_name = 'Margarita';

ALTER TABLE cocktail_entries
  ADD COLUMN IF NOT EXISTS display_order INTEGER DEFAULT NULL;

COMMENT ON COLUMN cocktail_entries.display_order IS
  'Optional integer for explicit judging order. NULLs sort after numbered entries. Lower numbers appear first.';
