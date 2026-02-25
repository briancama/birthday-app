-- event_rsvp_user_lookup.sql: Fetch RSVP'd users for an event with user info

SELECT r.status, u.id AS user_id, u.display_name, u.headshot_url
FROM event_rsvps r
JOIN users u ON r.user_id = u.id
WHERE r.event_id = :event_id;
