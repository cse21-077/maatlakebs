import React, { useState, useEffect, useRef } from 'react';
import {
    ChevronLeft, Send, User, ShieldCheck,
    ArrowDown, MessageSquare, Clock, ShieldAlert, Bell
} from 'lucide-react';
import { supabase } from '../lib/supabase';

// VAPID public key for push notifications
const VAPID_PUBLIC_KEY = 'BCuOGe8e3f4Dt-BhVjS3m7KI5tSniQbPUoz85WvOmVB0retsClv3jR65FtHKzfn9EkGDIxKVXRj2e_veuBcyLUI';

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const array = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; i++) array[i] = rawData.charCodeAt(i);
    return array;
}

async function subscribeToPush(uid: string) {
    try {
        if (!('Notification' in window) || !('serviceWorker' in navigator)) {
            console.warn('[Push] Notifications or Service Workers not supported');
            return;
        }
        
        const permission = await Notification.requestPermission();
        console.log('[Push] Permission status:', permission);
        
        if (permission !== 'granted') {
            console.warn('[Push] User denied notification permission');
            return;
        }
        
        const reg = await navigator.serviceWorker.ready;
        console.log('[Push] Service worker ready');
        
        let sub = await reg.pushManager.getSubscription();
        
        if (!sub) {
            console.log('[Push] No existing subscription, creating new one...');
            try {
                sub = await reg.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
                });
                console.log('[Push] Successfully subscribed:', sub);
            } catch (err) {
                console.error('[Push] Failed to subscribe:', err);
                return;
            }
        } else {
            console.log('[Push] Existing subscription found');
        }
        
        // Save subscription to Supabase
        const { error } = await (supabase.from('push_subscriptions' as any) as any).upsert({
            user_id: uid,
            subscription: JSON.stringify(sub),
            updated_at: new Date().toISOString()
        }, { onConflict: 'user_id' });
        
        if (error) {
            console.error('[Push] Failed to save subscription:', error);
        } else {
            console.log('[Push] Subscription saved to Supabase');
        }
    } catch (err) {
        console.error('[Push] Subscription error:', err);
    }
}

interface SupportProtocolProps {
    uid: string;
    onBack: () => void;
    prefillMessage?: string;
    onUnreadChanged?: () => void; // Called when messages are marked as read or reactions added
}

interface Message {
    id: string;
    user_id: string;
    content: string;
    is_admin: boolean;
    created_at: string;
    is_read?: boolean;
    reactions?: Record<string, string[]>;
}

