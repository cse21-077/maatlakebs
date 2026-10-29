export default async function handler(req, res) {
  // Ensure local dev env is available for server-side API routes
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  let serviceKey = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !serviceKey) {
    console.error('❌ Missing Supabase env vars for student account API', { supabaseUrl: !!supabaseUrl, hasServiceKey: !!serviceKey });
    return res.status(500).json({
      error: 'Server misconfiguration: missing Supabase URL or service key. Check .env or your deployment environment.',
    });
  }

  if (serviceKey === process.env.VITE_SUPABASE_ANON_KEY) {
    console.warn('⚠️ Using anon key fallback for student account API. This is only for local development and may fail if RLS blocks the request.');
  }

  // Initialize Supabase with SERVICE KEY (bypasses RLS)
  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    // ── DELETE: permanently remove a saved account ──
    if (req.method === 'DELETE') {
      const { user_id, mt5_login } = req.body;
      if (!user_id || !mt5_login) {
        return res.status(400).json({ error: 'Missing user_id or mt5_login' });
      }

      const { error } = await supabase
        .from('student_accounts')
        .delete()
        .eq('user_id', user_id)
        .eq('mt5_login', mt5_login);

      if (error) {
        console.error('❌ Failed to delete student account:', error);
        return res.status(500).json({ error: error.message });
      }

      // Best-effort: stop the terminal on the bridge so a deleted account
      // can't keep copying (same pattern as the admin deprovision hook)
      try {
        const { bridgeTry } = await import('./_lib/bridge.js');
        await bridgeTry(`/v1/accounts/${encodeURIComponent(String(mt5_login))}/deactivate`, { method: 'POST' });
      } catch (err) {
        console.warn('⚠️ Could not deactivate bridge terminal:', err.message);
      }

      console.log('🗑️ Deleted student account:', { user_id, mt5_login });
      return res.status(200).json({ success: true });
    }

    // ── POST: upsert / link / switch account ──
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const { id, user_id, mt5_login, mt5_server, encrypted_password, trader_id, is_active } = req.body;

    if (!user_id || !mt5_login || !mt5_server) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const isValidUuid = (value) => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
    if (trader_id !== undefined && trader_id !== null && !isValidUuid(trader_id)) {
      console.warn('⚠️ Received invalid trader_id:', trader_id);
      return res.status(400).json({ error: 'Invalid trader_id format' });
    }

    console.log('📝 Upserting student account:', { id, user_id, mt5_login, mt5_server });

    const upsertData = {
      user_id,
      mt5_login,
      mt5_server,
      is_active: is_active ?? true,
    };
    if (id) upsertData.id = id;
    if (encrypted_password !== undefined) upsertData.encrypted_password = encrypted_password;
    if (trader_id !== undefined) upsertData.trader_id = trader_id;

    const { data, error } = await supabase
      .from('student_accounts')
      .upsert(upsertData, { onConflict: id ? 'id' : 'mt5_login,mt5_server' });

    if (error) {
      console.error('❌ Failed to upsert student account:', error);
      return res.status(500).json({ error: error.message });
    }

    // Enforce one ACTIVE account per user PER BROKER (a student can run one
    // Weltrade and one Deriv account at the same time). Preserve passwords so
    // users can switch back to previous accounts without re-entering credentials.
    if (is_active !== false) {
      const { detectBroker } = await import('./_lib/bridge.js');
      const newBroker = detectBroker(mt5_server);

      // Capture the previously-active logins first so their bridge terminals
      // can be stopped — otherwise the old terminal keeps copying after a switch
      const { data: previousAccounts } = await supabase
        .from('student_accounts')
        .select('mt5_login, mt5_server')
        .eq('user_id', user_id)
        .eq('is_active', true)
        .neq('mt5_login', mt5_login);

      // Only same-broker accounts get deactivated — the other broker's active
      // account keeps running and copying
      const superseded = (previousAccounts || []).filter(a => detectBroker(a.mt5_server) === newBroker);

      const { error: deactivateError } = await supabase
        .from('student_accounts')
        .update({ is_active: false })
        .eq('user_id', user_id)
        .in('mt5_login', superseded.map(a => a.mt5_login));

      if (deactivateError) {
        console.warn('⚠️ Failed to deactivate old accounts:', deactivateError.message);
        // Non-fatal — the upsert succeeded
      } else if (superseded.length > 0) {
        console.log(`✅ Deactivated ${superseded.length} old ${newBroker} account(s) for user:`, user_id);
      }

      for (const prev of superseded) {
        try {
          const { bridgeTry } = await import('./_lib/bridge.js');
          await bridgeTry(`/v1/accounts/${encodeURIComponent(String(prev.mt5_login))}/deactivate`, { method: 'POST' });
        } catch (err) {
          console.warn('⚠️ Could not stop previous bridge terminal:', err.message);
        }
      }
    }

    console.log('✅ Student account upserted successfully');

    // Explicit disconnect (is_active:false) also stops the terminal on the
    // bridge — the account row stays saved so the student can relink easily
    if (is_active === false) {
      try {
        const { bridgeTry } = await import('./_lib/bridge.js');
        await bridgeTry(`/v1/accounts/${encodeURIComponent(String(mt5_login))}/deactivate`, { method: 'POST' });
      } catch (err) {
        console.warn('⚠️ Could not stop bridge terminal on disconnect:', err.message);
      }
    }

    res.status(200).json({ success: true, data });

  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({ error: error.message });
  }
}
