-- ── Push Subscriptions Table ──────────────────────────────────────────────
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
    user_id   UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    subscription TEXT NOT NULL,         -- JSON string of PushSubscription
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS: users can only upsert their own subscription
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "push_subscriptions_upsert_own"
ON public.push_subscriptions
FOR ALL
TO public
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Service role (used by /api/send-push) bypasses RLS automatically
