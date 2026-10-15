-- ============================================================
-- On a Stick: no favorite votes this year.
-- favorite_bonus = 0 turns favorites off in the Competition Kit
-- (no favorite button, no bonus in the math). Set it back above
-- 0 to bring favorites back.
-- Date: 2026-10-12
-- ============================================================

UPDATE recipe_competitions SET favorite_bonus = 0 WHERE slug = 'on-a-stick';
