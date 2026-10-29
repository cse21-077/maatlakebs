export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Submission types — the method the client actually paid with, so the
  // admin can verify the payment against the right channel
  const PAYMENT_METHODS = ['binance_pay', 'bank_transfer', 'orange_money', 'paypal', 'crypto', 'cash_deposit', 'ewallet', 'other'];

  try {
    const {
      user_id,
      invoice_id,
      price_amount,
      price_currency,
      subscription_plan,
      payment_method = 'other',
      payment_status = 'pending',
      original_price,
      discount_amount,
      proof_of_payment_url,
    } = req.body;

    if (!user_id || !invoice_id) {
      return res.status(400).json({ error: 'Missing required fields: user_id, invoice_id' });
    }

    if (!PAYMENT_METHODS.includes(payment_method) && payment_method !== 'proof_upload') {
      return res.status(400).json({ error: `Unknown payment_method "${payment_method}"`, allowed: PAYMENT_METHODS });
    }

    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.VITE_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );

    // One open submission per client: block while a proof is still under review
    // (approve sets 'confirmed', reject sets 'rejected' — neither blocks)
    if (payment_status !== 'confirmed') {
      const { data: open, error: openError } = await supabase
        .from('invoices')
        .select('id, invoice_id, created_at')
        .eq('user_id', user_id)
        .in('payment_status', ['pending', 'proof_submitted'])
        .limit(1);

      if (openError) {
        console.error('❌ Failed to check open submissions:', openError);
        return res.status(500).json({ error: openError.message });
      }

      if (open && open.length > 0) {
        return res.status(409).json({
          error: 'You already have a payment submission under review. Please wait for the team to approve or reject it before submitting again.',
          existing_invoice_id: open[0].invoice_id,
        });
      }
    }

    console.log('📦 Storing invoice in Supabase:', { user_id, invoice_id, payment_method });

    const insertPayload = {
      user_id,
      invoice_id: String(invoice_id),
      price_amount,
      price_currency,
      payment_status,
      subscription_plan,
      payment_method,
    };

    if (original_price !== undefined) insertPayload.original_price = original_price;
    if (discount_amount !== undefined) insertPayload.discount_amount = discount_amount;
    if (proof_of_payment_url) insertPayload.proof_of_payment_url = proof_of_payment_url;

    const { data, error } = await supabase.from('invoices').insert(insertPayload);

    if (error) {
      console.error('❌ Failed to store invoice:', error);
      return res.status(500).json({ error: error.message });
    }

    console.log('✅ Invoice stored successfully');
    res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({ error: error.message });
  }
}
