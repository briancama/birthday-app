-- Enable RLS if not already enabled
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Policy: Allow update if id matches custom claim (x-user-id header)
CREATE POLICY "Allow update if id matches custom claim"
ON users
FOR UPDATE
USING (id::text = current_setting('request.headers.x-user-id', true))
WITH CHECK (id::text = current_setting('request.headers.x-user-id', true));

-- Policy: Allow updates if the user's id matches the id in the row (open policy, not recommended for production)
CREATE POLICY "Allow update if id matches"
ON users
FOR UPDATE
USING (true)
WITH CHECK (true);
