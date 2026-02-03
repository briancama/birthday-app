-- Add tracking columns to assignments table for optimistic locking
-- These columns support the new AssignmentService functionality

-- Add updated_at and updated_by columns if they don't exist
DO $$ 
BEGIN
  -- Add updated_at column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'assignments' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE assignments ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
  END IF;
  
  -- Add updated_by column  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'assignments' AND column_name = 'updated_by'
  ) THEN
    ALTER TABLE assignments ADD COLUMN updated_by UUID;
  END IF;
END $$;

-- Update existing records to have updated_at = assigned_at for consistency
UPDATE assignments 
SET updated_at = assigned_at 
WHERE updated_at IS NULL;

-- Make updated_at NOT NULL after backfilling
ALTER TABLE assignments ALTER COLUMN updated_at SET NOT NULL;

-- Add foreign key constraint for updated_by
ALTER TABLE assignments 
ADD CONSTRAINT fk_assignments_updated_by 
FOREIGN KEY (updated_by) REFERENCES users(id);

-- Create index for efficient queries
CREATE INDEX IF NOT EXISTS idx_assignments_updated_tracking 
ON assignments(challenge_id, updated_at, updated_by);