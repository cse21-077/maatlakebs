-- ─────────────────────────────────────────────────────────────────────────────
-- Fixed Trigger v3 - Handle Retries with ON CONFLICT
-- Run this in Supabase SQL Editor
-- ─────────────────────────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  v_trader_id uuid;
BEGIN
  -- Safely extract trader_id
  v_trader_id := NULL;
  IF (new.raw_user_meta_data ->> 'trader_id') IS NOT NULL THEN
    BEGIN
      v_trader_id := (new.raw_user_meta_data ->> 'trader_id')::uuid;
    EXCEPTION WHEN OTHERS THEN
      v_trader_id := NULL;
    END;
  END IF;

  -- Insert into public.users (ignore if already exists)
  INSERT INTO public.users (id, email, full_name, role, trader_id)
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data ->> 'full_name', ''),
    'student',
    v_trader_id
  )
  ON CONFLICT (id) DO NOTHING;

  -- Insert into payment_status (ignore if already exists)
  INSERT INTO public.payment_status (user_id, subscription_status)
  VALUES (new.id, 'trial')
  ON CONFLICT (user_id) DO NOTHING;

  -- Insert into risk_profiles (ignore if already exists)
  INSERT INTO public.risk_profiles (
    user_id, 
    aggressiveness, 
    max_lot, 
    max_drawdown, 
    min_balance
  )
  VALUES (new.id, 1.0, 0.10, 20.0, 100.0)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN new;
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'Error in handle_new_user for user %: %', new.id, SQLERRM;
  RAISE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
