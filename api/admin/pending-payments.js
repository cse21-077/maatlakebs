/**
 * Admin API endpoint to fetch pending mentor payment proofs
 * GET /api/admin/pending-payments
 * 
 * Query params:
 * - admin_id (required): UUID of admin user
 */

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { admin_id } = req.query;

    if (!admin_id) {
      return res.status(400).json({ error: 'Missing required parameter: admin_id' });
    }

    // Initialize Supabase with SERVICE KEY (bypasses RLS)
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.VITE_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );

    // Verify admin role
    const { data: adminUser, error: adminError } = await supabase
      .from('public_users')
      .select('id, is_admin')
      .eq('id', admin_id)
      .single();

    if (adminError || !adminUser?.is_admin) {
      console.warn(`⚠️  Unauthorized admin access attempt by ${admin_id}`);
      return res.status(403).json({ error: 'Not authorized as admin' });
    }

    // Get pending mentor payment proofs
    const { data: invoices, error: invoicesError } = await supabase
      .from('invoices')
      .select('id, user_id, invoice_id, price_amount, price_currency, subscription_plan, payment_method, proof_of_payment_url, created_at, original_price, discount_amount')
      .eq('payment_status', 'proof_submitted')
      .eq('payment_method', 'mentor')
      .order('created_at', { ascending: false });

    if (invoicesError) {
      console.error('❌ Failed to fetch invoices:', invoicesError);
      return res.status(500).json({ error: invoicesError.message });
    }

    // Enrich with user info
    const enrichedInvoices = [];
    for (const invoice of invoices) {
      const { data: user, error: userError } = await supabase
        .from('public_users')
        .select('id, email, first_name, last_name')
        .eq('id', invoice.user_id)
        .single();

      enrichedInvoices.push({
        ...invoice,
        user: user || null,
      });
    }

    console.log(`✅ Retrieved ${enrichedInvoices.length} pending mentor payments`);
    return res.status(200).json({ 
      success: true,
      count: enrichedInvoices.length,
      invoices: enrichedInvoices,
    });

  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({ error: error.message });
  }
}
