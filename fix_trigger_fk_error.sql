-- ─────────────────────────────────────────────────────────────────────────────
-- Fixed Trigger - Removes Invalid Default trader_id
-- Run this in Supabase SQL Editor
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Drop old trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;

-- 2. Create corrected function (trader_id defaults to NULL, not fake UUID)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  -- Insert into public.users (trader_id can be NULL initially)
  INSERT INTO public.users (id, email, full_name, role, trader_id)
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data->>'full_name', ''),
    'student',
    (new.raw_user_meta_data->>'trader_id')::uuid  -- Will be NULL if not provided
  );

  -- Insert into payment_status (defaults to trial)
  INSERT INTO public.payment_status (user_id, subscription_status)
  VALUES (new.id, 'trial');

  -- Insert into risk_profiles with defaults
  INSERT INTO public.risk_profiles (
    user_id, 
    aggressiveness, 
    max_lot, 
    max_drawdown, 
    min_balance
  )
  VALUES (new.id, 1.0, 0.10, 20.0, 100.0);

  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Re-create the trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
