/**
 * Admin students endpoint
 *
 * GET  /api/admin/students?admin_id=<uuid>  → fetch all students with accounts & payment status
 * POST /api/admin/students                   → manually mark a student as paid (admin override)
 *   body: { user_id, admin_id, amount?, currency?, notes? }
 */

export default async function handler(req, res) {
  const { createClient } = await import('@supabase/supabase-js');

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Missing env vars: VITE_SUPABASE_URL or SUPABASE_SERVICE_KEY');
    return res.status(500).json({
      error: 'Server misconfiguration: missing Supabase credentials',
      debug: { hasUrl: !!supabaseUrl, hasKey: !!supabaseKey },
    });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // ── Shared admin verification ──────────────────────────────────────────────
  async function verifyAdmin(adminId) {
    if (!adminId) {
      console.warn('⚠️ verifyAdmin called with empty adminId');
      return { ok: false, reason: 'empty adminId' };
    }

    const { data, error } = await supabase
      .from('users')
      .select('id, role')
      .eq('id', adminId)
      .maybeSingle();

    if (error) {
      console.error('❌ verifyAdmin query error:', error);
      return { ok: false, reason: 'query_error', details: error.message };
    }

    if (!data) {
      console.warn(`⚠️ verifyAdmin: no user found with id ${adminId}`);
      return { ok: false, reason: 'user_not_found' };
    }

    const isAdmin = data?.role === 'super_admin';
    if (!isAdmin) {
      console.warn(`⚠️ verifyAdmin: user ${adminId} has role=${data?.role}`);
      return { ok: false, reason: 'not_admin', role: data?.role };
    }

    return { ok: true };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // GET — fetch all students with accounts & payment status
  // ══════════════════════════════════════════════════════════════════════════
  if (req.method === 'GET') {
    const { admin_id } = req.query;

    if (!admin_id) {
      return res.status(400).json({ error: 'Missing required parameter: admin_id' });
    }

    const adminCheck = await verifyAdmin(admin_id);
    if (!adminCheck.ok) {
      return res.status(403).json({
        error: 'Not authorized as admin',
        debug: adminCheck,
      });
    }

    try {
      // Fetch all students
      const { data: students, error: studentsError } = await supabase
        .from('users')
        .select('id, email, full_name, role, trader_id, onboarding_completed, created_at, updated_at')
        .eq('role', 'student')
        .order('created_at', { ascending: false });

      if (studentsError) {
        console.error('❌ Failed to fetch students:', studentsError);
        return res.status(500).json({ error: studentsError.message });
      }

      // Fetch only ACTIVE student accounts (one per user enforced by upsert logic)
      const { data: accounts, error: accountsError } = await supabase
        .from('student_accounts')
        .select('id, user_id, mt5_login, mt5_server, is_active, is_ghost, folder_path, trader_id, created_at, updated_at')
        .eq('is_active', true);

      if (accountsError) {
        console.error('❌ Failed to fetch accounts:', accountsError);
        return res.status(500).json({ error: accountsError.message });
      }

      // Fetch all payment statuses
      const { data: paymentStatuses, error: paymentError } = await supabase
        .from('payment_status')
        .select('id, user_id, subscription_status, last_paid, next_due, amount_paid, currency');

      if (paymentError) {
        console.error('❌ Failed to fetch payment statuses:', paymentError);
        return res.status(500).json({ error: paymentError.message });
      }

      // Fetch pending invoices with proof
      const { data: pendingInvoices, error: invoicesError } = await supabase
        .from('invoices')
        .select('id, user_id, invoice_id, price_amount, price_currency, subscription_plan, payment_status, payment_method, proof_of_payment_url, created_at, original_price, discount_amount')
        .in('payment_status', ['proof_submitted', 'pending'])
        .order('created_at', { ascending: false });

      if (invoicesError) {
        console.error('❌ Failed to fetch invoices:', invoicesError);
        return res.status(500).json({ error: invoicesError.message });
      }

      // Build lookup maps
      const accountsByUser = {};
      const ghostOnlyUsers = new Set();
      for (const acct of accounts || []) {
        if (!accountsByUser[acct.user_id]) accountsByUser[acct.user_id] = [];
        accountsByUser[acct.user_id].push(acct);
      }
      // Identify users whose only accounts are ghost accounts
      for (const userId of Object.keys(accountsByUser)) {
        const userAccounts = accountsByUser[userId];
        const hasRealAccount = userAccounts.some(a => !a.is_ghost);
        if (!hasRealAccount) {
          ghostOnlyUsers.add(userId);
        }
      }

      const paymentByUser = {};
      for (const ps of paymentStatuses || []) {
        paymentByUser[ps.user_id] = ps;
      }

      const invoicesByUser = {};
      for (const inv of pendingInvoices || []) {
        if (!invoicesByUser[inv.user_id]) invoicesByUser[inv.user_id] = [];
        invoicesByUser[inv.user_id].push(inv);
      }

      // Enrich students — hide ghost-only users and filter out ghost accounts
      const enriched = (students || [])
        .filter(student => !ghostOnlyUsers.has(student.id))
        .map((student) => {
          const studentAccounts = (accountsByUser[student.id] || []).filter(a => !a.is_ghost);
          const liveAccounts = studentAccounts.filter(a => a.mt5_server?.toLowerCase().includes('real'));
          const demoAccounts = studentAccounts.filter(a => a.mt5_server?.toLowerCase().includes('demo'));

          return {
            ...student,
            accounts: studentAccounts,
            live_accounts: liveAccounts,
            demo_accounts: demoAccounts,
            payment_status: paymentByUser[student.id] || null,
            pending_invoices: invoicesByUser[student.id] || [],
            has_proof_submitted: (invoicesByUser[student.id] || []).some(i => i.payment_status === 'proof_submitted' && i.proof_of_payment_url),
          };
        });

      console.log(`✅ Retrieved ${enriched.length} students (excluded ${ghostOnlyUsers.size} ghost-only users)`);
      return res.status(200).json({
        success: true,
        count: enriched.length,
        students: enriched,
      });

    } catch (error) {
      console.error('❌ GET /api/admin/students error:', error);
      return res.status(500).json({ error: error.message });
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // POST — manually mark a student as paid (admin override)
  // ══════════════════════════════════════════════════════════════════════════
  if (req.method === 'POST') {
    const { user_id, admin_id, amount, currency, notes } = req.body;

    if (!user_id || !admin_id) {
      return res.status(400).json({
        error: 'Missing required fields: user_id, admin_id',
      });
    }

    const adminCheck = await verifyAdmin(admin_id);
    if (!adminCheck.ok) {
      return res.status(403).json({
        error: 'Not authorized as admin',
        debug: adminCheck,
      });
    }

    try {
      const now = new Date();
      const nextDue = new Date();
      nextDue.setDate(nextDue.getDate() + 30);

      const priceAmount = amount || '30';
      const priceCurrency = currency || 'USD';

      // Check existing payment_status
      const { data: existingStatus, error: fetchStatusError } = await supabase
        .from('payment_status')
        .select('id')
        .eq('user_id', user_id)
        .maybeSingle();

      if (!existingStatus) {
        // No record — insert
        const { error: createError } = await supabase.from('payment_status').insert({
          user_id,
          subscription_status: 'active',
          last_paid: now.toISOString(),
          next_due: nextDue.toISOString(),
          amount_paid: priceAmount,
          currency: priceCurrency,
        });
        if (createError) {
          console.error('❌ Failed to create payment_status:', createError);
          return res.status(500).json({ error: createError.message });
        }
      } else if (fetchStatusError) {
        console.error('❌ Error fetching payment_status:', fetchStatusError);
        return res.status(500).json({ error: fetchStatusError.message });
      } else {
        // Update existing
        const { error: updateError } = await supabase
          .from('payment_status')
          .update({
            subscription_status: 'active',
            last_paid: now.toISOString(),
            next_due: nextDue.toISOString(),
            amount_paid: priceAmount,
            currency: priceCurrency,
            updated_at: now.toISOString(),
          })
          .eq('user_id', user_id);
        if (updateError) {
          console.error('❌ Failed to update payment_status:', updateError);
          return res.status(500).json({ error: updateError.message });
        }
      }

      // Create a system invoice record for tracking
      const invoiceId = `ADMIN-${Date.now()}-${user_id.slice(0, 8)}`;
      const { error: invoiceError } = await supabase.from('invoices').insert({
        user_id,
        invoice_id: invoiceId,
        price_amount: String(priceAmount),
        price_currency: priceCurrency,
        payment_status: 'confirmed',
        subscription_plan: 'active',
        paid_for_month: now.toISOString(),
        payment_method: 'admin_override',
      });

      if (invoiceError) {
        console.warn('⚠️  Could not create invoice record:', invoiceError.message);
        // Non-fatal — payment_status was updated
      }

      // Log system event
      await supabase.from('system_events').insert({
        event_type: 'admin_mark_paid',
        actor_id: admin_id,
        payload: { user_id, amount: priceAmount, currency: priceCurrency, notes: notes || null },
        severity: 'info',
      });

      console.log(`✅ Admin ${admin_id} marked user ${user_id} as paid. Next due: ${nextDue.toISOString()}`);
      return res.status(200).json({
        success: true,
        message: 'Student marked as paid. Subscription extended for 30 days.',
        next_due: nextDue.toISOString(),
      });

    } catch (error) {
      console.error('❌ POST /api/admin/students error:', error);
      return res.status(500).json({ error: error.message });
    }
  }

  // Any other method
  return res.status(405).json({ error: 'Method not allowed' });
}
