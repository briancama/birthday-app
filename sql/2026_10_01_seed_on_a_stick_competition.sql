-- ============================================================
-- Seed: ON A STICK competition (Dec 5, 2026)
--
-- First consumer of the competition platform
-- (2026_10_01_competition_platform.sql must be applied first).
-- Categories/weights mirror on-a-stick-rubric.html:
--   Taste x11, Presentation x3, Craft x3, Stickiness x3 (20-100 pts).
-- voting_open starts false; flip it day-of to open judging.
-- Idempotent — safe to re-run.
-- Date: 2026-10-01
-- ============================================================

-- Competition
INSERT INTO recipe_competitions (name, slug, theme, event_date, voting_open, favorite_bonus)
SELECT 'ON A STICK', 'on-a-stick', 'on-a-stick', '2026-12-05', false, 3
WHERE NOT EXISTS (
  SELECT 1 FROM recipe_competitions WHERE slug = 'on-a-stick'
);

-- Categories
INSERT INTO competition_categories (competition_id, key, label, description, weight, sort_order)
SELECT comp.id, cat.key, cat.label, cat.description, cat.weight, cat.sort_order
FROM recipe_competitions comp,
LATERAL (
  VALUES
    ('taste',        'Taste',        'The most important category — make sure your entry tastes great.',                        11, 1),
    ('presentation', 'Presentation', 'How the entry looks and is presented.',                                                    3, 2),
    ('craft',        'Craft',        'Show off the work and technique that went into your dish.',                                3, 3),
    ('stickiness',   'Stickiness',   'How well the stick functions as an integral part of the food. See the rubric.',            3, 4)
) AS cat(key, label, description, weight, sort_order)
WHERE comp.slug = 'on-a-stick'
ON CONFLICT (competition_id, key) DO NOTHING;

-- Event row (headcount/RSVP target for registration)
INSERT INTO events (title, description, date, time_start, time_label, location, directions_url, link_url, link_label)
SELECT
  'ON A STICK',
  'The food competition. Bring something delicious on a stick — enough for every judge to taste. Judging starts at 3:30.',
  '2026-12-05',
  '15:00',
  '3:00 arrival · 3:30 judging',
  '20516 97th Ave S, Kent, WA 98032',
  'https://maps.app.goo.gl/88ErufHETcgXFSJc9',
  '/on-a-stick',
  'Event page'
WHERE NOT EXISTS (
  SELECT 1 FROM events WHERE title = 'ON A STICK' AND date = '2026-12-05'
);

-- Link competition to its event (for RSVP auto-upsert on registration)
UPDATE recipe_competitions
SET event_id = (
  SELECT id FROM events WHERE title = 'ON A STICK' AND date = '2026-12-05' LIMIT 1
)
WHERE slug = 'on-a-stick' AND event_id IS NULL;

-- ============================================================
-- Verify:
-- SELECT c.name, c.slug, cc.label, cc.weight
-- FROM recipe_competitions c
-- JOIN competition_categories cc ON cc.competition_id = c.id
-- WHERE c.slug = 'on-a-stick' ORDER BY cc.sort_order;
-- ============================================================
