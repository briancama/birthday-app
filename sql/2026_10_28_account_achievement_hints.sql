-- Account Center locked-slot hints (achievements.metadata.hint).
-- Hints show only on locked slots (never with the earned name/description), so keep them nudgy, not step-by-step.
-- Edit the copy and re-run; safe to run again. Other metadata keys are preserved.
BEGIN;

UPDATE public.achievements AS a
SET metadata = COALESCE(a.metadata, '{}'::jsonb) || jsonb_build_object('hint', h.hint)
FROM (VALUES
  ('wall_flower',       'Sometimes you wanna go'),
  ('social_butterfly',  'Where everybody knows your name'),
  ('toms_best_friend',  'And they''re always glad you came'),
  ('top_8_complete',    'You wanna be where you can see'),
  ('first_fav_song',    'Music sets the mood'),
  ('secret_tracks',     'Not every song is on the playlist. Try going backwards.'),
  ('gif_master',        'click click dem gif gifs'),
  ('ad_completionist',  'I got to afford these server costs somehow'),
  ('site_popularity',   'Show me love, show me life'),
  ('rickroll',          'Some prizes are too good to be true. Claim one anyway.'),
  ('hacked',            'Some tests aren''t meant to be passed.')
) AS h(key, hint)
WHERE a.key = h.key;

-- Any other slot-eligible achievement without copy gets a visible placeholder.
UPDATE public.achievements
SET metadata = COALESCE(metadata, '{}'::jsonb) || '{"hint":"TODO hint"}'::jsonb
WHERE is_visitor_eligible = true
  AND (metadata->>'hidden') IS DISTINCT FROM 'true'
  AND key !~ '^walktober_\d{4}_'
  AND NULLIF(BTRIM(metadata->>'hint'), '') IS NULL;

-- Walktober achievements never render as locked slots; clear any placeholder seeded earlier.
UPDATE public.achievements
SET metadata = metadata - 'hint'
WHERE key ~ '^walktober_\d{4}_'
  AND metadata->>'hint' = 'TODO hint';

COMMIT;

-- Anything listed here still needs real hint copy.
SELECT key, name, metadata->>'hint' AS hint
FROM public.achievements
WHERE is_visitor_eligible = true
  AND (metadata->>'hidden') IS DISTINCT FROM 'true'
  AND key !~ '^walktober_\d{4}_'
  AND metadata->>'hint' = 'TODO hint'
ORDER BY key;
