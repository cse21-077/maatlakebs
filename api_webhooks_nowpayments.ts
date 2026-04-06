// API Route: /api/webhooks/nowpayments
// This handles IPN (Instant Payment Notifications) from NowPayments

import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // Use server-side secret key
);

interface PaymentWebhook {
  payment_id: number;
  invoice_id?: string;
  order_id?: string;
  payment_status: string;
  pay_address: string;
  price_amount: number;
  price_currency: string;
  pay_amount: number;
  pay_currency: string;
  actually_paid: number;
}

/**
 * Verify IPN signature from NowPayments
 */
function verifyIPNSignature(
  payload: Record<string, any>,
  signature: string,
  secret: string
): boolean {
  // Sort keys and stringify
  const sorted = Object.keys(payload)
    .sort()
    .reduce((result: Record<string, any>, key: string) => {
      result[key] = payload[key];
      return result;
    }, {});

  const message = JSON.stringify(sorted);
  const hmac = crypto.createHmac('sha512', secret);
  hmac.update(message);
  const calculatedSignature = hmac.digest('hex');

  return calculatedSignature === signature;
}

/**
 * Update subscription based on payment
 */
async function updateSubscription(
  userId: string,
  invoiceId: string,
  status: string
) {
  // Get invoice to find subscription plan
  const { data: invoice } = await supabaseAdmin
    .from('invoices')
    .select('subscription_plan')
    .eq('invoice_id', invoiceId)
    .single();

  if (!invoice) return;

  // Map payment status to subscription status
  let subscriptionStatus = 'active';
  if (status === 'finished' || status === 'confirmed') {
    subscriptionStatus = invoice.subscription_plan;
  } else if (status === 'failed' || status === 'expired') {
    subscriptionStatus = 'cancelled';
  }

  // Update payment_status
  await supabaseAdmin
    .from('payment_status')
    .upsert({
      user_id: userId,
      subscription_status: subscriptionStatus,
      last_paid: status === 'finished' ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    });
}

/**
 * POST /api/webhooks/nowpayments
 */
export async function POST(req: Request) {
  try {
    // Get signature from header
    const signature = req.headers.get('x-nowpayments-sig');
    if (!signature) {
      return new Response(
        JSON.stringify({ error: 'Missing signature header' }),
        { status: 401 }
      );
    }

    // Parse payload
    const payload = await req.json();

    // Verify signature
    const isValid = verifyIPNSignature(
      payload,
      signature,
      process.env.VITE_NOW_PAYMENTS_IPN_SECRET!
    );

    if (!isValid) {
      console.error('Invalid IPN signature');
      return new Response(
        JSON.stringify({ error: 'Invalid signature' }),
        { status: 401 }
      );
    }

    const webhook = payload as PaymentWebhook;

    // Find invoice by invoice_id or order_id
    let invoiceQuery = supabaseAdmin.from('invoices').select('*');
    
    if (webhook.invoice_id) {
      invoiceQuery = invoiceQuery.eq('invoice_id', webhook.invoice_id);
    } else if (webhook.order_id) {
      invoiceQuery = invoiceQuery.eq('order_id', webhook.order_id);
    } else {
      return new Response(
        JSON.stringify({ error: 'Missing invoice or order ID' }),
        { status: 400 }
      );
    }

    const { data: invoices } = await invoiceQuery;

    if (!invoices || invoices.length === 0) {
      console.warn('Invoice not found:', webhook);
      return new Response(
        JSON.stringify({ error: 'Invoice not found' }),
        { status: 404 }
      );
    }

    const invoice = invoices[0];

    // Update invoice record
    await supabaseAdmin
      .from('invoices')
      .update({
        payment_status: webhook.payment_status,
        paid_amount: webhook.actually_paid,
        paid_currency: webhook.pay_currency,
        paid_at:
          webhook.payment_status === 'finished'
            ? new Date().toISOString()
            : null,
        metadata: {
          payment_id: webhook.payment_id,
          pay_address: webhook.pay_address,
          original_payload: webhook,
        },
      })
      .eq('id', invoice.id);

    // Update subscription if payment finished
    if (
      webhook.payment_status === 'finished' ||
      webhook.payment_status === 'confirmed'
    ) {
      await updateSubscription(
        invoice.user_id,
        webhook.invoice_id || webhook.order_id,
        webhook.payment_status
      );

      // Send confirmation email (optional)
      console.log(`✅ Payment confirmed for user: ${invoice.user_id}`);
    }

    // Log payment event
    await supabaseAdmin.from('system_events').insert({
      event_type: 'payment_received',
      actor_id: invoice.user_id,
      severity: 'info',
      payload: {
        invoice_id: invoice.id,
        payment_status: webhook.payment_status,
        amount: webhook.actually_paid,
      },
    });

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
    });
  } catch (error) {
    console.error('Webhook error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500 }
    );
  }
}
