import React, { useState, useEffect, useRef } from 'react';
import { 
    ChevronLeft, Send, User, ShieldCheck, 
    ArrowDown, MessageSquare, Clock, ShieldAlert
} from 'lucide-react';
import { supabase } from '../lib/supabase';

interface SupportProtocolProps {
    uid: string;
    onBack: () => void;
    prefillMessage?: string;
}

interface Message {
    id: string;
    user_id: string;
    content: string;
    is_admin: boolean;
    created_at: string;
}

export const SupportProtocol = ({ uid, onBack, prefillMessage }: SupportProtocolProps) => {
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState(prefillMessage || '');
    const [loading, setLoading] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);
    const [messageSent, setMessageSent] = useState(false);

    const loadMessages = async () => {
        const { data, error } = await supabase
            .from('support_messages' as any)
            .select('*')
            .eq('user_id', uid)
            .order('created_at', { ascending: true });
        
        if (data) setMessages(data);
    };

    // Auto-send prefilled message on mount
    useEffect(() => {
        if (prefillMessage && !messageSent && !loading) {
            handleSendMessage(new Event('submit') as any);
            setMessageSent(true);
        }
    }, [prefillMessage, messageSent, loading]);

    useEffect(() => {
        loadMessages();

        // Real-time subscription to institutional support node
        const channel = supabase.channel('support_changes')
            .on('postgres_changes' as any, 
                { event: 'INSERT', schema: 'public', table: 'support_messages', filter: `user_id=eq.${uid}` },
                (payload: any) => {
                    setMessages(prev => [...prev, payload.new]);
                }
            ).subscribe();

        return () => { supabase.removeChannel(channel); };
    }, [uid]);

    useEffect(() => {
        scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim() || loading) return;

        setLoading(true);
        const newMsg = {
            user_id: uid,
            content: input.trim(),
            is_admin: false,
            created_at: new Date().toISOString()
        };

        try {
            const { error } = await (supabase.from('support_messages' as any) as any).insert(newMsg);
            if (error) throw error;
            setInput('');
        } catch (e: any) {
            console.error('Chat Error:', e.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-[#0d0f14] z-[500] flex flex-col pt-12 animate-in slide-in-from-right duration-300">
            {/* Header */}
            <header className="px-8 h-24 flex items-center justify-between shrink-0 border-b border-white/5 bg-[#0d0f14]/80 backdrop-blur-xl sticky top-0 z-[510]">
                <button onClick={onBack} className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center text-white/40 hover:bg-white/10 active:scale-90 transition-all shadow-xl">
                    <ChevronLeft size={24} />
                </button>
                <div className="text-center">
                    <h2 className="text-[10px] font-black text-primary uppercase tracking-[0.4em] mb-1 leading-none">Get Help</h2>
                    <p className="text-xl font-black text-white tracking-tighter flex items-center gap-2 leading-none">
                        Support Chat <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                    </p>
                </div>
                <div className="w-12 h-12 bg-primary/10 border border-primary/20 rounded-2xl overflow-hidden shrink-0 shadow-2xl shadow-primary/10">
                    <img src={`https://api.dicebear.com/7.x/notionists/svg?seed=Felix`} alt="Admin" className="w-full h-full object-contain" />
                </div>
            </header>

            {/* Chat Messages */}
            <main className="flex-1 overflow-y-auto p-8 space-y-6 flex flex-col custom-scrollbar">
                <div className="flex-1" /> {/* Push messages to bottom */}
                
                {messages.length === 0 && (
                    <div className="text-center p-10 space-y-4 opacity-20">
                        <MessageSquare size={48} className="mx-auto" />
                        <p className="text-[10px] font-black uppercase tracking-[0.3em]">Institutional hand-shake ready. <br /> Send a message to technical admin.</p>
                    </div>
                )}

                {messages.map((msg, i) => (
                    <div key={msg.id || i} className={`flex items-end gap-3 ${msg.is_admin ? 'justify-start' : 'justify-end'} animate-fade-in`}>
                        {msg.is_admin && (
                            <div className="w-8 h-8 rounded-xl bg-primary/10 border border-primary/20 overflow-hidden shrink-0">
                                <img src={`https://api.dicebear.com/7.x/notionists/svg?seed=Felix`} alt="Admin" className="w-full h-full object-contain" />
                            </div>
                        )}
                        <div className={`max-w-[70%] p-5 rounded-[2rem] flex flex-col gap-2 ${msg.is_admin ? 'bg-[#1a1c22] rounded-bl-lg border border-white/5' : 'bg-primary rounded-tr-lg shadow-xl shadow-primary/10 text-dark font-bold'}`}>
                            <p className="text-xs leading-relaxed">{msg.content}</p>
                            <div className={`flex items-center gap-1.5 text-[8px] font-black uppercase tracking-tighter ${msg.is_admin ? 'text-white/20' : 'text-dark/40'}`}>
                                <Clock size={10} />
                                {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </div>
                        </div>
                        {!msg.is_admin && (
                             <div className="w-8 h-8 rounded-xl border border-white/5 bg-white/5 p-1 overflow-hidden shrink-0">
                                 <User size={20} className="w-full h-full text-white/20" />
                             </div>
                        )}
                    </div>
                ))}
                <div ref={scrollRef} />
            </main>

            {/* Input Area */}
            <form onSubmit={handleSendMessage} className="p-8 pb-10 border-t border-white/5 bg-[#1a1c22]">
                <div className="relative">
                    <input 
                        type="text" 
                        placeholder="Message Admin Node..." 
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
                <p className="text-center text-[8px] font-black text-white/10 uppercase tracking-[0.4em] mt-6">
                    Maatla Kebs Technical Surveillance Node
                </p>
            </form>
        </div>
    );
};
