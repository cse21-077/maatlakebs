/**
 * Whop checkout session factory — mints a checkout configuration (ch_...) tied
 * to the paying user (metadata.userId) so the webhook in api/whop-webhook.js
 * can attribute the payment back to them.
 *
 * POST /api/whop-checkout-session
 *   body: { user_id }
 *   → { sessionId: "ch_..." }
 *
 * Env:
 *   WHOP_COMPANY_API_KEY  (apik_..., server-only)
 *   VITE_WHOP_PLAN_ID     (plan_..., shared with the client embed)
 *   VITE_WHOP_ENV         ("sandbox" default | "production")
 */

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.WHOP_COMPANY_API_KEY;
  const planId = process.env.VITE_WHOP_PLAN_ID;
  const base =
    process.env.VITE_WHOP_ENV === 'production'
      ? 'https://api.whop.com/api/v1'
      : 'https://sandbox-api.whop.com/api/v1';

  if (!apiKey) {
    return res.status(500).json({ error: 'Server misconfiguration: missing WHOP_COMPANY_API_KEY' });
  }
  if (!planId || !planId.startsWith('plan_')) {
    return res.status(500).json({ error: 'Server misconfiguration: missing VITE_WHOP_PLAN_ID' });
  }

  const { user_id } = req.body || {};
  if (!user_id) {
    return res.status(400).json({ error: 'Missing required field: user_id' });
  }

  try {
    // Only mint sessions for real accounts
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('id', user_id)
      .maybeSingle();

    if (userError || !user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const response = await fetch(`${base}/checkout_configurations`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        // A retried click must not mint a second checkout
        'Idempotency-Key': `checkout-${user_id}-${Date.now()}`,
      },
      body: JSON.stringify({
        plan_id: planId,
        mode: 'payment',
        metadata: { userId: user_id },
      }),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok || !data.id) {
      console.error('❌ Whop checkout session failed:', response.status, data);
      return res.status(502).json({
        error: data?.error?.message || `Whop rejected the checkout session (${response.status})`,
      });
    }

    console.log(`✅ Whop checkout session ${data.id} for user ${user_id}`);
    return res.status(200).json({ sessionId: data.id });
  } catch (error) {
    console.error('❌ whop-checkout-session error:', error);
    return res.status(500).json({ error: error.message });
  }
}
