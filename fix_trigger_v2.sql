-- ─────────────────────────────────────────────────────────────────────────────
-- Fixed Trigger v2 - Proper NULL Handling for trader_id
-- Run this in Supabase SQL Editor
-- ─────────────────────────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  v_trader_id uuid;
BEGIN
  -- Safely extract trader_id, defaulting to NULL
  v_trader_id := NULL;
  IF (new.raw_user_meta_data ->> 'trader_id') IS NOT NULL THEN
    BEGIN
      v_trader_id := (new.raw_user_meta_data ->> 'trader_id')::uuid;
    EXCEPTION WHEN OTHERS THEN
      v_trader_id := NULL;
    END;
  END IF;

  -- Insert into public.users
  INSERT INTO public.users (id, email, full_name, role, trader_id)
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data ->> 'full_name', ''),
    'student',
    v_trader_id
  );

  -- Insert into payment_status
  INSERT INTO public.payment_status (user_id, subscription_status)
  VALUES (new.id, 'trial');

  -- Insert into risk_profiles
  INSERT INTO public.risk_profiles (
    user_id, 
    aggressiveness, 
    max_lot, 
    max_drawdown, 
    min_balance
  )
  VALUES (new.id, 1.0, 0.10, 20.0, 100.0);

  RETURN new;
EXCEPTION WHEN OTHERS THEN
  -- Log the error and re-raise
  RAISE LOG 'Error in handle_new_user for user %: %', new.id, SQLERRM;
  RAISE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Test the function
SELECT 'Trigger created successfully' as status;
