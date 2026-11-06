/**
 * Provision a terminal for a student's active MT5 account.
 *
 * POST /api/provision-terminal  { user_id }
 *
 * The bridge (final/bridge.py on the Windows VPS) refreshes a terminal slot
 * from the master, installs the Student EA, writes startup.ini and launches
 * MT5. Paid students are assigned to the currently configured mentor for the
 * account's broker.
 */

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { user_id } = req.body;

    if (!user_id) {
      return res.status(400).json({ error: 'user_id is required' });
    }

    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );

    // The account that should be running: the user's active one
    const { data: accounts, error: queryError } = await supabase
      .from('student_accounts')
      .select('id, user_id, mt5_login, mt5_server, encrypted_password, folder_path, trader_id')
      .eq('user_id', user_id)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1);

    if (queryError) {
      console.error('❌ Database query error:', queryError);
      return res.status(500).json({ error: 'Database query failed' });
    }

    if (!accounts || accounts.length === 0) {
      return res.status(404).json({ error: 'No active MT5 account found for this user' });
    }

    const account = accounts[0];

    if (!account.encrypted_password) {
      return res.status(400).json({ error: 'Account has no password stored; re-enter MT5 credentials' });
    }

    const {
      bridgeFetch,
      defaultMentorId,
      detectBroker,
      DEFAULT_MENTOR_ID,
    } = await import('./_lib/bridge.js');

    let bridge;
    try {
      bridge = await bridgeFetch('/v1/accounts', {
        method: 'POST',
        body: {
          login: String(account.mt5_login),
          password: account.encrypted_password,
          server: account.mt5_server,
          role: 'student',
        },
        timeoutMs: 60000, // slot clone + terminal launch can be slow
      });
    } catch (err) {
      if (err.code === 'BRIDGE_NOT_CONFIGURED') {
        return res.status(503).json({ error: err.message });
      }
      console.error('❌ Bridge unreachable during provision:', err.message);
      return res.status(502).json({ error: 'MT5 bridge unreachable', details: err.message });
    }

    if (!bridge.ok) {
      console.error('❌ Bridge provision failed:', bridge.data);
      return res.status(bridge.status >= 400 && bridge.status < 600 ? bridge.status : 502).json({
        error: bridge.data?.error || 'Failed to provision terminal',
      });
    }

    const folderPath = bridge.data?.folder_path || account.folder_path;

    // Remember the slot the bridge assigned
    if (folderPath && folderPath !== account.folder_path) {
      await supabase
        .from('student_accounts')
        .update({ folder_path: folderPath })
        .eq('id', account.id);
    }

    const { data: payment, error: paymentError } = await supabase
      .from('payment_status')
      .select('subscription_status')
      .eq('user_id', account.user_id)
      .maybeSingle();

    if (paymentError) {
      console.error('❌ Failed to check payment status before mentor assignment:', paymentError);
      return res.status(500).json({ error: 'Terminal provisioned, but payment status could not be checked' });
    }

    if (payment?.subscription_status === 'active') {
      const { data: mentorConfig, error: mentorConfigError } = await supabase
        .from('system_flags')
        .select('value')
        .eq('key', 'admin_mt5_mentors')
        .maybeSingle();

      if (mentorConfigError) {
        console.error('❌ Failed to read configured admin mentors:', mentorConfigError);
        return res.status(500).json({ error: 'Terminal provisioned, but the active mentor could not be determined' });
      }

      let configuredMentors = [];
      try {
        const parsed = JSON.parse(mentorConfig?.value || '{}');
        configuredMentors = Array.isArray(parsed.accounts) ? parsed.accounts : [];
      } catch (error) {
        console.error('❌ Invalid admin mentor configuration:', error);
        return res.status(500).json({ error: 'Terminal provisioned, but the admin mentor configuration is invalid' });
      }

      const broker = detectBroker(account.mt5_server);
      const configuredMentor = configuredMentors.find((mentor) => mentor.broker === broker);
      const mentorId = configuredMentor?.mentor_id
        || (account.trader_id && account.trader_id !== DEFAULT_MENTOR_ID ? account.trader_id : null)
        || defaultMentorId();

      let assignment;
      try {
        assignment = await bridgeFetch(
          `/v1/accounts/${encodeURIComponent(String(account.mt5_login))}/mentor`,
          {
            method: 'POST',
            body: { mentor_id: mentorId, volume_multiplier: 1 },
          }
        );
      } catch (error) {
        console.error(`❌ Failed to assign mentor ${mentorId} to student ${account.mt5_login}:`, error.message);
        return res.status(502).json({
          error: 'Terminal provisioned, but the mentor assignment failed',
          details: error.message,
        });
      }

      if (!assignment.ok) {
        console.error(`❌ Bridge rejected mentor assignment for ${account.mt5_login}:`, assignment.data);
        return res.status(assignment.status >= 400 && assignment.status < 600 ? assignment.status : 502).json({
          error: assignment.data?.error || 'Terminal provisioned, but the mentor assignment failed',
        });
      }
    }

    console.log(`✅ Terminal provisioned for login ${account.mt5_login}:`, folderPath);
    return res.status(200).json({
      success: true,
      folder_path: folderPath,
      launched: bridge.data?.launched !== false,
      reused: false,
    });

  } catch (error) {
    console.error('❌ Provision error:', error);
    res.status(500).json({
      error: error.message,
      details: 'Failed to provision terminal',
    });
  }
}
