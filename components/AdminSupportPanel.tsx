import React, { useState, useEffect, useRef } from 'react';
import {
  Send, Clock, Check, X, MessageSquare,
  AlertCircle, ChevronLeft
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Button } from './shared';

interface SupportTicket {
  id: string;
  user_id: string;
  user_name: string;
  user_email: string;
  status: 'open' | 'closed';
  created_at: string;
  updated_at: string;
  last_message?: string;
}

interface Message {
  id: string;
  user_id: string;
  content: string;
  is_admin: boolean;
  created_at: string;
}

interface AdminSupportPanelProps {
  adminId: string;
}

export const AdminSupportPanel: React.FC<AdminSupportPanelProps> = ({ adminId }) => {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Load all support tickets
  const loadTickets = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('support_messages' as any)
        .select('*')
        .order('created_at', { ascending: false }) as { data: Message[] | null; error: any };

      if (error) {
        console.error('Failed to load tickets:', error);
        return;
      }

      if (data) {
        const ticketMap = new Map<string, SupportTicket>();
        
        for (const msg of data) {
          if (!ticketMap.has(msg.user_id)) {
            const { data: userData } = await supabase.auth.admin.getUserById(msg.user_id);
            ticketMap.set(msg.user_id, {
              id: msg.user_id,
              user_id: msg.user_id,
              user_name: userData?.user?.user_metadata?.full_name || 'Unknown',
              user_email: userData?.user?.email || '',
              status: 'open',
              created_at: msg.created_at,
              updated_at: msg.created_at,
              last_message: msg.content
            });
          } else {
            const existing = ticketMap.get(msg.user_id)!;
            if (msg.created_at > existing.updated_at) {
              existing.updated_at = msg.created_at;
              existing.last_message = msg.content;
            }
          }
        }
        
        setTickets(Array.from(ticketMap.values()).sort((a, b) => 
          new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
        ));
      }
    } finally {
      setLoading(false);
    }
  };

  // Load messages for selected ticket
  const loadMessages = async (userId: string) => {
    const { data } = await supabase
      .from('support_messages' as any)
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true }) as { data: Message[] | null };

    if (data) setMessages(data);
  };

  useEffect(() => {
    loadTickets();
    
    const channel = supabase.channel('admin_support_updates')
      .on('postgres_changes' as any,
        { event: 'INSERT', schema: 'public', table: 'support_messages' },
        () => { loadTickets(); }
      ).subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  useEffect(() => {
    if (selectedTicketId) {
      loadMessages(selectedTicketId);

      const channel = supabase.channel(`admin_ticket_${selectedTicketId}`)
        .on('postgres_changes' as any,
          { event: 'INSERT', schema: 'public', table: 'support_messages', filter: `user_id=eq.${selectedTicketId}` },
          (payload: any) => { setMessages(prev => [...prev, payload.new]); }
        ).subscribe();

      return () => { supabase.removeChannel(channel); };
    }
  }, [selectedTicketId]);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !selectedTicketId || sending) return;

    setSending(true);
    const content = input.trim();
    try {
      const { error } = await (supabase.from('support_messages' as any) as any).insert({
        user_id: selectedTicketId,
        content,
        is_admin: true,
        created_at: new Date().toISOString()
      });
      if (error) throw error;
      setInput('');
      // Trigger push notification to the user
      await fetch('/api/send-push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: selectedTicketId,
          title: 'Support Reply',
          body: content.length > 80 ? content.slice(0, 77) + '...' : content,
          url: '/'
        })
      });
    } catch (e: any) {
      console.error('Error sending message:', e);
    } finally {
      setSending(false);
    }
  };

  const selectedTicket = tickets.find(t => t.id === selectedTicketId);

  // ── Chat View ──────────────────────────────────────────────────────────────
  if (selectedTicketId && selectedTicket) {
    return (
      <div className="flex flex-col h-full animate-fade-in">
        {/* Chat Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/5 bg-[#1a1c22]/50 rounded-t-2xl">
          <button 
            onClick={() => { setSelectedTicketId(null); setMessages([]); }}
            className="flex items-center gap-2 text-[10px] font-black text-white/40 uppercase tracking-widest hover:text-white transition-all"
          >
            <ChevronLeft size={14} /> Back to Tickets
          </button>
          <div className="text-center">
            <p className="text-[10px] font-black text-primary uppercase tracking-[0.4em]">Ticket</p>
            <p className="text-sm font-black text-white tracking-tight">{selectedTicket.user_name}</p>
            <p className="text-[9px] text-white/30 font-bold">{selectedTicket.user_email}</p>
          </div>
          <div className="w-20" />
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar min-h-[400px]">
          {messages.length === 0 && (
            <div className="text-center py-10 opacity-20">
              <MessageSquare size={32} className="mx-auto mb-2" />
              <p className="text-[10px] font-black uppercase tracking-widest">No messages yet</p>
            </div>
          )}
          
          {messages.map((msg, i) => (
            <div key={msg.id || i} className={`flex items-end gap-2 ${msg.is_admin ? 'justify-start' : 'justify-end'} animate-fade-in`}>
              <div className={`max-w-[80%] p-3 rounded-2xl flex flex-col gap-1 ${msg.is_admin ? 'bg-primary text-white rounded-bl-lg shadow-lg shadow-primary/10' : 'bg-[#1a1c22] rounded-tr-lg border border-white/5'}`}>
                <p className="text-xs leading-relaxed font-bold">{msg.content}</p>
                <div className={`flex items-center gap-1 text-[8px] font-black uppercase tracking-tighter ${msg.is_admin ? 'text-white/50' : 'text-white/20'}`}>
                  <Clock size={10} />
                  {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            </div>
          ))}
          <div ref={scrollRef} />
        </div>

        {/* Input */}
        <form onSubmit={handleSendMessage} className="p-4 border-t border-white/5">
          <div className="relative">
            <input 
              type="text" 
              placeholder="Type your reply..." 
              value={input}
              onChange={(e) => setInput(e.target.value)}
              className="w-full bg-dark/50 border border-white/10 rounded-xl py-3 px-4 text-white text-sm font-bold pr-12 focus:border-primary transition-all outline-none"
            />
            <button 
              type="submit"
              disabled={!input.trim() || sending}
              className={`absolute right-2 top-2 w-8 h-8 rounded-lg flex items-center justify-center transition-all ${input.trim() ? 'bg-primary text-white' : 'bg-white/5 text-white/20'}`}
            >
              <Send size={14} />
            </button>
          </div>
        </form>
      </div>
    );
  }

  // ── Tickets List ───────────────────────────────────────────────────────────
  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-black text-white tracking-tighter">Support Tickets</h2>
          <p className="text-[10px] text-white/30 font-black uppercase tracking-widest mt-1">
            {tickets.length} active conversation{tickets.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button 
          onClick={loadTickets}
          disabled={loading}
          className="px-3 py-2 bg-white/5 text-white/40 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-white/10 transition-all disabled:opacity-50"
        >
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      {tickets.length === 0 ? (
        <div className="text-center py-16 space-y-4 opacity-20">
          <MessageSquare size={48} className="mx-auto" />
          <p className="text-[10px] font-black uppercase tracking-[0.3em]">No support tickets yet</p>
        </div>
      ) : (
        <div className="space-y-3">
          {tickets.map(ticket => (
            <button
              key={ticket.id}
              onClick={() => setSelectedTicketId(ticket.id)}
              className="w-full bg-[#1a1c22] border border-white/5 rounded-2xl p-4 text-left hover:border-primary/50 hover:bg-[#1a1c22]/80 transition-all active:scale-95"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-black text-white tracking-tight truncate">{ticket.user_name}</h3>
                    <span className="text-[9px] text-white/30 font-bold truncate">{ticket.user_email}</span>
                  </div>
                  <p className="text-[10px] text-white/30 mt-1 line-clamp-1">{ticket.last_message || 'New ticket'}</p>
                  <p className="text-[8px] text-white/20 mt-2 flex items-center gap-1.5">
                    <Clock size={10} />
                    {new Date(ticket.updated_at).toLocaleDateString()} at {new Date(ticket.updated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${ticket.status === 'open' ? 'bg-red-500/10 text-red-500' : 'bg-green-500/10 text-green-500'}`}>
                  {ticket.status === 'open' ? <AlertCircle size={16} /> : <Check size={16} />}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
