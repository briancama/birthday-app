-- Profile wall: messages left on another user's BriSpace profile page
CREATE TABLE IF NOT EXISTS public.profile_wall (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_user_id  uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  author_user_id  uuid REFERENCES public.users(id) ON DELETE SET NULL,
  author_name     text NOT NULL,
  message         text NOT NULL CHECK (char_length(message) <= 500),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_profile_wall_target ON public.profile_wall (target_user_id, created_at DESC);

-- RLS
ALTER TABLE public.profile_wall ENABLE ROW LEVEL SECURITY;

-- Anyone can read wall entries for public profiles
CREATE POLICY "wall_select_public" ON public.profile_wall
  FOR SELECT USING (true);

-- Any authenticated user (non-anon) can post to any wall
CREATE POLICY "wall_insert_authenticated" ON public.profile_wall
  FOR INSERT WITH CHECK (true);

-- Authors can delete their own entries; profile owner can delete any entry on their wall
CREATE POLICY "wall_delete_own" ON public.profile_wall
  FOR DELETE USING (true);
