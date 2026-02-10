-- Feature Flags System for Birthday Challenge Zone
-- Simple boolean flags to control feature visibility

-- Create settings table for global app configuration
CREATE TABLE IF NOT EXISTS app_settings (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  setting_key VARCHAR UNIQUE NOT NULL,
  setting_value JSONB NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for fast lookups
CREATE INDEX idx_app_settings_key ON app_settings(setting_key);

-- Insert default feature flags
INSERT INTO app_settings (setting_key, setting_value) VALUES
  ('event_started', '{"enabled": false}'::jsonb)
ON CONFLICT (setting_key) DO NOTHING;

-- Enable RLS for app_settings
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read app_settings
CREATE POLICY "Allow authenticated users to read app_settings"
  ON app_settings
  FOR SELECT
  TO authenticated
  USING (true);

-- Prevent authenticated users from updating/deleting (admin only via direct SQL)
CREATE POLICY "Prevent updates to app_settings"
  ON app_settings
  FOR UPDATE
  TO authenticated
  USING (false);

CREATE POLICY "Prevent deletes to app_settings"
  ON app_settings
  FOR DELETE
  TO authenticated
  USING (false);

-- Prevent inserts from authenticated users
CREATE POLICY "Prevent inserts to app_settings"
  ON app_settings
  FOR INSERT
  TO authenticated
  WITH CHECK (false);

-- Toggle event start in Supabase SQL Editor:
-- UPDATE app_settings SET setting_value = '{"enabled": true}'::jsonb WHERE setting_key = 'event_started';
-- UPDATE app_settings SET setting_value = '{"enabled": false}'::jsonb WHERE setting_key = 'event_started';