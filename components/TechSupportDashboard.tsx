import React, { useState, useEffect, useRef } from 'react';
import {
    ChevronLeft, Send, Clock, Check, X, MessageSquare,
    AlertCircle
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Button } from './shared';

interface SupportTicket {
    id: string;
    user_id: string;
    user_name: string;
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

interface TechSupportDashboardProps {
    uid: string;
    onBack: () => void;
}

export const TechSupportDashboard = ({ uid, onBack }: TechSupportDashboardProps) => {
    const [tickets, setTickets] = useState<SupportTicket[]>([]);
    const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [closingTicket, setClosingTicket] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);

    // Load all support tickets
    const loadTickets = async () => {
        const { data, error } = await supabase
            .from('support_messages' as any)
            .select('*')
            .order('created_at', { ascending: false }) as { data: Message[] | null; error: any };

        if (data) {
            // Group by user_id to create tickets
            const ticketMap = new Map<string, SupportTicket>();
            
            for (const msg of data) {
                if (!ticketMap.has(msg.user_id)) {
                    const { data: userData } = await supabase.auth.admin.getUserById(msg.user_id);
                    ticketMap.set(msg.user_id, {
                        id: msg.user_id,
                        user_id: msg.user_id,
                        user_name: userData?.user?.user_metadata?.full_name || 'Unknown',
                        status: 'open',
                        created_at: msg.created_at,
                        updated_at: msg.created_at
                    });
                }
            }
            
            setTickets(Array.from(ticketMap.values()));
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
        
        const channel = supabase.channel('support_updates')
            .on('postgres_changes' as any,
                { event: 'INSERT', schema: 'public', table: 'support_messages' },
                () => { loadTickets(); }
            ).subscribe();

        return () => { supabase.removeChannel(channel); };
    }, []);

