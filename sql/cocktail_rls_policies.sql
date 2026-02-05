-- RLS Policies for Cocktail Competition Feature
-- Allows users to register and manage their cocktail entries
-- Date: 2026-02-03
-- NOTE: Uses DROP POLICY IF EXISTS for idempotency (can be run multiple times)

-- ============================================
-- COCKTAIL COMPETITIONS TABLE
-- ============================================

-- Enable RLS
ALTER TABLE cocktail_competitions ENABLE ROW LEVEL SECURITY;

-- Allow everyone to view competitions
DROP POLICY IF EXISTS "Anyone can view cocktail competitions" ON cocktail_competitions;
CREATE POLICY "Anyone can view cocktail competitions"
ON cocktail_competitions
FOR SELECT
USING (true);

-- Only admins can create/update competitions
DROP POLICY IF EXISTS "Admins can manage competitions" ON cocktail_competitions;
CREATE POLICY "Admins can manage competitions"
ON cocktail_competitions
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM users 
    WHERE users.id = auth.uid() 
    AND users.username IN ('brianc', 'admin')
  )
);

-- ============================================
-- COCKTAIL ENTRIES TABLE
-- ============================================

-- Enable RLS
ALTER TABLE cocktail_entries ENABLE ROW LEVEL SECURITY;

-- Allow users to view all entries (for browsing/voting)
DROP POLICY IF EXISTS "Anyone can view cocktail entries" ON cocktail_entries;
CREATE POLICY "Anyone can view cocktail entries"
ON cocktail_entries
FOR SELECT
USING (true);

-- Allow users to insert their own entries
DROP POLICY IF EXISTS "Users can create their own entries" ON cocktail_entries;
CREATE POLICY "Users can create their own entries"
ON cocktail_entries
FOR INSERT
WITH CHECK (user_id = auth.uid());

-- Allow users to update their own entries
DROP POLICY IF EXISTS "Users can update their own entries" ON cocktail_entries;
CREATE POLICY "Users can update their own entries"
ON cocktail_entries
FOR UPDATE
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Allow users to delete their own entries (optional)
DROP POLICY IF EXISTS "Users can delete their own entries" ON cocktail_entries;
CREATE POLICY "Users can delete their own entries"
ON cocktail_entries
FOR DELETE
USING (user_id = auth.uid());

-- ============================================
-- COCKTAIL JUDGMENTS TABLE
-- ============================================

-- Enable RLS
ALTER TABLE cocktail_judgments ENABLE ROW LEVEL SECURITY;

-- Allow users to view all judgments (for seeing scores/results)
DROP POLICY IF EXISTS "Anyone can view judgments" ON cocktail_judgments;
CREATE POLICY "Anyone can view judgments"
ON cocktail_judgments
FOR SELECT
USING (true);

-- Allow judges to submit their own judgments
DROP POLICY IF EXISTS "Judges can create their own judgments" ON cocktail_judgments;
CREATE POLICY "Judges can create their own judgments"
ON cocktail_judgments
FOR INSERT
WITH CHECK (judge_user_id = auth.uid());

-- Allow judges to update their own judgments
DROP POLICY IF EXISTS "Judges can update their own judgments" ON cocktail_judgments;
CREATE POLICY "Judges can update their own judgments"
ON cocktail_judgments
FOR UPDATE
USING (judge_user_id = auth.uid())
WITH CHECK (judge_user_id = auth.uid());

-- Allow judges to delete their own judgments
DROP POLICY IF EXISTS "Judges can delete their own judgments" ON cocktail_judgments;
CREATE POLICY "Judges can delete their own judgments"
ON cocktail_judgments
FOR DELETE
USING (judge_user_id = auth.uid());

-- ============================================
-- COCKTAIL FAVORITES TABLE
-- ============================================

-- Enable RLS
ALTER TABLE cocktail_favorites ENABLE ROW LEVEL SECURITY;

-- Allow users to view all favorites
DROP POLICY IF EXISTS "Anyone can view favorites" ON cocktail_favorites;
CREATE POLICY "Anyone can view favorites"
ON cocktail_favorites
FOR SELECT
USING (true);

-- Allow judges to mark their own favorites
DROP POLICY IF EXISTS "Judges can create their own favorites" ON cocktail_favorites;
CREATE POLICY "Judges can create their own favorites"
ON cocktail_favorites
FOR INSERT
WITH CHECK (judge_user_id = auth.uid());

-- Allow judges to remove their favorites
DROP POLICY IF EXISTS "Judges can delete their own favorites" ON cocktail_favorites;
CREATE POLICY "Judges can delete their own favorites"
ON cocktail_favorites
FOR DELETE
USING (judge_user_id = auth.uid());
