export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { user_id, aggressiveness, max_lot, max_drawdown, min_balance, pause_copy, advanced_options } = req.body;

    if (!user_id) {
      return res.status(400).json({ error: 'Missing user_id' });
    }

    // Initialize Supabase with SERVICE KEY (bypasses RLS)
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.VITE_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );

    console.log('📊 Upserting risk profile:', { user_id, aggressiveness, max_lot, max_drawdown, pause_copy });

    const { data, error } = await supabase
      .from('risk_profiles')
      .upsert(
        {
          user_id,
          aggressiveness: aggressiveness ?? 1.0,
          max_lot: max_lot ?? 50.0,
          max_drawdown: max_drawdown ?? 100,
          min_balance: min_balance ?? 1.0,
          pause_copy: pause_copy ?? false,
          advanced_options: advanced_options ?? { settings_locked: true },
        },
        { onConflict: 'user_id' }
      );

    if (error) {
      console.error('❌ Failed to upsert risk profile:', error);
      return res.status(500).json({ error: error.message });
    }

    console.log('✅ Risk profile upserted successfully');
    res.status(200).json({ success: true, data });

  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({ error: error.message });
  }
}
