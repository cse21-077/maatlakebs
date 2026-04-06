export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { user_id, invoice_id, price_amount, price_currency, subscription_plan } = req.body;

    if (!user_id || !invoice_id) {
      return res.status(400).json({ error: 'Missing required fields: user_id, invoice_id' });
    }

    // Initialize Supabase with SERVICE KEY (bypasses RLS)
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.VITE_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );

    console.log('📦 Storing invoice in Supabase:', { user_id, invoice_id });

    const { data, error } = await supabase
      .from('invoices')
      .insert({
        user_id,
        invoice_id: String(invoice_id),
        price_amount,
        price_currency,
        payment_status: 'pending',
        subscription_plan,
      });

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
