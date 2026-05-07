-- ============================================================
-- Set a user as TECH SUPPORT (receives in-app help/chat tickets)
-- Replace the UUID below with the actual user's ID
-- ============================================================

UPDATE public.users
SET role = 'techsupport',
    updated_at = NOW()
WHERE id = 'PASTE-USER-ID-HERE';

-- Verify the change
SELECT id, email, full_name, role, updated_at
FROM public.users
WHERE id = 'PASTE-USER-ID-HERE';
