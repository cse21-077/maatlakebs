/**
 * GET /api/unread-messages
 * Returns unread support message count for the authenticated user
 */

import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { user_id } = req.query;

  if (!user_id) {
    return res.status(400).json({ error: 'user_id is required' });
  }

  const supabase = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );

  try {
    // Count unread messages where is_admin=true (messages from support staff)
    const { count, error } = await supabase
      .from('support_messages')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user_id)
      .eq('is_admin', true)
      .eq('is_read', false);

    if (error) {
      console.error('❌ Failed to fetch unread count:', error);
      return res.status(500).json({ error: error.message });
    }

    return res.status(200).json({ unread_count: count || 0 });
  } catch (err) {
    console.error('❌ Error:', err);
    return res.status(500).json({ error: err.message });
  }
}
