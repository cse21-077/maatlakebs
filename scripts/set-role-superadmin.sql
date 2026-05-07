-- ============================================================
-- Set a user as SUPER ADMIN (full admin dashboard access:
-- view all students, accounts, payments, mark-as-paid, etc.)
-- Replace the UUID below with the actual user's ID
-- ============================================================

UPDATE public.users
SET role = 'super_admin',
    updated_at = NOW()
WHERE id = 'PASTE-USER-ID-HERE';

-- Verify the change
SELECT id, email, full_name, role, updated_at
FROM public.users
WHERE id = 'PASTE-USER-ID-HERE';
