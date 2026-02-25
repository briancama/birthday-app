-- event_rsvp_user_lookup_and_rls.sql: RSVP user lookup and RLS disable for event_rsvps

-- Disable RLS for event_rsvps table only
ALTER TABLE event_rsvps DISABLE ROW LEVEL SECURITY;

-- Fetch RSVP'd users for an event with user info
SELECT r.status, u.id AS user_id, u.display_name, u.headshot_url
FROM event_rsvps r
JOIN users u ON r.user_id = u.id
WHERE r.event_id = :event_id;
