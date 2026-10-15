-- ============================================================
-- On a Stick: rubric levels for the Competition Kit rubric page
-- (/competitions/on-a-stick/rubric) and the judge scorer.
-- Copy ported from the hand-built on-a-stick-rubric.html.
-- Stickiness has no 5→1 ladder; its prose lives in
-- templates/competitions/themes/on-a-stick/rubric/stickiness.ejs.
--
-- Prerequisites: 2026_10_10_competition_kit.sql
-- Date: 2026-10-12
-- ============================================================

UPDATE competition_categories cc
SET levels = v.levels::jsonb
FROM recipe_competitions rc,
  (VALUES
    ('taste', '[
      {"score": 5, "label": "AMAZING", "description": "would eat a second stick immediately"},
      {"score": 4, "label": "Very Good", "description": "really enjoyable, well-balanced"},
      {"score": 3, "label": "Good", "description": "solid bite, nothing wrong"},
      {"score": 2, "label": "Not Great", "description": "some issues but edible"},
      {"score": 1, "label": "Poor", "description": "hard to finish"}
    ]'),
    ('presentation', '[
      {"score": 5, "label": "WOW FACTOR", "description": "you took a picture to show it off to strangers"},
      {"score": 4, "label": "Impressive", "description": "multiple elements, thoughtful styling"},
      {"score": 3, "label": "Nice", "description": "well-presented, attractive"},
      {"score": 2, "label": "Some Effort", "description": "at least it''s arranged with intent"},
      {"score": 1, "label": "Basic", "description": "food. Stick. Nothing more."}
    ]'),
    ('craft', '[
      {"score": 5, "label": "PERFECT", "description": "homemade components, real technique, serious effort"},
      {"score": 4, "label": "Skilled", "description": "techniques beyond basic assembly"},
      {"score": 3, "label": "Good", "description": "competent prep with thoughtful touches"},
      {"score": 2, "label": "Needs Work", "description": "mostly straightforward assembly"},
      {"score": 1, "label": "Poor", "description": "little more than plugging a stick into a pre-made component, minimal effort"}
    ]')
  ) AS v(key, levels)
WHERE rc.slug = 'on-a-stick'
  AND cc.competition_id = rc.id
  AND cc.key = v.key;

UPDATE competition_categories cc
SET description = 'How well the stick functions as an integral part of the dish.'
FROM recipe_competitions rc
WHERE rc.slug = 'on-a-stick'
  AND cc.competition_id = rc.id
  AND cc.key = 'stickiness';


-- Verify:
-- SELECT key, description, jsonb_array_length(levels) FROM competition_categories cc
-- JOIN recipe_competitions rc ON rc.id = cc.competition_id
-- WHERE rc.slug = 'on-a-stick' ORDER BY sort_order;
