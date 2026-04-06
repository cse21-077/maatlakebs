export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { user_id } = req.body;

    if (!user_id) {
      return res.status(400).json({ error: 'user_id is required' });
    }

    // Get MT5 manager URL and secret from environment
    const mt5ManagerUrl = process.env.MT5_MANAGER_URL;
    const provisionSecret = process.env.PROVISION_SECRET;

    if (!mt5ManagerUrl || !provisionSecret) {
      console.warn('⚠️ MT5_MANAGER_URL or PROVISION_SECRET not configured');
      return res.status(503).json({ 
        error: 'MT5 manager not configured',
        note: 'Set MT5_MANAGER_URL and PROVISION_SECRET environment variables'
      });
    }

    console.log('🎯 Calling MT5 manager /provision for user:', user_id);

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
      already_assigned: provisionData.already_assigned || false,
    });

  } catch (error) {
    console.error('❌ Provision error:', error);
    res.status(500).json({
      error: error.message,
      details: 'Failed to provision terminal slot',
    });
  }
}
