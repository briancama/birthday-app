-- Migration: Add Firebase Phone Auth Support
-- Description: Add firebase_uid and phone_number columns to users table for Firebase phone auth integration
-- Date: 2026-02-06

-- Add firebase_uid column (UNIQUE, nullable - allows pre-assigned users without auth)
ALTER TABLE users ADD COLUMN firebase_uid VARCHAR UNIQUE;

-- Add phone_number column (for matching users on first Firebase login)
ALTER TABLE users ADD COLUMN phone_number VARCHAR;

-- Create index on phone_number for fast lookups during signup
CREATE INDEX idx_users_phone_number ON users(phone_number);

-- Create index on firebase_uid for fast lookups during auth
CREATE INDEX idx_users_firebase_uid ON users(firebase_uid);

-- Example: Pre-assign a user with a phone number before they login
-- INSERT INTO users (username, phone_number, display_name, is_admin)
-- VALUES ('brianc', '+16175551234', 'Brian Cama', true);
--
-- Then assign challenges to this user. On their first login with Firebase phone auth,
-- the firebase_uid will be populated and they can access their pre-assigned challenges.
