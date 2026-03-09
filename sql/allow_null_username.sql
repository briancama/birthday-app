-- Allow username to be NULL so new visitor accounts can be created before onboarding
ALTER TABLE public.users ALTER COLUMN username DROP NOT NULL;
