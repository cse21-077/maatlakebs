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

    const { data, error } = await supabase
      .from('student_accounts')
      .upsert(
        {
          user_id,
          mt5_login,
          mt5_server,
          encrypted_password,
          trader_id,
          is_active: is_active ?? true,
        },
        { onConflict: 'mt5_login,mt5_server' }
      );

    if (error) {
      console.error('❌ Failed to upsert student account:', error);
      return res.status(500).json({ error: error.message });
    }

    console.log('✅ Student account upserted successfully');
    res.status(200).json({ success: true, data });

  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({ error: error.message });
  }
}
