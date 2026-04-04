-- ─────────────────────────────────────────────────────────────────────────────
-- Add Missing INSERT Policy for User Registration
-- Run this in Supabase SQL Editor
-- ─────────────────────────────────────────────────────────────────────────────

-- Allow authenticated users to insert their own profile
CREATE POLICY "users_insert_own" ON public.users
  FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Verify the policy was created
SELECT policyname, operation 
FROM pg_policies 
WHERE schemaname = 'public' AND tablename = 'users' 
ORDER BY policyname;
