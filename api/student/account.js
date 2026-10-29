/**
 * Student support-messages endpoint.
 *
 * GET   /api/student/account?user_id=<uuid>&action=unread → { unread_count }
 * PATCH /api/student/account  { user_id, message_ids }    → mark messages read
 *
 * (The old POST provision/upsert/risk actions lived here once; they were
 * never called from the app and have been removed — the dedicated routes
 * /api/provision-terminal and /api/upsert-student-account cover that.)
 */

export default async function handler(req, res) {
  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );

  // ── GET: unread support-message count (messages from staff) ──
  if (req.method === 'GET') {
    const { user_id, action } = req.query;

    if (action !== 'unread') {
      return res.status(400).json({ error: 'Invalid action or missing user_id' });
    }
    if (!user_id) {
      return res.status(400).json({ error: 'user_id is required' });
    }

    try {
      const { count, error } = await supabase
        .from('support_messages')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user_id)
        .eq('is_admin', true)
        .eq('is_read', false);

      if (error) {
        console.error('❌ Failed to count unread messages:', error);
        return res.status(500).json({ error: error.message });
      }

      return res.status(200).json({ success: true, unread_count: count || 0 });
    } catch (error) {
      console.error('❌ Unread count error:', error);
      return res.status(500).json({ error: error.message });
    }
  }

  // ── PATCH: mark messages as read ─────────────────────────────
  if (req.method === 'PATCH') {
    const { user_id, message_ids } = req.body || {};

    if (!user_id || !Array.isArray(message_ids) || message_ids.length === 0) {
      return res.status(400).json({ error: 'user_id and message_ids array are required' });
    }

    try {
      const { data, error } = await supabase
        .from('support_messages')
        .update({ is_read: true, updated_at: new Date().toISOString() })
        .eq('user_id', user_id)
        .in('id', message_ids)
        .select();

      if (error) {
        console.error('❌ Failed to mark messages as read:', error);
        return res.status(500).json({ error: error.message });
      }

      return res.status(200).json({ success: true, updated: data?.length || 0 });
    } catch (error) {
      console.error('❌ Mark-as-read error:', error);
      return res.status(500).json({ error: error.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
