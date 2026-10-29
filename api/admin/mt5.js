/**
 * Admin's own MT5 accounts — the platform mentors.
 *
 * The admin connects one account per broker (Weltrade + Deriv). Each is
 * registered on the bridge with role "mentor" and its own mentor id
 * (admin-weltrade / admin-deriv); every trade made on the account (from any
 * MT5 logged into it) is copied to students assigned to that mentor.
 * Students are assigned by broker match when their payment is approved
 * (see api/admin/students.js POST).
 *
 * The account list is stored server-side in system_flags
 * (key "admin_mt5_mentors") so it works from any device and the assignment
 * logic can read it.
 *
 * GET    /api/admin/mt5?admin_id=              → accounts + live bridge status
 * GET    /api/admin/mt5?admin_id=&login=       → single-account status
 * POST   /api/admin/mt5  {admin_id, login, password, server}  → connect
 * DELETE /api/admin/mt5  {admin_id, login}     → disconnect + stop terminal
 */

const FLAGS_KEY = 'admin_mt5_mentors';

async function verifyAdmin(supabase, adminId) {
  if (!adminId) return { ok: false, reason: 'emptyAdminId' };

  const { data, error } = await supabase
    .from('users')
    .select('id, role')
    .eq('id', adminId)
    .maybeSingle();

  if (error) return { ok: false, reason: 'query_error', details: error.message };
  if (!data) return { ok: false, reason: 'user_not_found' };
  if (data.role !== 'super_admin') return { ok: false, reason: 'not_admin', role: data.role };
  return { ok: true };
}

function validLogin(login) {
  return typeof login === 'string' && /^\d{4,20}$/.test(login);
}

async function readMentorAccounts(supabase) {
  const { data } = await supabase
    .from('system_flags')
    .select('value')
    .eq('key', FLAGS_KEY)
    .maybeSingle();

  try {
    const parsed = JSON.parse(data?.value || '{}');
    return Array.isArray(parsed.accounts) ? parsed.accounts : [];
  } catch {
    return [];
  }
}

async function writeMentorAccounts(supabase, accounts, adminId) {
  await supabase.from('system_flags').upsert({
    key: FLAGS_KEY,
    value: JSON.stringify({ accounts }),
    updated_at: new Date().toISOString(),
    updated_by: adminId,
  }, { onConflict: 'key' });
}

