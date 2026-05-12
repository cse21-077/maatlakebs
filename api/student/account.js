/**
 * POST/DELETE /api/student/account
 * Unified student account management endpoint
 * 
 * Actions:
 * - "provision": Provision new terminal slot (POST)
 * - "upsert": Upsert/link/switch account (POST)
 * - "risk": Upsert risk profile (POST)
 * - "delete": Permanently remove account (DELETE)
 */

export default async function handler(req, res) {
  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );

  try {
    // ── Action: Delete account ──
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

      console.log('🗑️ Deleted student account:', { user_id, mt5_login });
      return res.status(200).json({ success: true });
    }

    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const { action, ...payload } = req.body;

    if (!action) {
      return res.status(400).json({ error: 'action is required' });
    }

    // ── Action: Provision terminal ──
    if (action === 'provision') {
      const { user_id } = payload;

      if (!user_id) {
        return res.status(400).json({ error: 'user_id is required' });
      }

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
        console.log('♻️  User already has folder, ensuring it is assigned to all their accounts:', existingFolder);
        
        const { error: updateError } = await supabase
          .from('student_accounts')
          .update({ folder_path: existingFolder })
          .eq('user_id', user_id);

        if (updateError) {
          console.error('❌ Failed to sync folder_path during reuse:', updateError);
        }

        return res.status(200).json({
          success: true,
          folder_path: existingFolder,
          reused: true,
        });
      }

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
      return res.status(200).json({
        success: true,
        folder_path: provisionData.folder_path,
        reused: false,
      });
    }

    // ── Action: Upsert student account ──
    if (action === 'upsert') {
      const { user_id, mt5_login, mt5_server, encrypted_password, trader_id, is_active } = payload;

      if (!user_id || !mt5_login || !mt5_server) {
        return res.status(400).json({ error: 'Missing required fields: user_id, mt5_login, mt5_server' });
      }

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

      if (is_active !== false) {
        const { error: deactivateError } = await supabase
          .from('student_accounts')
          .update({ is_active: false })
          .eq('user_id', user_id)
          .neq('mt5_login', mt5_login);

        if (deactivateError) {
          console.warn('⚠️ Failed to deactivate old accounts:', deactivateError.message);
        } else {
          console.log('✅ Deactivated old accounts for user:', user_id);
        }
      }

      console.log('✅ Student account upserted successfully');
      return res.status(200).json({ success: true, data });
    }

    // ── Action: Upsert risk profile ──
    if (action === 'risk') {
      const { user_id, aggressiveness, max_lot, max_drawdown, min_balance, pause_copy, advanced_options } = payload;

      if (!user_id) {
        return res.status(400).json({ error: 'user_id is required' });
      }

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
      return res.status(200).json({ success: true, data });
    }

    return res.status(400).json({ error: 'Invalid action' });

  } catch (error) {
    console.error('❌ Student account error:', error);
    res.status(500).json({ error: error.message });
  }
}
