export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { user_id, mt5_login, mt5_server, encrypted_password, trader_id, is_active } = req.body;

    if (!user_id || !mt5_login || !mt5_server) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Initialize Supabase with SERVICE KEY (bypasses RLS)
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.VITE_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );

    console.log('📝 Upserting student account:', { user_id, mt5_login, mt5_server });

    const upsertData = {
      user_id,
      mt5_login,
      mt5_server,
      is_active: is_active ?? true,
    };
    if (encrypted_password !== undefined) upsertData.encrypted_password = encrypted_password;
    if (trader_id !== undefined) upsertData.trader_id = trader_id;

    const { data, error } = await supabase
      .from('student_accounts')
      .upsert(upsertData, { onConflict: 'mt5_login,mt5_server' });

    if (error) {
      console.error('❌ Failed to upsert student account:', error);
      return res.status(500).json({ error: error.message });
    }

    // Enforce one active account per user: deactivate all other accounts
    // for this user except the one we just upserted. Preserve passwords so
    // users can switch back to previous accounts without re-entering credentials.
    if (is_active !== false) {
      const { error: deactivateError } = await supabase
        .from('student_accounts')
        .update({ is_active: false })
        .eq('user_id', user_id)
        .neq('mt5_login', mt5_login);

      if (deactivateError) {
        console.warn('⚠️ Failed to deactivate old accounts:', deactivateError.message);
        // Non-fatal — the upsert succeeded
      } else {
        console.log('✅ Deactivated old accounts for user:', user_id);
      }
    }

    console.log('✅ Student account upserted successfully');
    res.status(200).json({ success: true, data });

  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({ error: error.message });
  }
}
