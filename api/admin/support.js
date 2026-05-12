/**
 * Admin Support endpoint
 *
 * GET  /api/admin/support?admin_id=<uuid>  → fetch all support messages with user info
 * POST /api/admin/support                   → admin replies to a ticket
 *   body: { user_id, content, admin_id }
 */

export default async function handler(req, res) {
  const { createClient } = await import('@supabase/supabase-js');

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({
      error: 'Server misconfiguration: missing Supabase credentials',
    });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // ── Shared admin verification ──────────────────────────────────────────────
  async function verifyAdmin(adminId) {
    if (!adminId) return { ok: false, reason: 'empty adminId' };

    const { data, error } = await supabase
      .from('users')
      .select('id, role')
      .eq('id', adminId)
      .maybeSingle();

    if (error) return { ok: false, reason: 'query_error', details: error.message };
    if (!data) return { ok: false, reason: 'user_not_found' };
    if (data.role !== 'super_admin') return { ok: false, reason: 'not_admin', role: data.role };

    return { ok: true };
  }

  // ════════════════════════════════════════════════════════════════════════════
  // GET — fetch all support messages grouped by user with user info
  // ════════════════════════════════════════════════════════════════════════════
  if (req.method === 'GET') {
    const { admin_id } = req.query;

    const adminCheck = await verifyAdmin(admin_id);
    if (!adminCheck.ok) {
      return res.status(403).json({ error: 'Unauthorized', reason: adminCheck.reason });
    }

    try {
      // Fetch all support messages
      const { data: messages, error: msgError } = await supabase
        .from('support_messages')
        .select('*')
        .order('created_at', { ascending: false });

      if (msgError) {
        console.error('❌ Failed to fetch support messages:', msgError);
        return res.status(500).json({ error: msgError.message });
      }

      // Fetch all unique user IDs
      const userIds = [...new Set(messages.map(m => m.user_id))];

      // Fetch user info for all ticket senders
      const { data: users, error: userError } = await supabase
        .from('users')
        .select('id, email, full_name')
        .in('id', userIds);

      if (userError) {
        console.error('❌ Failed to fetch users:', userError);
      }

      const userMap = new Map();
      if (users) {
        for (const u of users) {
          userMap.set(u.id, u);
        }
      }

      // Group messages by user_id into tickets
      const ticketMap = new Map();

      for (const msg of messages) {
        const user = userMap.get(msg.user_id);
        if (!ticketMap.has(msg.user_id)) {
          ticketMap.set(msg.user_id, {
            user_id: msg.user_id,
            user_name: user?.full_name || user?.email || 'Unknown',
            user_email: user?.email || '',
            status: 'open',
            created_at: msg.created_at,
            updated_at: msg.created_at,
            last_message: msg.content,
            last_message_from_admin: msg.is_admin,
            messages: [msg],
          });
        } else {
          const ticket = ticketMap.get(msg.user_id);
          ticket.messages.push(msg);
          if (msg.created_at > ticket.updated_at) {
            ticket.updated_at = msg.created_at;
            ticket.last_message = msg.content;
            ticket.last_message_from_admin = msg.is_admin;
          }
        }
      }

      const tickets = Array.from(ticketMap.values()).sort(
        (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
      );

      return res.status(200).json({ tickets });
    } catch (err) {
      console.error('❌ GET /api/admin/support error:', err);
      return res.status(500).json({ error: err.message });
    }
  }

  // ════════════════════════════════════════════════════════════════════════════
  // POST — admin sends a reply
  // ════════════════════════════════════════════════════════════════════════════
  if (req.method === 'POST') {
    const { user_id, content, admin_id } = req.body || {};

    if (!user_id || !content?.trim() || !admin_id) {
      return res.status(400).json({ error: 'Missing required fields: user_id, content, admin_id' });
    }

    const adminCheck = await verifyAdmin(admin_id);
    if (!adminCheck.ok) {
      return res.status(403).json({ error: 'Unauthorized', reason: adminCheck.reason });
    }

    try {
      const { data, error } = await supabase
        .from('support_messages')
        .insert({
          user_id,
          content: content.trim(),
          is_admin: true,
          created_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) {
        console.error('❌ Failed to insert support message:', error);
        return res.status(500).json({ error: error.message });
      }

      // Trigger push notification to user
      try {
        await fetch(`${process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : ''}/api/send-push`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id,
            title: 'Support Reply',
            body: content.trim().length > 80 ? content.trim().slice(0, 77) + '...' : content.trim(),
            url: '/',
          }),
        });
      } catch (pushErr) {
        console.warn('⚠️ Push notification failed:', pushErr.message);
      }

      return res.status(200).json({ success: true, message: data });
    } catch (err) {
      console.error('❌ POST /api/admin/support error:', err);
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
