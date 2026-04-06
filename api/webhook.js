import crypto from 'crypto';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const signature = req.headers['nowpayments-signature'];

    if (!signature) {
      return res.status(401).json({ error: 'Missing signature' });
    }

    // Verify webhook signature
    const ipnSecret = process.env.NOW_PAYMENTS_IPN_SECRET;
    const payload = JSON.stringify(req.body);
    const hash = crypto
      .createHmac('sha512', ipnSecret)
      .update(payload)
      .digest('hex');

    if (hash !== signature) {
      console.error('Invalid webhook signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const {
      invoice_id,
      payment_status,
      actually_paid,
      pay_currency,
      price_amount,
      price_currency,
    } = req.body;

    console.log('Webhook received:', { invoice_id, payment_status, actually_paid });

    if (payment_status === 'finished') {
      // Get user_id from invoice metadata in Supabase
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
        console.error('Invoice lookup error:', invoiceError);
        return res.status(500).json({ error: 'Invoice not found' });
      }

      const userId = invoiceData.user_id;
      const subscriptionPlan = invoiceData.subscription_plan;

      // 2. Update invoice status in database
      const { error: updateError } = await supabase
        .from('invoices')
        .update({
          payment_status: 'CONFIRMED',
          paid_for_month: new Date().toISOString(),
        })
        .eq('invoice_id', invoice_id);

      if (updateError) {
        console.error('Invoice update error:', updateError);
        return res.status(500).json({ error: 'Failed to update invoice' });
      }

      // 3. Update payment_status table: mark as active, set next_due to 1 month from now
      const nextDue = new Date();
      nextDue.setMonth(nextDue.getMonth() + 1);

      const { error: paymentStatusError } = await supabase
        .from('payment_status')
        .update({
          subscription_status: 'active',
          last_paid: new Date().toISOString(),
          next_due: nextDue.toISOString(),
          amount_paid: price_amount,
          currency: price_currency,
        })
        .eq('user_id', userId);

      if (paymentStatusError) {
        console.error('Payment status update error:', paymentStatusError);
        return res.status(500).json({ error: 'Failed to update payment status' });
      }

      console.log('Payment confirmed for user:', userId, 'Payment status: active, Next due:', nextDue.toISOString());
    }

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Webhook handler error:', error);
    res.status(500).json({ error: error.message });
  }
}
