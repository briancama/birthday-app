-- ============================================================
-- recipe_categories: canonical category definitions
--
-- Each row defines one category. The `slug` is the lookup key
-- and the value stored in cocktail_entries.category.
--
-- Fields:
--   slug        - URL/DB key, e.g. "drinks"  (stored in cocktail_entries.category)
--   name        - Display label, e.g. "Drinks"
--   tagline     - Short flavor text shown on category pages/tiles
--   gif_url     - Path to a gif/image shown with this category
--   sort_order  - Controls display order in nav/filter bar
-- ============================================================

CREATE TABLE IF NOT EXISTS recipe_categories (
  slug        TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  tagline     TEXT,
  gif_url     TEXT,
  sort_order  INTEGER DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- Seed initial categories
INSERT INTO recipe_categories (slug, name, tagline, gif_url, sort_order) VALUES
  ('drinks',     'Drinks',          'Cocktails, mocktails, and everything in between',  NULL, 10),
  ('mains',      'Main Dishes',     'Hearty, filling, and worth the effort',             NULL, 20),
  ('appetizers', 'Appetizers',      'Small bites to get the party started',              NULL, 30),
  ('sides',      'Sides & Salads',  'The unsung heroes of every great meal',             NULL, 40),
  ('desserts',   'Desserts',        'Life is short — eat dessert first',                 NULL, 50),
  ('baking',     'Baking & Breads', 'Patience, flour, and just a little magic',          NULL, 60),
  ('soups',      'Soups & Stews',   'Low and slow, warm and good',                       NULL, 70)
ON CONFLICT (slug) DO NOTHING;

-- Optional: add a foreign key constraint on cocktail_entries.category
-- so only valid slugs can be used. Only do this after backfilling
-- existing rows to use slug values (e.g. 'drinks' not 'Drinks').
--
-- ALTER TABLE cocktail_entries
--   ADD CONSTRAINT fk_category
--   FOREIGN KEY (category) REFERENCES recipe_categories (slug);

-- RLS: public read, no direct writes (manage via admin)
ALTER TABLE recipe_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "recipe_categories_public_read"
  ON recipe_categories FOR SELECT
  USING (true);