    useEffect(() => {
        if (selectedTicketId) {
            loadMessages(selectedTicketId);

            const channel = supabase.channel(`ticket_${selectedTicketId}`)
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
        if (!input.trim() || !selectedTicketId || loading) return;

        setLoading(true);
        try {
            const { error } = await (supabase.from('support_messages' as any) as any).insert({
                user_id: selectedTicketId,
                content: input.trim(),
                is_admin: true,
                created_at: new Date().toISOString()
            });
            if (error) throw error;
            setInput('');
        } catch (e: any) {
            console.error('Error sending message:', e);
        } finally {
            setLoading(false);
        }
    };

    const handleCloseTicket = async () => {
        if (!selectedTicketId) return;
        setClosingTicket(true);
        try {
            // In a real system, you'd update a tickets table
            // For now, we just clear the selection
            setSelectedTicketId(null);
            setMessages([]);
            await loadTickets();
        } finally {
            setClosingTicket(false);
        }
    };

    const selectedTicket = tickets.find(t => t.id === selectedTicketId);

    if (selectedTicketId && selectedTicket) {
        return (
            <div className="fixed inset-0 bg-[#0d0f14] z-[500] flex flex-col pt-12 animate-in slide-in-from-bottom duration-300">
                {/* Header */}
                <header className="px-8 h-24 flex items-center justify-between shrink-0 border-b border-white/5 bg-[#0d0f14]/80 backdrop-blur-xl sticky top-0 z-[510]">
                    <button onClick={() => setSelectedTicketId(null)} className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center text-white/40 hover:bg-white/10 transition-all">
                        <ChevronLeft size={24} />
                    </button>
                    <div className="text-center">
                        <p className="text-[10px] font-black text-primary uppercase tracking-[0.4em] mb-1">Ticket</p>
                        <h2 className="text-xl font-black text-white tracking-tighter">{selectedTicket.user_name}</h2>
                    </div>
                    <button
                        onClick={handleCloseTicket}
                        disabled={closingTicket}
                        className="px-4 py-2 bg-red-500/10 text-red-500 text-[10px] font-black rounded-lg hover:bg-red-500/20 transition-all disabled:opacity-50"
                    >
                        {closingTicket ? 'Closing...' : 'Close'}
                    </button>
                </header>

                {/* Messages */}
                <main className="flex-1 overflow-y-auto p-8 space-y-6 flex flex-col custom-scrollbar">
                    <div className="flex-1" />
                    
                    {messages.map((msg, i) => (
                        <div key={msg.id || i} className={`flex items-end gap-3 ${msg.is_admin ? 'justify-start' : 'justify-end'} animate-fade-in`}>
                            <div className={`max-w-[70%] p-5 rounded-[2rem] flex flex-col gap-2 ${msg.is_admin ? 'bg-primary text-dark rounded-bl-lg shadow-xl shadow-primary/10' : 'bg-[#1a1c22] rounded-tr-lg border border-white/5'}`}>
                                <p className="text-xs leading-relaxed font-bold">{msg.content}</p>
                                <div className={`flex items-center gap-1.5 text-[8px] font-black uppercase tracking-tighter ${msg.is_admin ? 'text-dark/40' : 'text-white/20'}`}>
                                    <Clock size={10} />
                                    {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </div>
                            </div>
                        </div>
                    ))}
                    <div ref={scrollRef} />
                </main>

                {/* Input */}
                <form onSubmit={handleSendMessage} className="p-8 pb-10 border-t border-white/5 bg-[#1a1c22]">
                    <div className="relative">
                        <input 
                            type="text" 
                            placeholder="Send response..." 
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            className="w-full bg-dark/50 border border-white/10 rounded-2xl py-5 px-6 text-white text-sm font-bold pr-16 focus:border-primary transition-all outline-none"
                        />
                        <button 
                            type="submit"
                            disabled={!input.trim() || loading}
                            className={`absolute right-3 top-3 w-12 h-12 rounded-xl flex items-center justify-center transition-all ${input.trim() ? 'bg-primary text-dark shadow-lg shadow-primary/20' : 'bg-white/5 text-white/20'}`}
                        >
                            <Send size={18} />
                        </button>
                    </div>
                </form>
            </div>
        );
    }

    // Tickets List View
    return (
        <div className="fixed inset-0 bg-[#0d0f14] z-[500] flex flex-col pt-12 animate-in slide-in-from-left duration-300">
            {/* Header */}
            <header className="px-8 h-24 flex items-center justify-between shrink-0 border-b border-white/5 bg-[#0d0f14]/80 backdrop-blur-xl sticky top-0 z-[510]">
                <button onClick={onBack} className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center text-white/40 hover:bg-white/10 transition-all">
                    <ChevronLeft size={24} />
                </button>
                <div className="text-center">
                    <p className="text-[10px] font-black text-primary uppercase tracking-[0.4em] mb-1">Admin</p>
                    <h2 className="text-xl font-black text-white tracking-tighter">Support Queue</h2>
                </div>
                <div className="w-12 h-12 bg-red-500/10 rounded-2xl flex items-center justify-center text-red-500">
                    <AlertCircle size={20} />
                </div>
            </header>

            {/* Tickets */}
            <main className="flex-1 overflow-y-auto p-8 custom-scrollbar">
                {tickets.length === 0 ? (
                    <div className="text-center p-10 space-y-4 opacity-20">
                        <MessageSquare size={48} className="mx-auto" />
                        <p className="text-[10px] font-black uppercase tracking-[0.3em]">No support tickets</p>
                    </div>
                ) : (
                    <div className="space-y-4 max-w-2xl mx-auto">
                        {tickets.map(ticket => (
                            <button
                                key={ticket.id}
                                onClick={() => setSelectedTicketId(ticket.id)}
                                className="w-full bg-[#1a1c22] border border-white/5 rounded-2xl p-6 text-left hover:border-primary/50 hover:bg-[#1a1c22]/80 transition-all active:scale-95"
                            >
                                <div className="flex items-center justify-between">
                                    <div className="flex-1">
                                        <h3 className="text-sm font-black text-white tracking-tight">{ticket.user_name}</h3>
                                        <p className="text-[10px] text-white/30 mt-2 line-clamp-1">{ticket.last_message || 'New ticket'}</p>
                                        <p className="text-[8px] text-white/20 mt-3 flex items-center gap-1.5">
                                            <Clock size={10} />
                                            {new Date(ticket.created_at).toLocaleDateString()}
                                        </p>
                                    </div>
                                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${ticket.status === 'open' ? 'bg-red-500/10 text-red-500' : 'bg-green-500/10 text-green-500'}`}>
                                        {ticket.status === 'open' ? <AlertCircle size={16} /> : <Check size={16} />}
                                    </div>
                                </div>
                            </button>
                        ))}
                    </div>
                )}
            </main>
        </div>
    );
};
