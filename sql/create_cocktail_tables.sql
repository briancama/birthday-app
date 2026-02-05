-- Cocktail Competition Feature Schema
-- Creates tables for cocktail competitions, entries, judging rubric, and favorites
-- Date: 2026-02-03 (documenting existing schema)

-- ============================================
-- COCKTAIL COMPETITIONS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS cocktail_competitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  event_date DATE,
  voting_open BOOLEAN DEFAULT true,
  voting_closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- COCKTAIL ENTRIES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS cocktail_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id UUID REFERENCES cocktail_competitions(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  entry_name TEXT NOT NULL,
  description TEXT NOT NULL,
  submitted_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- COCKTAIL JUDGMENTS TABLE
-- Scoring rubric: 1-5 scale for each category
-- ============================================
CREATE TABLE IF NOT EXISTS cocktail_judgments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id UUID REFERENCES cocktail_entries(id) ON DELETE CASCADE,
  judge_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  taste_score INTEGER CHECK (taste_score >= 1 AND taste_score <= 5),
  presentation_score INTEGER CHECK (presentation_score >= 1 AND presentation_score <= 5),
  workmanship_score INTEGER CHECK (workmanship_score >= 1 AND workmanship_score <= 5),
  creativity_score INTEGER CHECK (creativity_score >= 1 AND creativity_score <= 5),
  notes TEXT,
  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- COCKTAIL FAVORITES TABLE
-- Judges can mark their favorite entry
-- ============================================
CREATE TABLE IF NOT EXISTS cocktail_favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id UUID REFERENCES cocktail_competitions(id) ON DELETE CASCADE,
  judge_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  entry_id UUID REFERENCES cocktail_entries(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX IF NOT EXISTS idx_cocktail_entries_competition ON cocktail_entries(competition_id);
CREATE INDEX IF NOT EXISTS idx_cocktail_entries_user ON cocktail_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_cocktail_judgments_entry ON cocktail_judgments(entry_id);
CREATE INDEX IF NOT EXISTS idx_cocktail_judgments_judge ON cocktail_judgments(judge_user_id);
CREATE INDEX IF NOT EXISTS idx_cocktail_favorites_competition ON cocktail_favorites(competition_id);
CREATE INDEX IF NOT EXISTS idx_cocktail_favorites_entry ON cocktail_favorites(entry_id);
CREATE INDEX IF NOT EXISTS idx_cocktail_favorites_judge ON cocktail_favorites(judge_user_id);

-- ============================================
-- UPDATED_AT TRIGGER
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_cocktail_judgments_updated_at BEFORE UPDATE
  ON cocktail_judgments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- SAMPLE DATA (optional)
-- ============================================
-- Insert a sample competition
-- INSERT INTO cocktail_competitions (name, event_date, voting_open)
-- VALUES ('Valentine''s Day Cocktail Competition', '2026-02-14', true);
