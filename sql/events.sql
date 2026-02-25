-- events.sql: Create events and event_rsvps tables, and insert example event

-- Create events table
CREATE TABLE IF NOT EXISTS events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    title text NOT NULL,
    description text,
    date date,
    time_start time,
    time_end time,
    time_label text,
    location text,
    directions_url text,
    link_url text,
    link_label text,
    created_at timestamp with time zone DEFAULT now()
);

-- Create event_rsvps table
CREATE TABLE IF NOT EXISTS event_rsvps (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id uuid REFERENCES events(id) ON DELETE CASCADE,
    user_id uuid REFERENCES users(id) ON DELETE CASCADE,
    status text NOT NULL CHECK (status IN ('going', 'maybe', 'not_going', 'interested')),
    created_at timestamp with time zone DEFAULT now(),
    UNIQUE (event_id, user_id)
);

-- Disable RLS for event_rsvps table only
ALTER TABLE event_rsvps DISABLE ROW LEVEL SECURITY;

-- Example event: 40 Proof
INSERT INTO events (title, description, date, time_start, location)
VALUES (
    '40 Proof',
    'Let''s flex some creative muscle while getting potentially a little too drunk. Make a cocktail that all can enjoy and win the first big prize of the weekend!',
    '2026-03-20',
    '20:00',
    NULL
);

-- RSVP user lookup query (for reference)
-- SELECT r.status, u.id AS user_id, u.display_name, u.headshot_url
-- FROM event_rsvps r
-- JOIN users u ON r.user_id = u.id
-- WHERE r.event_id = :event_id;
