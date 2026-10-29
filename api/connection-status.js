/**
 * Connection status — live bridge checks mirrored into Supabase.
 *
 * GET  /api/connection-status?user_id=<uuid>  → read last mirror from Supabase (fast)
 * POST /api/connection-status                 → live check via the bridge, upserts
 *                                               connection_status rows (realtime UI
 *                                               keeps working off the mirror)
 *   Body: { user_id?: string }  — omit user_id to refresh every known account
 */

export default async function handler(req, res) {
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;

  const getSupabase = async () => {
    const { createClient } = await import('@supabase/supabase-js');
    return createClient(supabaseUrl, process.env.SUPABASE_SERVICE_KEY);
  };

  // ── GET: simple DB read ──────────────────────────────────────
  if (req.method === 'GET') {
    const { user_id } = req.query;
    if (!user_id) {
      return res.status(400).json({ error: 'Missing user_id' });
    }

    try {
      const supabase = await getSupabase();

      const { data, error } = await supabase
        .from('connection_status')
        .select('user_id, mt5_status, last_checked, error_message, balance, equity, updated_at')
        .eq('user_id', user_id)
        .maybeSingle();

      if (error) {
        console.error('DB error:', error);
        return res.status(500).json({ error: error.message });
      }

      if (!data) {
        return res.status(200).json({ status: 'UNKNOWN', last_checked: null });
      }

      return res.status(200).json({
        status: data.mt5_status,
        last_checked: data.last_checked,
        error_message: data.error_message,
        balance: data.balance ?? null,
        updated_at: data.updated_at,
      });
    } catch (err) {
      console.error('GET error:', err);
      return res.status(500).json({ error: err.message });
    }
  }

  // ── POST: live check via the bridge ──────────────────────────
  if (req.method === 'POST') {
    const { user_id } = req.body || {};

    try {
      const supabase = await getSupabase();

      let query = supabase
        .from('student_accounts')
        .select('user_id, mt5_login, mt5_server')
        .eq('is_active', true);

      if (user_id) query = query.eq('user_id', user_id);

      const { data: accounts, error: accountsError } = await query;

      if (accountsError) {
        console.error('Accounts query error:', accountsError);
        return res.status(500).json({ error: accountsError.message });
      }

      const { bridgeConfig, bridgeFetch } = await import('./_lib/bridge.js');

      if (!bridgeConfig().configured) {
        return res.status(503).json({
          error: 'MT5 bridge not configured: set SKUD_BRIDGE_URL and SKUD_BRIDGE_KEY',
        });
      }

      const nowIso = new Date().toISOString();
      let connected = 0;
      const perAccount = [];

      await Promise.all((accounts || []).map(async (account) => {
        let mt5Status = 'DISCONNECTED';
        let errorMessage = null;
        let balance = null;

        try {
          const r = await bridgeFetch(`/v1/status?login=${encodeURIComponent(String(account.mt5_login))}`, { timeoutMs: 8000 });
          if (r.ok && r.data) {
            const live = r.data.terminal_connected === true && r.data.state === 'connected';
            mt5Status = live ? 'CONNECTED' : 'DISCONNECTED';
            balance = typeof r.data.balance === 'number' ? r.data.balance : null;
            if (!live && r.data.message) errorMessage = String(r.data.message).slice(0, 200);
            if (r.data.expected_server && r.data.reported_server &&
                r.data.expected_server !== r.data.reported_server) {
              errorMessage = `Server mismatch: terminal reports ${r.data.reported_server}`;
            }
          } else {
            errorMessage = r.data?.error || `Bridge returned ${r.status}`;
          }
        } catch (err) {
          errorMessage = `Bridge check failed: ${err.message}`.slice(0, 200);
        }

        if (mt5Status === 'CONNECTED') connected += 1;
        perAccount.push({ user_id: account.user_id, login: account.mt5_login, mt5_status: mt5Status, balance, error_message: errorMessage });
      }));

      // connection_status is keyed by user_id — a user can have one Weltrade
      // and one Deriv account, so mirror the "best" account (CONNECTED wins)
      const bestByUser = new Map();
      for (const r of perAccount) {
        const cur = bestByUser.get(r.user_id);
        if (!cur || (r.mt5_status === 'CONNECTED' && cur.mt5_status !== 'CONNECTED')) {
          bestByUser.set(r.user_id, r);
        }
      }

      const results = [];
      for (const r of bestByUser.values()) {
        await supabase
          .from('connection_status')
          .upsert({
            user_id: r.user_id,
            mt5_status: r.mt5_status,
            balance: r.balance,
            last_checked: nowIso,
            error_message: r.error_message,
          }, { onConflict: 'user_id' });
        results.push({ user_id: r.user_id, login: r.login, mt5_status: r.mt5_status });
      }

      const response = {
        live: true,
        last_checked: nowIso,
        total: results.length,
        connected,
        disconnected: results.length - connected,
      };

      if (user_id) {
        const mine = results.find(r => r.user_id === user_id);
        return res.status(200).json({ ...response, status: mine?.mt5_status || 'UNKNOWN' });
      }

      return res.status(200).json({ ...response, students: results });

    } catch (err) {
      console.error('POST error:', err);
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
