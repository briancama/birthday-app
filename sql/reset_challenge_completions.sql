-- Reset Challenge Completion Status
-- WARNING: This will clear all challenge completion data!

-- Option 1: Reset ALL challenges for ALL users
UPDATE assignments
SET completed_at = NULL,
    outcome = NULL
WHERE active = true;

-- Option 2: Reset challenges for a specific user (replace 'username' with actual username)
-- UPDATE assignments
-- SET completed_at = NULL,
--     outcome = NULL
-- WHERE user_id = (SELECT id FROM users WHERE username = 'username')
-- AND active = true;

-- Option 3: Reset only successful completions (keep failures)
-- UPDATE assignments
-- SET completed_at = NULL,
--     outcome = NULL
-- WHERE outcome = 'success'
-- AND active = true;

-- Option 4: Reset challenges but keep the last N days of progress
-- UPDATE assignments
-- SET completed_at = NULL,
--     outcome = NULL
-- WHERE completed_at < NOW() - INTERVAL '7 days'
-- AND active = true;

-- Verify the reset (check remaining completed challenges)
-- SELECT COUNT(*) as completed_challenges 
-- FROM assignments 
-- WHERE completed_at IS NOT NULL 
-- AND active = true;
