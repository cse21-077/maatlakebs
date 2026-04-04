-- ─────────────────────────────────────────────────────────────────────────────
-- Check All RLS Policies on Public Schema
-- Run this in Supabase SQL Editor to see what RLS is blocking
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Check if RLS is enabled on tables
SELECT 
  schemaname,
  tablename,
  rowsecurity as "RLS_Enabled"
FROM pg_tables 
WHERE schemaname = 'public'
ORDER BY tablename;

-- 2. List all RLS policies
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  qual as "USING_Clause",
  with_check as "WITH_CHECK_Clause"
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- 3. Specifically check users/public_users table RLS
SELECT 
  policyname,
  permissive,
  roles,
  qual as "USING_Clause",
  with_check as "WITH_CHECK_Clause"
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'users'
ORDER BY policyname;

-- 4. Check if authenticated users can insert
SELECT 
  policyname,
  permissive,
  'INSERT' as operation
FROM pg_policies
WHERE schemaname = 'public' 
  AND tablename = 'users'
  AND (operation & 8) > 0;  -- 8 = INSERT operation
