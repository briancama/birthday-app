-- Walktober 2026 award artwork + medal names. Does not change awards or points; safe to run again.
-- Medal names are short because the Account Center groups them under "Walktober 2026 achievements"
-- and profile badges prefix "Walktober <year>:" (profileAchievementName()).
BEGIN;

UPDATE public.achievements AS a
SET name = v.name,
    image_url = v.image_url
FROM (VALUES
  ('walktober_2026_gold',   '1st place', '/images/1st-walktober-2026.avif'),
  ('walktober_2026_silver', '2nd place', '/images/2nd-walktober-2026.avif'),
  ('walktober_2026_bronze', '3rd place', '/images/3rd-walktober-2026.avif')
) AS v(key, name, image_url)
WHERE a.key = v.key;

UPDATE public.achievements
SET image_url = '/images/frankenstein-finish.gif'
WHERE key = 'walktober_2026_goal_average';

COMMIT;

SELECT key, name, image_url
FROM public.achievements
WHERE key IN (
  'walktober_2026_gold',
  'walktober_2026_silver',
  'walktober_2026_bronze',
  'walktober_2026_goal_average'
)
ORDER BY key;
