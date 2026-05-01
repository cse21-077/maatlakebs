/**
 * Admin API endpoint to approve mentor payment proofs and activate subscriptions
 * POST /api/admin/approve-payment
 * 
 * Request body:
 * {
 *   "invoice_id": "uuid",
 *   "action": "approve" | "reject",
 *   "admin_id": "uuid" (for verification)
 * }
 */

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { invoice_id, action, admin_id } = req.body;

    if (!invoice_id || !action || !admin_id) {
      return res.status(400).json({ 
        error: 'Missing required fields: invoice_id, action, admin_id' 
      });
    }

    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({ error: 'Action must be "approve" or "reject"' });
    }

    // Initialize Supabase with SERVICE KEY (bypasses RLS)
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.VITE_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );

    // Verify admin role - check if admin_id exists in public_users with admin flag
    const { data: adminUser, error: adminError } = await supabase
      .from('public_users')
      .select('id, is_admin')
      .eq('id', admin_id)
      .single();

    if (adminError || !adminUser?.is_admin) {
      console.warn(`⚠️  Unauthorized admin attempt by ${admin_id}`);
      return res.status(403).json({ error: 'Not authorized as admin' });
    }

    // Get the invoice
    const { data: invoice, error: invoiceError } = await supabase
      .from('invoices')
      .select('*')
      .eq('id', invoice_id)
      .single();

    if (invoiceError || !invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    // Check invoice status is proof_submitted
    if (invoice.payment_status !== 'proof_submitted') {
      return res.status(400).json({ 
        error: `Cannot update invoice with status "${invoice.payment_status}". Only "proof_submitted" invoices can be approved.` 
      });
    }

    if (action === 'approve') {
      // Update invoice status to confirmed
      const { error: updateInvoiceError } = await supabase
        .from('invoices')
        .update({
          payment_status: 'confirmed',
          updated_at: new Date().toISOString(),
        })
        .eq('id', invoice_id);

      if (updateInvoiceError) {
        console.error('❌ Failed to update invoice:', updateInvoiceError);
        return res.status(500).json({ error: updateInvoiceError.message });
      }

      // Activate subscription for 30 days
      const nextDue = new Date();
      nextDue.setDate(nextDue.getDate() + 30);

      // Get or create payment_status record
      const { data: paymentStatus, error: paymentStatusError } = await supabase
        .from('payment_status')
        .select('id')
        .eq('user_id', invoice.user_id)
        .single();

      if (paymentStatusError?.code === 'PGRST116') {
        // Record doesn't exist, create it
        const { error: createError } = await supabase
          .from('payment_status')
          .insert({
            user_id: invoice.user_id,
            subscription_status: invoice.subscription_plan || 'active',
            last_paid: new Date().toISOString(),
            next_due: nextDue.toISOString(),
            amount_paid: invoice.price_amount,
            currency: invoice.price_currency,
          });

        if (createError) {
          console.error('❌ Failed to create payment status:', createError);
          return res.status(500).json({ error: createError.message });
        }
      } else if (paymentStatusError) {
        console.error('❌ Error fetching payment status:', paymentStatusError);
        return res.status(500).json({ error: paymentStatusError.message });
      } else {
        // Update existing record
        const { error: updateError } = await supabase
          .from('payment_status')
          .update({
            subscription_status: invoice.subscription_plan || 'active',
            last_paid: new Date().toISOString(),
            next_due: nextDue.toISOString(),
            amount_paid: invoice.price_amount,
            currency: invoice.price_currency,
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', invoice.user_id);

        if (updateError) {
          console.error('❌ Failed to update payment status:', updateError);
          return res.status(500).json({ error: updateError.message });
        }
      }

      console.log(`✅ Invoice ${invoice_id} approved. Subscription activated for user ${invoice.user_id}`);
      return res.status(200).json({ 
        success: true, 
        message: 'Payment approved and subscription activated for 30 days',
        invoice: { id: invoice_id, status: 'confirmed' }
      });

    } else if (action === 'reject') {
      // Update invoice status to rejected/failed
      const { error: updateError } = await supabase
        .from('invoices')
        .update({
          payment_status: 'rejected',
          updated_at: new Date().toISOString(),
        })
        .eq('id', invoice_id);

      if (updateError) {
        console.error('❌ Failed to reject invoice:', updateError);
        return res.status(500).json({ error: updateError.message });
      }

      // Optionally: Delete the proof file from storage
      if (invoice.proof_of_payment_url) {
        // Extract file path from URL
        const urlParts = invoice.proof_of_payment_url.split('/');
        const fileName = urlParts.slice(-2).join('/'); // Get last 2 parts (folder/file)
        
        const { error: deleteError } = await supabase.storage
          .from('proofofpay')
          .remove([fileName]);

        if (deleteError) {
          console.warn(`⚠️  Failed to delete proof file: ${deleteError.message}`);
          // Don't fail the request if file deletion fails
        }
      }

      console.log(`✅ Invoice ${invoice_id} rejected`);
      return res.status(200).json({ 
        success: true, 
        message: 'Payment rejected',
        invoice: { id: invoice_id, status: 'rejected' }
      });
    }

  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({ error: error.message });
  }
}