export const SupportProtocol = ({ uid, onBack, prefillMessage, onUnreadChanged }: SupportProtocolProps) => {
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState(prefillMessage || '');
    const [loading, setLoading] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);
    const [messageSent, setMessageSent] = useState(false);
    const [showReactionPicker, setShowReactionPicker] = useState<string | null>(null);
    
    const reactions = ['👍', '❤️', '🔥', '😂', '🙏', '👌'];

    const loadMessages = async () => {
        const { data, error } = await supabase
            .from('support_messages' as any)
            .select('*')
            .eq('user_id', uid)
            .order('created_at', { ascending: true });

        if (data) {
            setMessages(data);
            // Mark admin messages as read
            const unreadAdminIds = data
                .filter((m: Message) => m.is_admin && !m.is_read)
                .map((m: Message) => m.id);
            
            if (unreadAdminIds.length > 0) {
                markAsRead(unreadAdminIds);
            }
        }
    };

    const markAsRead = async (messageIds: string[]) => {
        try {
            console.log('[SupportProtocol] Marking as read:', messageIds.length, 'messages');
            const { error } = await (supabase.from('support_messages' as any) as any)
                .update({ is_read: true, updated_at: new Date().toISOString() })
                .in('id', messageIds);
            
            if (!error) {
                setMessages(prev => prev.map(m => 
                    messageIds.includes(m.id) ? { ...m, is_read: true } : m
                ));
                // Notify parent that unread status changed
                if (onUnreadChanged) {
                    console.log('[SupportProtocol] Calling onUnreadChanged callback');
                    onUnreadChanged();
                }
            }
        } catch (err) {
            console.error('Failed to mark as read:', err);
        }
    };

    const addReaction = async (messageId: string, emoji: string) => {
        try {
            console.log('[SupportProtocol] Adding reaction:', emoji, 'to message:', messageId);
            const message = messages.find(m => m.id === messageId);
            if (!message) return;

            const reactions = message.reactions || {};
            const currentReactions = reactions[emoji] || [];
            
            // Toggle reaction
            if (currentReactions.includes(uid)) {
                reactions[emoji] = currentReactions.filter(id => id !== uid);
                if (reactions[emoji].length === 0) delete reactions[emoji];
            } else {
                reactions[emoji] = [...currentReactions, uid];
            }

            const { error } = await (supabase.from('support_messages' as any) as any)
                .update({ reactions, updated_at: new Date().toISOString() })
                .eq('id', messageId);

            if (!error) {
                setMessages(prev => prev.map(m => 
                    m.id === messageId ? { ...m, reactions } : m
                ));
                // Notify parent that unread status might have changed
                if (onUnreadChanged) {
                    console.log('[SupportProtocol] Calling onUnreadChanged after reaction');
                    onUnreadChanged();
                }
            }
        } catch (err) {
            console.error('Failed to add reaction:', err);
        }
        setShowReactionPicker(null);
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
        // Request push notification permission and subscribe
        subscribeToPush(uid);

        // Real-time subscription — only picks up admin replies (not our own optimistic sends)
        const channel = supabase.channel('support_changes')
            .on('postgres_changes' as any,
                { event: 'INSERT', schema: 'public', table: 'support_messages', filter: `user_id=eq.${uid}` },
                (payload: any) => {
                    // Only add if it's an admin message (our own messages are already optimistically added)
                    if (payload.new.is_admin) {
                        setMessages(prev => [...prev, payload.new]);
                    }
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
        const content = input.trim();
        const optimisticMsg: Message = {
            id: `optimistic-${Date.now()}`,
            user_id: uid,
            content,
            is_admin: false,
            created_at: new Date().toISOString()
        };

        // Optimistically show the message immediately
        setMessages(prev => [...prev, optimisticMsg]);
        setInput('');

        try {
            const { data, error } = await (supabase.from('support_messages' as any) as any)
                .insert({ user_id: uid, content, is_admin: false })
                .select()
                .single();
            if (error) throw error;
            // Replace optimistic message with real one from DB
            setMessages(prev => prev.map(m => m.id === optimisticMsg.id ? data : m));
            // Notify parent that unread status changed (user sent a message)
            if (onUnreadChanged) {
                console.log('[SupportProtocol] Message sent, calling onUnreadChanged');
                onUnreadChanged();
            }
        } catch (e: any) {
            console.error('Chat Error:', e.message);
            // Remove optimistic message on failure
            setMessages(prev => prev.filter(m => m.id !== optimisticMsg.id));
            setInput(content); // restore input
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
                    <div key={msg.id || i} className={`flex items-end gap-3 ${msg.is_admin ? 'justify-start' : 'justify-end'} animate-fade-in group relative`}>
                        {msg.is_admin && (
                            <div className="w-8 h-8 rounded-xl bg-primary/10 border border-primary/20 overflow-hidden shrink-0">
                                <img src={`https://api.dicebear.com/7.x/notionists/svg?seed=Felix`} alt="Admin" className="w-full h-full object-contain" />
                            </div>
                        )}
                        <div className="flex flex-col gap-2">
                            <div className={`max-w-[70%] p-5 rounded-[2rem] flex flex-col gap-2 ${msg.is_admin ? 'bg-[#1a1c22] rounded-bl-lg border border-white/5' : 'bg-primary rounded-tr-lg shadow-xl shadow-primary/10 text-white font-bold'}`}>
                                <p className="text-xs leading-relaxed">{msg.content}</p>
                                <div className={`flex items-center gap-1.5 text-[8px] font-black uppercase tracking-tighter ${msg.is_admin ? 'text-white/20' : 'text-white/50'}`}>
                                    <Clock size={10} />
                                    {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    {msg.is_read && msg.is_admin && (
                                        <span className="text-white/30 ml-2">✓</span>
                                    )}
                                </div>
                            </div>
                            {/* Reactions */}
                            {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                                <div className={`flex flex-wrap gap-2 ${msg.is_admin ? 'ml-8' : 'justify-end mr-8'}`}>
                                    {Object.entries(msg.reactions).map(([emoji, users]) => (
                                        <button
                                            key={emoji}
                                            onClick={() => addReaction(msg.id, emoji)}
                                            className={`px-2 py-1 rounded-lg text-sm font-bold transition-all ${
                                                users.includes(uid)
                                                    ? 'bg-primary/20 border border-primary'
                                                    : 'bg-white/5 border border-white/10 hover:bg-white/10'
                                            }`}
                                            title={users.length === 1 ? 'You reacted' : `${users.length} reactions`}
                                        >
                                            {emoji} {users.length > 1 ? users.length : ''}
                                        </button>
                                    ))}
                                </div>
                            )}
                            {/* Reaction Picker */}
                            {showReactionPicker === msg.id && (
                                <div className={`flex gap-1 p-2 bg-[#1a1c22] rounded-xl border border-white/5 ${msg.is_admin ? 'ml-8' : 'justify-end mr-8'}`}>
                                    {reactions.map((emoji) => (
                                        <button
                                            key={emoji}
                                            onClick={() => addReaction(msg.id, emoji)}
                                            className="text-xl hover:scale-125 transition-all"
                                        >
                                            {emoji}
                                        </button>
                                    ))}
                                </div>
                            )}
                            {/* Reaction Button */}
                            <div className={`flex gap-1 opacity-0 group-hover:opacity-100 transition-all ${msg.is_admin ? 'ml-8' : 'justify-end mr-8'}`}>
                                <button
                                    onClick={() => setShowReactionPicker(showReactionPicker === msg.id ? null : msg.id)}
                                    className="text-[10px] px-2 py-1 bg-white/5 border border-white/10 rounded-lg font-bold text-white/50 hover:text-white hover:bg-white/10 transition-all"
                                >
                                    React
                                </button>
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
