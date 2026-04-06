import crypto from 'crypto';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const signature = req.headers['nowpayments-signature'];

    if (!signature) {
      console.warn('Missing signature header in webhook');
      return res.status(401).json({ error: 'Missing signature' });
    }

    // Verify webhook signature
    const ipnSecret = process.env.NOW_PAYMENTS_IPN_SECRET;
    if (!ipnSecret) {
      console.error('NOW_PAYMENTS_IPN_SECRET not configured');
      return res.status(500).json({ error: 'Server configuration error' });
    }

    const payload = JSON.stringify(req.body);
    const hash = crypto
      .createHmac('sha512', ipnSecret)
      .update(payload)
      .digest('hex');

    if (hash !== signature) {
      console.error('Invalid webhook signature - rejected');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    console.log('✅ Webhook signature verified');

    const {
      invoice_id,
      payment_status,
      price_amount,
      price_currency,
      pay_currency,
      order_id,
    } = req.body;

    console.log('Webhook payload:', {
      invoice_id,
      payment_status,
      price_amount,
      price_currency,
      pay_currency,
    });

    // Only process completed payments
    if (payment_status !== 'finished') {
      console.log(`Payment status '${payment_status}' - not processing (waiting for 'finished')`);
      return res.status(200).json({ success: true, message: 'Not a completed payment' });
    }

    console.log('🔄 Processing completed payment...');

    // Initialize Supabase client
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.VITE_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );

    // 1. Get user_id and subscription plan from invoice
    const { data: invoiceData, error: invoiceError } = await supabase
      .from('invoices')
      .select('user_id, subscription_plan')
      .eq('invoice_id', invoice_id)
      .single();

    if (invoiceError || !invoiceData) {
      console.error('❌ Invoice lookup failed:', invoiceError?.message);
      return res.status(404).json({ error: 'Invoice not found' });
    }

    const userId = invoiceData.user_id;
    console.log('📌 Found invoice for user:', userId);

    // 2. Update invoice status to CONFIRMED
    const { error: updateInvoiceError } = await supabase
      .from('invoices')
      .update({
        payment_status: 'CONFIRMED',
        paid_for_month: new Date().toISOString(),
      })
      .eq('invoice_id', invoice_id);

    if (updateInvoiceError) {
      console.error('❌ Failed to update invoice:', updateInvoiceError.message);
      return res.status(500).json({ error: 'Failed to update invoice' });
    }

    console.log('✅ Invoice marked as CONFIRMED');

    // 3. Update payment_status table: activate subscription + set next billing date
    const nextDue = new Date();
    nextDue.setMonth(nextDue.getMonth() + 1);

    const { error: updatePaymentError } = await supabase
      .from('payment_status')
      .update({
        subscription_status: 'active',
        last_paid: new Date().toISOString(),
        next_due: nextDue.toISOString(),
        amount_paid: price_amount,
        currency: price_currency,
      })
      .eq('user_id', userId);

    if (updatePaymentError) {
      console.error('❌ Failed to update payment_status:', updatePaymentError.message);
      return res.status(500).json({ error: 'Failed to activate subscription' });
    }

    console.log('✅ Subscription activated for user:', userId);
    console.log('📅 Next billing date:', nextDue.toISOString());

    // Success!
    res.status(200).json({
      success: true,
      message: 'Payment confirmed and subscription activated',
      user_id: userId,
      invoice_id: invoice_id,
    });

  } catch (error) {
    console.error('❌ Webhook handler error:', error);
    res.status(500).json({
      error: error.message,
      details: 'Internal server error processing webhook',
    });
  }
}
