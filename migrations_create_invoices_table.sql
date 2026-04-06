-- ─────────────────────────────────────────────────────────────────────────────
-- NowPayments Invoice Tracking Table
-- Run this in Supabase SQL Editor
-- ─────────────────────────────────────────────────────────────────────────────

-- Create invoices table
CREATE TABLE public.invoices (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  
  -- Invoice details from NowPayments
  invoice_id TEXT NOT NULL UNIQUE,
  order_id TEXT NOT NULL,
  payment_url TEXT NOT NULL,
  
  -- Amount and currency
  price_amount DECIMAL NOT NULL,
  price_currency VARCHAR(10) DEFAULT 'usd',
  paid_amount DECIMAL DEFAULT 0,
  paid_currency VARCHAR(10),
  
  -- Payment tracking
  payment_status VARCHAR(50) DEFAULT 'pending',
  payment_address TEXT,
  payment_method VARCHAR(10),
  
  -- Subscription
  subscription_plan VARCHAR(50) NOT NULL,
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP DEFAULT (NOW() + INTERVAL '15 minutes'),
  paid_at TIMESTAMP,
  
  -- Meta
  metadata JSONB DEFAULT '{}',
  
  -- Indexes
  INDEX idx_user_id (user_id),
  INDEX idx_invoice_id (invoice_id),
  INDEX idx_payment_status (payment_status),
  INDEX idx_created_at (created_at)
);

-- Enable RLS
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "invoices_select_own" ON public.invoices
  FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "invoices_insert_own" ON public.invoices
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "invoices_update_own" ON public.invoices
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Index for faster queries
CREATE INDEX idx_invoices_user_status ON public.invoices(user_id, payment_status);
CREATE INDEX idx_invoices_expires ON public.invoices(expires_at) 
  WHERE payment_status = 'pending';

-- Optional: Cleanup expired invoices
CREATE OR REPLACE FUNCTION public.cleanup_expired_invoices()
RETURNS void AS $$
BEGIN
  DELETE FROM public.invoices 
  WHERE payment_status = 'pending' 
    AND expires_at < NOW()
    AND created_at < NOW() - INTERVAL '1 hour';
END;
$$ LANGUAGE plpgsql;

-- Run cleanup daily (optional)
-- SCHEDULE: SELECT cron.schedule('cleanup-invoices', '0 0 * * *', 'SELECT public.cleanup_expired_invoices()');
