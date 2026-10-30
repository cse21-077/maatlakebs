/**
 * Whop payments — both Whop endpoints live in ONE function to stay within the
 * Vercel Hobby limit of 12 serverless functions. Public URLs are preserved via
 * vercel.json rewrites:
 *
 *   POST /api/whop-checkout-session  →  /api/whop?route=session
 *   POST /api/whop-webhook           →  /api/whop?route=webhook
 *
 * route=session  — mints a Whop checkout configuration (ch_...) tagged with the
 *                  paying user's id (metadata.userId) for the client embed.
 * route=webhook  — verifies the Standard Webhooks signature and auto-activates
 *                  the subscription on payment.succeeded.
 *
 * Env:
 *   WHOP_COMPANY_API_KEY  (apik_..., server-only)
 *   WHOP_WEBHOOK_SECRET   (ws_..., server-only)
 *   VITE_WHOP_PLAN_ID     (plan_..., shared with the client embed)
 *   VITE_WHOP_ENV         ("sandbox" default | "production")
 */

const SUBSCRIPTION_PLAN = 'active';
const ORIGINAL_PRICE = 150;
const DISCOUNT_AMOUNT = 50;

// ── Route dispatch ────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  const url = req.url || '';
  const route =
    req.query?.route ||
    (url.includes('whop-webhook') ? 'webhook' : '') ||
    (url.includes('whop-checkout-session') ? 'session' : '');

  if (route === 'session') return sessionHandler(req, res);
  if (route === 'webhook') return webhookHandler(req, res);
  return res.status(404).json({ error: 'Unknown route. Use /api/whop-checkout-session or /api/whop-webhook' });
}

// ── route=session ─────────────────────────────────────────────────────────────
async function sessionHandler(req, res) {
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
        variant_id: planId,
        mode: 'payment',
        metadata: { userId: user_id },
      }),
    });

    const config = await response.json().catch(() => ({}));

    if (!response.ok || !config.id) {
      console.error('❌ Whop checkout configuration failed:', response.status, config);
      return res.status(502).json({
        error: config?.error?.message || `Whop rejected the checkout configuration (${response.status})`,
      });
    }

    // The embed renders a checkout SESSION (chs_...), minted from the
    // configuration — passing the configuration id (ch_...) makes Whop show
    // "this checkout is no longer available".
    const sessionResponse = await fetch(`${base}/checkout_sessions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ checkout_configuration: config.id }),
    });

    const session = await sessionResponse.json().catch(() => ({}));

    if (!sessionResponse.ok || !session.id) {
      console.error('❌ Whop checkout session failed:', sessionResponse.status, session);
      return res.status(502).json({
        error: session?.error?.message || `Whop rejected the checkout session (${sessionResponse.status})`,
      });
    }

    console.log(`✅ Whop checkout session ${session.id} for user ${user_id}`);
    return res.status(200).json({ sessionId: session.id });
  } catch (error) {
    console.error('❌ whop-checkout-session error:', error);
    return res.status(500).json({ error: error.message });
  }
}

// ── route=webhook ─────────────────────────────────────────────────────────────
async function readRawBody(req) {
  // Signature covers the exact bytes Whop sent. Read the stream when it is
  // still intact; fall back to re-serializing if the host pre-parsed the body.
  if (typeof req.on === 'function') {
    const chunks = [];
    try {
      for await (const chunk of req) chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
      const raw = Buffer.concat(chunks).toString('utf8');
      if (raw) return raw;
    } catch {
      // fall through to req.body
    }
  }
  return JSON.stringify(req.body || {});
}

async function webhookHandler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const secret = process.env.WHOP_WEBHOOK_SECRET;
  if (!secret) {
    console.error('❌ WHOP_WEBHOOK_SECRET is not configured');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  const rawBody = await readRawBody(req);
  const headers = {};
  for (const [k, v] of Object.entries(req.headers || {})) headers[k.toLowerCase()] = Array.isArray(v) ? v.join(', ') : String(v);

  let event;
  try {
    const { unwrapWebhook } = await import('@whop/sdk/helpers');
    event = unwrapWebhook(rawBody, { headers, key: secret });
  } catch (err) {
    console.error('❌ Whop webhook signature verification failed:', err.message);
    return res.status(401).json({ error: 'Invalid signature' });
  }

  const { type, id: deliveryId, data } = event;
  console.log(`📨 Whop webhook [${deliveryId}]: ${type}`);

  if (type !== 'payment.succeeded') {
    if (type === 'payment.failed') {
      console.warn(`⚠️  Whop payment failed: ${data?.id}`);
    }
    return res.status(200).json({ received: true, outcome: 'ignored', type });
  }

  const paymentId = data?.id;
  const userId = data?.metadata?.userId;
  const planId = data?.plan_id || data?.variant_id || data?.plan?.id || data?.variant?.id;
  const expectedPlan = process.env.VITE_WHOP_PLAN_ID;

  if (!paymentId || !paymentId.startsWith('pay_')) {
    return res.status(200).json({ received: true, outcome: 'ignored', reason: 'no payment id' });
  }
  if (expectedPlan && planId && planId !== expectedPlan) {
    return res.status(200).json({ received: true, outcome: 'ignored', reason: 'different plan' });
  }
  if (!userId) {
    console.error(`❌ Whop payment ${paymentId} has no metadata.userId — cannot attribute`);
    return res.status(200).json({ received: true, outcome: 'ignored', reason: 'no userId in metadata' });
  }

  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

  try {
    // Idempotency: the invoice row keyed by the Whop payment id is our
    // processed-deliveries ledger — replays and dashboard re-sends skip here.
    const { data: existing } = await supabase
      .from('invoices')
      .select('id')
      .eq('invoice_id', paymentId)
      .limit(1);

    if (existing && existing.length > 0) {
      return res.status(200).json({ received: true, outcome: 'already_processed', paymentId });
    }

    const amount = Number(data?.final_amount ?? data?.amount ?? 100);
    const currency = String(data?.currency || 'usd').toLowerCase();

    // Record the paid invoice (mirrors an approved proof invoice)
    const { error: invoiceError } = await supabase.from('invoices').insert({
      user_id: userId,
      invoice_id: paymentId,
      price_amount: amount,
      price_currency: currency,
      subscription_plan: SUBSCRIPTION_PLAN,
      payment_method: 'whop',
      payment_status: 'confirmed',
      original_price: ORIGINAL_PRICE,
      discount_amount: DISCOUNT_AMOUNT,
    });
    if (invoiceError) throw new Error(`invoice insert failed: ${invoiceError.message}`);

    // Activate 30-day subscription (mirrors the admin approve flow)
    const nextDue = new Date();
    nextDue.setDate(nextDue.getDate() + 30);

    const { data: existingStatus } = await supabase
      .from('payment_status')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle();

    const statusPayload = {
      subscription_status: SUBSCRIPTION_PLAN,
      last_paid: new Date().toISOString(),
      next_due: nextDue.toISOString(),
      amount_paid: amount,
      currency,
      updated_at: new Date().toISOString(),
    };

    const { error: statusError } = existingStatus
      ? await supabase.from('payment_status').update(statusPayload).eq('user_id', userId)
      : await supabase.from('payment_status').insert({ user_id: userId, ...statusPayload });

    if (statusError) throw new Error(`payment_status upsert failed: ${statusError.message}`);

    console.log(`✅ Whop payment ${paymentId} activated subscription for ${userId}`);
    return res.status(200).json({ received: true, outcome: 'activated', userId, paymentId });
  } catch (err) {
    // 500 so Whop retries the delivery — the idempotency check makes it safe
    console.error('❌ Whop webhook processing failed:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
