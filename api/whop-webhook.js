/**
 * Whop webhook — auto-activates subscriptions for successful Whop payments, so
 * paying through the embedded checkout never needs the manual admin approve
 * step (that step remains only for uploaded proof-of-payment).
 *
 * Endpoint: POST /api/whop-webhook
 * Subscribe (sandbox.whop.com → Developer → Webhooks, API version v1):
 *   payment_succeeded, payment_failed
 *
 * Env:
 *   WHOP_WEBHOOK_SECRET  (ws_..., exactly as Whop shows it)
 *   VITE_WHOP_PLAN_ID    (optional guard — payments for other plans are ignored)
 */

const SUBSCRIPTION_PLAN = 'active';
const ORIGINAL_PRICE = 150;
const DISCOUNT_AMOUNT = 50;

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

export default async function handler(req, res) {
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
  const planId = data?.plan_id || data?.plan?.id;
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
