-- Add RLS policies for challenge submission feature
-- This allows users to submit challenges and view their own submissions
-- Date: 2026-01-29

-- Enable RLS on challenges table (if not already enabled)
ALTER TABLE challenges ENABLE ROW LEVEL SECURITY;

-- Policy: Allow users to insert their own challenges with pending status
CREATE POLICY "Users can submit their own challenges"
ON challenges
FOR INSERT
WITH CHECK (
  created_by = auth.uid() 
  AND approval_status = 'pending'
);

-- Policy: Allow users to view their own submitted challenges
CREATE POLICY "Users can view their own submissions"
ON challenges
FOR SELECT
USING (created_by = auth.uid());

-- Policy: Allow users to view approved challenges
CREATE POLICY "Users can view approved challenges"
ON challenges
FOR SELECT
USING (approval_status = 'approved');

-- Policy: Allow admins to view all challenges (for approval workflow)
-- Replace 'your-admin-user-id' with actual admin user ID(s)
-- You can also use a separate admins table or check username
CREATE POLICY "Admins can view all challenges"
ON challenges
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM users 
    WHERE users.id = auth.uid() 
    AND users.username IN ('brianc', 'admin')
  )
);

-- Policy: Allow admins to update challenges (for approval workflow)
CREATE POLICY "Admins can update challenges"
ON challenges
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM users 
    WHERE users.id = auth.uid() 
    AND users.username IN ('brianc', 'admin')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM users 
    WHERE users.id = auth.uid() 
    AND users.username IN ('brianc', 'admin')
  )
);

-- Note: Adjust the admin usernames list as needed for your setup
