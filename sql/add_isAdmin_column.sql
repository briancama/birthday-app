-- Add isAdmin column to users table
ALTER TABLE users
ADD COLUMN isAdmin boolean NOT NULL DEFAULT false;

-- Optional: set admin for a specific user (example: brianc)
UPDATE users SET isAdmin = true WHERE username = 'brianc';
