-- Hub Realtime Setup
-- Run this in the Supabase SQL editor to enable hub.html live updates.
-- Three things are required:
--   1. Add `assignments` to the realtime publication so change events are broadcast
--   2. Allow the anon role to read assignments (hub uses the anon/public key, no user session)
--   3. Allow the anon role to read challenges and users (joined by the hub for names/home_only)

-- ============================================================
-- 1. Enable realtime on the assignments table
-- ============================================================
-- Supabase uses a Postgres publication called "supabase_realtime".
-- Tables must be explicitly added to receive change events.
ALTER PUBLICATION supabase_realtime ADD TABLE assignments;


-- ============================================================
-- 2. RLS read policy for anon on assignments
-- ============================================================
-- Only needed if RLS is already enabled on assignments.
-- If your assignments table has RLS disabled, skip this policy.
CREATE POLICY "hub_anon_read_assignments"
  ON assignments
  FOR SELECT
  TO anon
  USING (true);


-- ============================================================
-- 3. RLS read policy for anon on challenges and users
-- ============================================================
-- The hub joins assignments → challenges(home_only) and reads users for
-- player names/avatars. Both require anon SELECT access.

-- challenges (only needed if challenges already has RLS enabled)
CREATE POLICY "hub_anon_read_challenges"
  ON challenges
  FOR SELECT
  TO anon
  USING (true);

-- users (only needed if users already has RLS enabled)
CREATE POLICY "hub_anon_read_users"
  ON users
  FOR SELECT
  TO anon
  USING (true);
