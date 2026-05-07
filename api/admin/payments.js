/**
 * Unified admin payments endpoint — merges pending-payments + approve-payment into 1 function slot
 *
 * GET  /api/admin/payments?admin_id=<uuid>        → fetch all pending mentor payment proofs
 * POST /api/admin/payments                         → approve or reject a payment proof
 *   body: { invoice_id, action: "approve"|"reject", admin_id }
 */

export default async function handler(req, res) {
  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );

  // ── Shared admin verification ──────────────────────────────────────────────
  async function verifyAdmin(adminId) {
    if (!adminId) return false;
    const { data, error } = await supabase
      .from('users')
      .select('id, role, is_admin')
      .eq('id', adminId)
      .single();
    if (error) return false;
    return data?.role === 'super_admin' || data?.is_admin === true;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // GET — fetch pending mentor payment proofs
  // ══════════════════════════════════════════════════════════════════════════
  if (req.method === 'GET') {
    const { admin_id } = req.query;

    if (!admin_id) {
      return res.status(400).json({ error: 'Missing required parameter: admin_id' });
    }

    const isAdmin = await verifyAdmin(admin_id);
    if (!isAdmin) {
      console.warn(`⚠️  Unauthorized admin access attempt by ${admin_id}`);
      return res.status(403).json({ error: 'Not authorized as admin' });
    }

    try {
      const { data: invoices, error: invoicesError } = await supabase
        .from('invoices')
        .select(
          'id, user_id, invoice_id, price_amount, price_currency, subscription_plan, payment_method, proof_of_payment_url, created_at, original_price, discount_amount'
        )
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
        const { data: user } = await supabase
          .from('users')
          .select('id, email, full_name')
          .eq('id', invoice.user_id)
          .single();

        enrichedInvoices.push({
          ...invoice,
          user: user
            ? {
                ...user,
                first_name: user.full_name?.split(' ')[0] || '',
                last_name: user.full_name?.split(' ').slice(1).join(' ') || '',
              }
            : null,
        });
      }

      console.log(`✅ Retrieved ${enrichedInvoices.length} pending mentor payments`);
      return res.status(200).json({
        success: true,
        count: enrichedInvoices.length,
        invoices: enrichedInvoices,
      });

    } catch (error) {
      console.error('❌ GET /api/admin/payments error:', error);
      return res.status(500).json({ error: error.message });
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // POST — approve or reject a mentor payment proof
  // ══════════════════════════════════════════════════════════════════════════
  if (req.method === 'POST') {
    const { invoice_id, action, admin_id } = req.body;

    if (!invoice_id || !action || !admin_id) {
      return res.status(400).json({
        error: 'Missing required fields: invoice_id, action, admin_id',
      });
    }

    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({ error: 'action must be "approve" or "reject"' });
    }

    const isAdmin = await verifyAdmin(admin_id);
    if (!isAdmin) {
      console.warn(`⚠️  Unauthorized admin attempt by ${admin_id}`);
      return res.status(403).json({ error: 'Not authorized as admin' });
    }

    try {
      // Fetch the invoice
      const { data: invoice, error: invoiceError } = await supabase
        .from('invoices')
        .select('*')
        .eq('id', invoice_id)
        .single();

      if (invoiceError || !invoice) {
        return res.status(404).json({ error: 'Invoice not found' });
      }

      if (invoice.payment_status !== 'proof_submitted') {
        return res.status(400).json({
          error: `Cannot update invoice with status "${invoice.payment_status}". Only "proof_submitted" invoices can be reviewed.`,
        });
      }

      // ── APPROVE ──────────────────────────────────────────────────────────
      if (action === 'approve') {
        const { error: updateInvoiceError } = await supabase
          .from('invoices')
          .update({ payment_status: 'confirmed', updated_at: new Date().toISOString() })
          .eq('id', invoice_id);

        if (updateInvoiceError) {
          console.error('❌ Failed to confirm invoice:', updateInvoiceError);
          return res.status(500).json({ error: updateInvoiceError.message });
        }

        // Activate 30-day subscription
        const nextDue = new Date();
        nextDue.setDate(nextDue.getDate() + 30);

        const { data: existingStatus, error: fetchStatusError } = await supabase
          .from('payment_status')
          .select('id')
          .eq('user_id', invoice.user_id)
          .single();

        if (fetchStatusError?.code === 'PGRST116') {
          // No record yet — insert
          const { error: createError } = await supabase.from('payment_status').insert({
            user_id: invoice.user_id,
            subscription_status: invoice.subscription_plan || 'active',
            last_paid: new Date().toISOString(),
            next_due: nextDue.toISOString(),
            amount_paid: invoice.price_amount,
            currency: invoice.price_currency,
          });
          if (createError) {
            console.error('❌ Failed to create payment_status:', createError);
            return res.status(500).json({ error: createError.message });
          }
        } else if (fetchStatusError) {
          console.error('❌ Error fetching payment_status:', fetchStatusError);
          return res.status(500).json({ error: fetchStatusError.message });
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
            console.error('❌ Failed to update payment_status:', updateError);
            return res.status(500).json({ error: updateError.message });
          }
        }

        console.log(`✅ Invoice ${invoice_id} approved. Subscription activated for ${invoice.user_id}`);
        return res.status(200).json({
          success: true,
          message: 'Payment approved and subscription activated for 30 days',
          invoice: { id: invoice_id, status: 'confirmed' },
        });
      }

      // ── REJECT ───────────────────────────────────────────────────────────
      if (action === 'reject') {
        const { error: updateError } = await supabase
          .from('invoices')
          .update({ payment_status: 'rejected', updated_at: new Date().toISOString() })
          .eq('id', invoice_id);

        if (updateError) {
          console.error('❌ Failed to reject invoice:', updateError);
          return res.status(500).json({ error: updateError.message });
        }

        // Delete proof file from storage (best-effort — don't fail if missing)
        if (invoice.proof_of_payment_url) {
          const urlParts = invoice.proof_of_payment_url.split('/');
          const filePath = urlParts.slice(-2).join('/');
          const { error: deleteError } = await supabase.storage
            .from('proofofpay')
            .remove([filePath]);
          if (deleteError) {
            console.warn(`⚠️  Could not delete proof file: ${deleteError.message}`);
          }
        }

        console.log(`✅ Invoice ${invoice_id} rejected`);
        return res.status(200).json({
          success: true,
          message: 'Payment rejected',
          invoice: { id: invoice_id, status: 'rejected' },
        });
      }

    } catch (error) {
      console.error('❌ POST /api/admin/payments error:', error);
      return res.status(500).json({ error: error.message });
    }
  }

  // Any other method
  return res.status(405).json({ error: 'Method not allowed' });
}
