# NowPayments Integration Setup Guide

## Step 1: Update Trigger (Conservative Defaults)

Run this SQL in Supabase SQL Editor:

```sql
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  v_trader_id uuid := NULL;
BEGIN
  IF (new.raw_user_meta_data ->> 'trader_id') IS NOT NULL THEN
    BEGIN
      v_trader_id := (new.raw_user_meta_data ->> 'trader_id')::uuid;
    EXCEPTION WHEN OTHERS THEN
      v_trader_id := NULL;
    END;
  END IF;

  INSERT INTO public.users (id, email, full_name, role, trader_id)
  VALUES (new.id, new.email, COALESCE(new.raw_user_meta_data ->> 'full_name', ''), 'student'::public.user_role, v_trader_id)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.payment_status (user_id, subscription_status)
  VALUES (new.id, 'trial'::public.subscription_status)
  ON CONFLICT (user_id) DO NOTHING;

  -- CONSERVATIVE defaults (users customize later)
  INSERT INTO public.risk_profiles (
    user_id, 
    aggressiveness,      -- 0.5 = conservative
    max_lot,             -- 0.05 = 5% per trade
    max_drawdown,        -- 10% (not 20%)
    min_balance          -- $5 minimum
  )
  VALUES (new.id, 0.5, 0.05, 10.0, 5.0)
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
```

## Step 2: Create Invoices Table

Run this SQL in Supabase SQL Editor:

```sql
CREATE TABLE public.invoices (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  invoice_id TEXT NOT NULL UNIQUE,
  order_id TEXT NOT NULL,
  payment_url TEXT NOT NULL,
  price_amount DECIMAL NOT NULL,
  price_currency VARCHAR(10) DEFAULT 'usd',
  paid_amount DECIMAL DEFAULT 0,
  paid_currency VARCHAR(10),
  payment_status VARCHAR(50) DEFAULT 'pending',
  payment_address TEXT,
  payment_method VARCHAR(10),
  subscription_plan VARCHAR(50) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP DEFAULT (NOW() + INTERVAL '15 minutes'),
  paid_at TIMESTAMP,
  metadata JSONB DEFAULT '{}',
  INDEX idx_user_id (user_id),
  INDEX idx_invoice_id (invoice_id),
  INDEX idx_payment_status (payment_status),
  INDEX idx_created_at (created_at)
);

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "invoices_select_own" ON public.invoices
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "invoices_insert_own" ON public.invoices
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "invoices_update_own" ON public.invoices
  FOR UPDATE USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
```

## Step 3: Get NowPayments API Keys

1. Go to https://account.nowpayments.io/
2. Sign up or login
3. Go to **Settings** → **API**
4. Generate API Key
5. Generate IPN Secret Key (save this carefully!)
6. Go to **Payment Settings** → set your payout wallet

## Step 4: Add Environment Variables

Add to your `.env` file:

```env
VITE_NOW_PAYMENTS_API_KEY=your_api_key_here
VITE_NOW_PAYMENTS_IPN_SECRET=your_ipn_secret_here
VITE_APP_URL=http://localhost:3000
VITE_BACKEND_URL=http://localhost:3001
```

For production:
```env
VITE_NOW_PAYMENTS_API_KEY=your_production_api_key
VITE_NOW_PAYMENTS_IPN_SECRET=your_production_ipn_secret
VITE_APP_URL=https://yourdomain.com
VITE_BACKEND_URL=https://api.yourdomain.com
```

## Step 5: Install Package

```bash
pnpm add axios crypto
```

## Step 6: Setup Webhook Endpoint

If using Vite + Express backend:

```bash
# Create backend folder
mkdir backend
cd backend
npm init -y
npm install express cors dotenv @supabase/supabase-js
```

Create `backend/routes/webhooks.ts` with the webhook handler code provided.

## Step 7: Use Payment Widget

In your component:

```tsx
import { PaymentWidget } from '@/components/PaymentWidget';

export function Dashboard() {
  const user = useAuthUser();
  const [plan, setPlan] = useState('trial');

  return (
    <div>
      <PaymentWidget 
        userId={user.id}
        currentPlan={plan}
        onPaymentSuccess={() => {
          setPlan('active');
          // Refresh user subscription
        }}
      />
    </div>
  );
}
```

## Step 8: Configure IPN Webhook in NowPayments Dashboard

1. Go to https://account.nowpayments.io/settings/payment-settings
2. Find "Webhook URL" or "IPN Callback"
3. Set it to: `https://yourdomain.com/api/webhooks/nowpayments`
4. For localhost testing: You'll need ngrok or similar tunnel

## Step 9: Test Payment Flow

```bash
# Terminal 1: Run app
pnpm run dev

# Terminal 2: Run backend (if separate)
npm run dev

# Visit http://localhost:3000
# Click "Proceed to Payment"
# Testing: Use NowPayments test mode API key
```

## Payment Flow Summary

1. **User signs up** → Conservative risk profile created (0.5 aggressiveness, $5 min_balance)
2. **User customizes settings** → Updates risk_profiles table
3. **User upgrades plan** → Clicks "Proceed to Payment"
4. **Creates invoice** → NowPayments creates payment link
5. **User sends crypto** → NowPayments processes payment
6. **IPN webhook fires** → Updates subscription status
7. **User gains access** → Material features unlocked

## Pricing Plans

- **Trial**: Free, 7 days, 1 mentor, basic features
- **Active**: $9.99/month, 3 mentors, advanced risk controls
- **Pro**: $29.99/month, unlimited mentors, full features

## Notes

- `min_balance` = $5 USD (users can customize)
- `aggressiveness` = 0.5 (conservative, not risky)
- `max_lot` = 5% per trade (not 10%)
- `max_drawdown` = 10% (users customize)
- Users can adjust all settings after signup
