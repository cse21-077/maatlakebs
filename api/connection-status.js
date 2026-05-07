/**
 * Fetch connection status for a user — bypasses RLS via service key
 * GET /api/connection-status?user_id=<uuid>
 */

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { user_id } = req.query;

  if (!user_id) {
    return res.status(400).json({ error: 'Missing user_id' });
  }

  try {
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.VITE_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );

    const { data, error } = await supabase
      .from('connection_status')
      .select('user_id, mt5_status, last_checked, error_message, updated_at')
      .eq('user_id', user_id)
      .maybeSingle();

    if (error) {
      console.error('❌ Failed to fetch connection status:', error);
      return res.status(500).json({ error: error.message });
    }

    // If no row exists yet, return UNKNOWN so the UI doesn't get stuck
    if (!data) {
      return res.status(200).json({
        status: 'UNKNOWN',
        last_checked: null,
        error_message: null,
      });
    }

    return res.status(200).json({
      status: data.mt5_status,
      last_checked: data.last_checked,
      error_message: data.error_message,
      updated_at: data.updated_at,
    });

  } catch (error) {
    console.error('❌ Connection status error:', error);
    return res.status(500).json({ error: error.message });
  }
}
