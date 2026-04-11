export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { user_id } = req.body;

    if (!user_id) {
      return res.status(400).json({ error: 'user_id is required' });
    }

    // Import Supabase client
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );

    // ── Step 1: Check if user already has a folder (folder reuse for demo→real flow) ──
    console.log('🔍 Checking if user has existing folder:', user_id);
    const { data: existingAccounts, error: queryError } = await supabase
      .from('student_accounts')
      .select('folder_path')
      .eq('user_id', user_id)
      .not('folder_path', 'is', null)
      .limit(1);

    if (queryError) {
      console.error('❌ Database query error:', queryError);
      return res.status(500).json({ error: 'Database query failed' });
    }

    if (existingAccounts && existingAccounts.length > 0) {
      const existingFolder = existingAccounts[0].folder_path;
      console.log('♻️  User already has folder, reusing:', existingFolder);
      return res.status(200).json({
        success: true,
        folder_path: existingFolder,
        reused: true,
      });
    }

    // ── Step 2: No folder exists, call mt5_manager to assign new one ──
    const mt5ManagerUrl = process.env.MT5_MANAGER_URL;
    const provisionSecret = process.env.PROVISION_SECRET;

    if (!mt5ManagerUrl || !provisionSecret) {
      console.warn('⚠️ MT5_MANAGER_URL or PROVISION_SECRET not configured');
      return res.status(503).json({ 
        error: 'MT5 manager not configured',
        note: 'Set MT5_MANAGER_URL and PROVISION_SECRET environment variables'
      });
    }

    console.log('🎯 Calling MT5 manager to assign new folder for user:', user_id);

    const provisionResponse = await fetch(`${mt5ManagerUrl}/provision`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Provision-Secret': provisionSecret,
      },
      body: JSON.stringify({ user_id }),
    });

    const provisionData = await provisionResponse.json();

    if (!provisionResponse.ok) {
      console.error('❌ Provision failed:', provisionData.error);
      return res.status(provisionResponse.status).json({
        error: provisionData.error || 'Failed to provision terminal slot',
      });
    }

    console.log('✅ Terminal provisioned:', provisionData.folder_path);
    res.status(200).json({
      success: true,
      folder_path: provisionData.folder_path,
      reused: false,
    });

  } catch (error) {
    console.error('❌ Provision error:', error);
    res.status(500).json({
      error: error.message,
      details: 'Failed to provision terminal slot',
    });
  }
}
