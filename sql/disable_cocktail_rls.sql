-- Disable RLS for Cocktail Tables
-- These tables don't use Supabase Auth (app uses username-only auth)
-- Date: 2026-02-03

ALTER TABLE cocktail_competitions DISABLE ROW LEVEL SECURITY;
ALTER TABLE cocktail_entries DISABLE ROW LEVEL SECURITY;
ALTER TABLE cocktail_judgments DISABLE ROW LEVEL SECURITY;
ALTER TABLE cocktail_favorites DISABLE ROW LEVEL SECURITY;
