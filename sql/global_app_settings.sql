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

-- Toggle event start in Supabase SQL Editor:
-- UPDATE app_settings SET setting_value = '{"enabled": true}'::jsonb WHERE setting_key = 'event_started';
-- UPDATE app_settings SET setting_value = '{"enabled": false}'::jsonb WHERE setting_key = 'event_started';