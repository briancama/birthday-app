-- ============================================================
-- ON A STICK: correct event address (was 20524 97th Ave S, 98031)
-- Date: 2026-10-03
-- ============================================================

UPDATE events
SET
  location = '20516 97th Ave S, Kent, WA 98032',
  directions_url = 'https://maps.app.goo.gl/88ErufHETcgXFSJc9'
WHERE title = 'ON A STICK' AND date = '2026-12-05';

-- Verify:
-- SELECT title, location, directions_url FROM events WHERE title = 'ON A STICK';
