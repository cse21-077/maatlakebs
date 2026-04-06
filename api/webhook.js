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

      // Update invoice status in database
      const { data, error } = await supabase
        .from('invoices')
        .update({
          payment_status: 'CONFIRMED',
          actually_paid: actually_paid,
          pay_currency: pay_currency,
        })
        .eq('invoice_id', invoice_id);

      if (error) {
        console.error('Database update error:', error);
        return res.status(500).json({ error: 'Failed to update database' });
      }

      // Optionally update user subscription status
      const invoiceData = await supabase
        .from('invoices')
        .select('user_id, subscription_plan')
        .eq('invoice_id', invoice_id)
        .single();

      if (invoiceData.data) {
        await supabase
          .from('profiles')
          .update({
            subscription_status: 'active',
            subscription_plan: invoiceData.data.subscription_plan,
          })
          .eq('id', invoiceData.data.user_id);
      }
    }

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Webhook handler error:', error);
    res.status(500).json({ error: error.message });
  }
}
