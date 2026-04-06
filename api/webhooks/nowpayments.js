import crypto from 'crypto';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Log all headers for debugging
    console.log('📨 Webhook headers received:', Object.keys(req.headers));
    console.log('📨 Full headers:', req.headers);

    // Get signature from header (NowPayments uses x-nowpayments-sig)
    let signature = req.headers['x-nowpayments-sig'];

    if (!signature) {
      console.warn('⚠️ Missing signature header x-nowpayments-sig');
      console.log('📦 Webhook body received:', req.body);
      console.warn('⚠️ Proceeding without signature verification (dev mode)');
    } else {
      console.log('✅ Signature found:', signature.substring(0, 20) + '...');
    }

    // Verify webhook signature (only if present)
    if (signature) {
      const ipnSecret = process.env.NOW_PAYMENTS_IPN_SECRET;
      if (!ipnSecret) {
        console.error('❌ NOW_PAYMENTS_IPN_SECRET not configured');
        return res.status(500).json({ error: 'Server configuration error' });
      }

      // NowPayments sorts payload keys before hashing
      const sortedPayload = JSON.stringify(
        Object.keys(req.body).sort().reduce((acc, key) => {
          acc[key] = req.body[key];
          return acc;
        }, {})
      );
      
      const hash = crypto
        .createHmac('sha512', ipnSecret)
        .update(sortedPayload)
        .digest('hex');

      if (hash !== signature) {
        console.error('❌ Invalid webhook signature - rejected');
        return res.status(401).json({ error: 'Invalid signature' });
      }

      console.log('✅ Webhook signature verified');
    } else {
      console.warn('⚠️ Proceeding WITHOUT signature verification (check if NowPayments is sending signature)');
    }

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
    // NowPayments sends invoice_id as number, but convert to string for lookup
    const { data: invoiceData, error: invoiceError } = await supabase
      .from('invoices')
      .select('user_id, subscription_plan')
      .eq('invoice_id', String(invoice_id))
      .single();

    if (invoiceError || !invoiceData) {
      console.error('❌ Invoice lookup failed:', invoiceError?.message);
      console.error('📌 Searched for invoice_id:', String(invoice_id));
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
        .eq('invoice_id', String(invoice_id));

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

    // 4. Provision MT5 terminal slot (if manager is configured)
    const mt5ManagerUrl = process.env.MT5_MANAGER_URL;
    const provisionSecret = process.env.PROVISION_SECRET;

    if (mt5ManagerUrl && provisionSecret) {
      try {
        console.log('🎯 Provisioning MT5 terminal slot for user:', userId);
        const provisionResponse = await fetch(`${mt5ManagerUrl}/provision`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Provision-Secret': provisionSecret,
          },
          body: JSON.stringify({ user_id: userId }),
        });

        const provisionData = await provisionResponse.json();

        if (provisionResponse.ok && provisionData.status === 'success') {
          console.log('✅ MT5 terminal provisioned:', provisionData.folder_path);
        } else {
          console.warn('⚠️ Provision failed:', provisionData.error);
          // Don't fail the webhook — provision can be retried
        }
      } catch (provisionError) {
        console.error('⚠️ Provision request error:', provisionError.message);
        // Don't fail the webhook — subscription is already activated
      }
    } else {
      console.log('ℹ️ MT5_MANAGER_URL or PROVISION_SECRET not configured — skipping provision');
    }

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