export default async function handler(req, res) {
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: 'Server misconfiguration: missing Supabase credentials' });
  }

  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(supabaseUrl, supabaseKey);

  const { bridgeFetch, bridgeConfig, detectBroker, mentorIdForBroker } = await import('../_lib/bridge.js');

  const liveStatus = async (login) => {
    try {
      const r = await bridgeFetch(`/v1/status?login=${encodeURIComponent(String(login))}`, { timeoutMs: 8000 });
      if (!r.ok) return { connected: false, status: 'DISCONNECTED', bridge_error: r.data?.error || `HTTP ${r.status}` };
      const live = r.data.terminal_connected === true && r.data.state === 'connected';
      return {
        connected: live,
        status: live ? 'CONNECTED' : 'DISCONNECTED',
        balance: typeof r.data.balance === 'number' ? r.data.balance : null,
        currency: r.data.currency || null,
        reported_server: r.data.reported_server || null,
        expected_server: r.data.expected_server || null,
        server_mismatch: Boolean(r.data.expected_server && r.data.reported_server && r.data.expected_server !== r.data.reported_server),
        message: r.data.message || null,
        last_seen: r.data.last_seen || null,
      };
    } catch (err) {
      return { connected: false, status: 'UNKNOWN', bridge_error: err.message };
    }
  };

  // ── GET: accounts list (with live status) or single status ───
  if (req.method === 'GET') {
    const { admin_id, login } = req.query;

    const adminCheck = await verifyAdmin(supabase, admin_id);
    if (!adminCheck.ok) {
      return res.status(403).json({ error: 'Not authorized as admin', debug: adminCheck });
    }

    const configured = bridgeConfig().configured;
    if (!configured) {
      return res.status(200).json({ configured: false, accounts: [] });
    }

    if (login) {
      return res.status(200).json({ configured: true, login: String(login), ...(await liveStatus(login)) });
    }

    const accounts = await readMentorAccounts(supabase);
    const enriched = await Promise.all(accounts.map(async (a) => ({
      ...a,
      status: await liveStatus(a.login),
    })));

    return res.status(200).json({ configured: true, accounts: enriched });
  }

  // ── POST: connect a broker account (register as mentor) ──────
  if (req.method === 'POST') {
    const { admin_id, login, password, server } = req.body || {};

    const adminCheck = await verifyAdmin(supabase, admin_id);
    if (!adminCheck.ok) {
      return res.status(403).json({ error: 'Not authorized as admin', debug: adminCheck });
    }

    if (!validLogin(String(login || ''))) {
      return res.status(400).json({ error: 'Invalid MT5 login (4–20 digits)' });
    }
    if (!password || typeof password !== 'string' || password.length > 128) {
      return res.status(400).json({ error: 'Missing or invalid MT5 password' });
    }
    if (!server || typeof server !== 'string' || server.length > 128) {
      return res.status(400).json({ error: 'Missing or invalid MT5 server' });
    }

    const broker = detectBroker(server);
    if (!broker) {
      return res.status(400).json({ error: 'Unsupported broker — server must be a Weltrade or Deriv server' });
    }
    const mentorId = mentorIdForBroker(broker);

    let bridge;
    try {
      bridge = await bridgeFetch('/v1/accounts', {
        method: 'POST',
        timeoutMs: 60000,
        body: {
          login: String(login),
          password,
          server,
          role: 'mentor',
          mentor_id: mentorId,
        },
      });
    } catch (err) {
      if (err.code === 'BRIDGE_NOT_CONFIGURED') {
        return res.status(503).json({ error: err.message });
      }
      return res.status(502).json({ error: 'MT5 bridge unreachable', details: err.message });
    }

    if (!bridge.ok) {
      return res.status(bridge.status >= 400 && bridge.status < 600 ? bridge.status : 502).json({
        error: bridge.data?.error || 'Bridge failed to connect the account',
      });
    }

    // Keep the mentor registered so it shows in the bridge's mentor list
    bridgeFetch('/v1/mentors', {
      method: 'POST',
      body: { mentor_id: mentorId, mentor_name: `Admin ${broker}`, login: String(login), server },
    }).catch((err) => console.warn('⚠️ Mentor registration best-effort failed:', err.message));

    // Persist server-side (replace an existing entry for the same login)
    const accounts = await readMentorAccounts(supabase);
    const entry = {
      login: String(login),
      server,
      broker,
      mentor_id: mentorId,
      connected_at: new Date().toISOString(),
    };
    const next = [entry, ...accounts.filter(a => a.login !== entry.login)];
    await writeMentorAccounts(supabase, next, admin_id);

    // Backfill: students with an ACTIVE subscription on this broker who were
    // approved before this mentor connected get assigned right away
    try {
      const { data: activeSubs } = await supabase
        .from('payment_status')
        .select('user_id')
        .eq('subscription_status', 'active');

      const userIds = (activeSubs || []).map(s => s.user_id);
      if (userIds.length > 0) {
        const prefix = broker === 'weltrade' ? 'Weltrade%' : 'Deriv%';
        const { data: brokerAccounts } = await supabase
          .from('student_accounts')
          .select('mt5_login')
          .in('user_id', userIds)
          .eq('is_active', true)
          .ilike('mt5_server', prefix);

        for (const acct of brokerAccounts || []) {
          bridgeFetch(`/v1/accounts/${encodeURIComponent(String(acct.mt5_login))}/mentor`, {
            method: 'POST',
            body: { mentor_id: mentorId, volume_multiplier: 1 },
          }).catch((err) => console.warn(`⚠️ Backfill mentor assign failed for ${acct.mt5_login}:`, err.message));
        }
      }
    } catch (err) {
      console.warn('⚠️ Broker mentor backfill failed:', err.message);
    }

    await supabase.from('system_events').insert({
      event_type: 'admin_mt5_connect',
      actor_id: admin_id,
      payload: { login: String(login), server, broker, mentor_id: mentorId },
      severity: 'info',
    });

    return res.status(200).json({
      success: true,
      account: entry,
      folder_path: bridge.data?.folder_path || null,
      launched: bridge.data?.launched !== false,
      message: bridge.data?.message || 'Mentor terminal connected',
    });
  }

  // ── DELETE: disconnect one account, stop its terminal ────────
  if (req.method === 'DELETE') {
    const { admin_id, login } = req.body || {};

    const adminCheck = await verifyAdmin(supabase, admin_id);
    if (!adminCheck.ok) {
      return res.status(403).json({ error: 'Not authorized as admin', debug: adminCheck });
    }

    if (!login) {
      return res.status(400).json({ error: 'Missing login' });
    }

    try {
      const r = await bridgeFetch(`/v1/accounts/${encodeURIComponent(String(login))}/deactivate`, { method: 'POST' });
      if (!r.ok && r.status !== 404) {
        return res.status(r.status || 502).json({ error: r.data?.error || 'Bridge deactivate failed' });
      }

      const accounts = await readMentorAccounts(supabase);
      await writeMentorAccounts(supabase, accounts.filter(a => a.login !== String(login)), admin_id);

      await supabase.from('system_events').insert({
        event_type: 'admin_mt5_disconnect',
        actor_id: admin_id,
        payload: { login: String(login) },
        severity: 'info',
      });

      return res.status(200).json({ success: true, message: 'MT5 account disconnected and terminal stopped.' });
    } catch (err) {
      if (err.code === 'BRIDGE_NOT_CONFIGURED') {
        return res.status(503).json({ error: err.message });
      }
      return res.status(502).json({ error: 'MT5 bridge unreachable', details: err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
