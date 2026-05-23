/**
 * Connection status — reads from Supabase or does live check via mt5_manager proxy.
 *
 * GET  /api/connection-status?user_id=<uuid>  → read from Supabase (fast, stale OK)
 * POST /api/connection-status                 → live check via Windows VPS (checks ALL terminals)
 *   Body: { user_id?: string }
 */

export default async function handler(req, res) {
  // ── GET: simple DB read ──────────────────────────────────────
  if (req.method === 'GET') {
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
        updated_at: data.updated_at,
      });
    } catch (err) {
      console.error('GET error:', err);
      return res.status(500).json({ error: err.message });
    }
  }

  // ── POST: live check via mt5_manager proxy ───────────────────
  if (req.method === 'POST') {
    const { user_id } = req.body || {};

    try {
      const MT5_MANAGER_URL = process.env.MT5_MANAGER_URL;

      // If we have a direct line to the Windows manager, do a live check
      if (MT5_MANAGER_URL) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 15000);

          const managerRes = await fetch(`${MT5_MANAGER_URL}/check-connections`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: controller.signal,
          });
          clearTimeout(timeoutId);

          if (managerRes.ok) {
            const managerData = await managerRes.json();

            // If user_id provided, extract just their status
            if (user_id && managerData.students) {
              const mine = managerData.students.find(s => s.user_id === user_id);
              return res.status(200).json({
                status: mine?.status || 'UNKNOWN',
                last_checked: new Date().toISOString(),
                live: true,
                summary: {
                  total: managerData.total,
                  connected: managerData.connected,
                  disconnected: managerData.disconnected,
                }
              });
            }

            return res.status(200).json({
              ...managerData,
              live: true,
              last_checked: new Date().toISOString(),
            });
          }
        } catch (proxyErr) {
          console.warn('MT5 manager proxy failed, falling back to DB:', proxyErr.message);
        }
      }

      // Fallback: read from Supabase directly (stale data)
      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(
        process.env.VITE_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_KEY
      );

      const query = supabase
        .from('connection_status')
        .select('user_id, mt5_status, last_checked, error_message, updated_at')
        .order('updated_at', { ascending: false });

      if (user_id) {
        query.eq('user_id', user_id).maybeSingle();
      }

      const { data, error } = await query;

      if (error) {
        console.error('Fallback DB error:', error);
        return res.status(500).json({ error: error.message });
      }

      if (user_id) {
        if (!data) {
          return res.status(200).json({ status: 'UNKNOWN', last_checked: null, live: false });
        }
        return res.status(200).json({
          status: data.mt5_status,
          last_checked: data.last_checked,
          error_message: data.error_message,
          updated_at: data.updated_at,
          live: false,
        });
      }

      return res.status(200).json({
        students: data || [],
        live: false,
        last_checked: new Date().toISOString(),
      });

    } catch (err) {
      console.error('POST error:', err);
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
