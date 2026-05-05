-- ─────────────────────────────────────────────────────────────────────────────
-- FINAL PRODUCTION TRIGGER v4 - Safe with Explicit Enum Cast
-- Run this in Supabase SQL Editor
-- ─────────────────────────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  v_trader_id uuid := NULL;
BEGIN
  -- 1. METADATA SAFETY BLOCK: Handle missing/invalid trader_id
  IF (new.raw_user_meta_data ->> 'trader_id') IS NOT NULL THEN
    BEGIN
      v_trader_id := (new.raw_user_meta_data ->> 'trader_id')::uuid;
    EXCEPTION WHEN OTHERS THEN
      v_trader_id := NULL;
    END;
  END IF;

  -- 2. INSERT INTO users with explicit ENUM cast for role
  INSERT INTO public.users (id, email, full_name, role, trader_id)
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data ->> 'full_name', ''),
    'student'::public.user_role,
    v_trader_id
  )
  ON CONFLICT (id) DO NOTHING;

  -- 3. INSERT INTO payment_status with conflict protection
  INSERT INTO public.payment_status (user_id, subscription_status)
  VALUES (new.id, 'trial'::public.subscription_status)
  ON CONFLICT (user_id) DO NOTHING;

  -- 4. INSERT INTO risk_profiles with conflict protection
  INSERT INTO public.risk_profiles (
    user_id, 
    aggressiveness, 
    max_lot, 
    max_drawdown, 
    min_balance,
    advanced_options
  )
  VALUES (new.id, 1.0, 50.0, 100.0, 1.0, '{"settings_locked": true}'::jsonb)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN new;

EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'Error in handle_new_user for user %: %', new.id, SQLERRM;
  RAISE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create the trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Verification
SELECT 'Trigger created successfully!' as status;
