import React, { useState, useEffect } from 'react';
import {
    ShieldCheck, Settings, LayoutDashboard,
    AlertCircle, Smartphone, CheckCircle2, Zap,
    LogOut as LogOutIcon, ShieldAlert, CreditCard, Clock,
    CheckCircle, QrCode, X, WifiOff, Wifi, ChevronRight,
    MessageSquare, HelpCircle, Lock, Unlock, ChevronLeft,
    TrendingUp, User as UserIcon, LifeBuoy, RefreshCw, Bell
} from 'lucide-react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { DEFAULT_TRADER_ID } from '../lib/database.types';
import type { SubscriptionStatus, ConnectionState, RiskProfileRow, StudentAccountRow, PaymentStatusRow } from '../lib/database.types';
import { Button } from './shared';

import { TerminalProtocol } from './TerminalProtocol';
import { MembershipProtocol } from './MembershipProtocol';
import { SupportProtocol } from './SupportProtocol';
import { TechSupportDashboard } from './TechSupportDashboard';
import { AdminDashboard } from './AdminDashboard';
import { ChangePassword } from './ChangePassword';

type AppView = 'HOME' | 'CONFIG' | 'BILLING' | 'SUPPORT';
type UIPaymentStatus = 'UNPAID' | 'CONFIRMED';

interface Props { session: Session; onDisconnect: () => void; }

// ── Main Home View ────────────────────────────────────────────────────────────
export const MainApp = ({ session, onDisconnect }: Props) => {
    const [view, setView] = useState<AppView>('HOME');
    const [showQR, setShowQR] = useState(false);
    const [mt5Login, setMt5Login] = useState('');
    const [paymentStatus, setPaymentStatus] = useState<UIPaymentStatus>('UNPAID');
    const [risk, setRisk] = useState({ aggressiveness: 1.0, maxLot: 0.5, maxDD: 20, pauseCopy: false, advanced_options: {} as any });
    const [supportMessage, setSupportMessage] = useState<string | undefined>();
    const [connectionStatus, setConnectionStatus] = useState<string>('UNKNOWN');
    const [connectionLastChecked, setConnectionLastChecked] = useState<string | null>(null);
    const [dbRole, setDbRole] = useState<string>('student');
    const [showChangePassword, setShowChangePassword] = useState(false);
    const [unreadMessages, setUnreadMessages] = useState(0);

    // Link student to default trader if not present in metadata
    const traderId = session.user.user_metadata?.trader_id || DEFAULT_TRADER_ID;

    const uid = session.user.id;
    const fullName = session.user.user_metadata?.full_name ?? 'Trader';
    const userRole = dbRole;
    const isTechSupport = userRole === 'techsupport';
    const isSuperAdmin = userRole === 'super_admin';
    const initialAvatar = session.user.user_metadata?.avatar_url || `https://api.dicebear.com/7.x/big-ears-neutral/svg?seed=${fullName}`;
    const [avatarUrl, setAvatarUrl] = useState(initialAvatar);
    const [showProfileMenu, setShowProfileMenu] = useState(false);
    const firstName = fullName.split(' ')[0];

    const avatarOptions = [
        `https://api.dicebear.com/7.x/big-ears-neutral/svg?seed=${fullName}`,
        `https://api.dicebear.com/7.x/notionists/svg?seed=${fullName}`,
        `https://api.dicebear.com/7.x/avataaars/svg?seed=${fullName}`,
        `https://api.dicebear.com/7.x/bottts/svg?seed=${fullName}`
    ];

    const handleAvatarSelect = async (url: string) => {
        setAvatarUrl(url);
        await supabase.auth.updateUser({ data: { avatar_url: url } });
    };

    const load = async (updatedRisk?: any) => {
        if (updatedRisk) setRisk(updatedRisk);

        try {
            // Fetch relevant data in parallel for speed
            const [acctRes, payRes, riskRes, userRes] = await Promise.all([
                supabase.from('student_accounts').select('mt5_login').eq('user_id', uid).eq('is_active', true).maybeSingle() as any,
                supabase.from('payment_status').select('subscription_status').eq('user_id', uid).maybeSingle() as any,
                supabase.from('risk_profiles').select('*').eq('user_id', uid).maybeSingle() as any,
                supabase.from('users').select('role').eq('id', uid).maybeSingle() as any,
            ]);

            if (userRes.data?.role) {
                setDbRole(userRes.data.role);
            }

            if (acctRes.data) {
                setMt5Login(acctRes.data.mt5_login);
            }

            if (payRes.data) {
                setPaymentStatus(payRes.data.subscription_status === 'active' ? 'CONFIRMED' : 'UNPAID');
            }

            if (riskRes.data) {
                const r = riskRes.data as RiskProfileRow;
                setRisk({ 
                    aggressiveness: Number(r.aggressiveness), 
                    maxLot: Number(r.max_lot), 
                    maxDD: Number(r.max_drawdown), 
                    pauseCopy: r.pause_copy,
                    advanced_options: r.advanced_options
                });
            }
        } catch (e) { 
            console.error('Load Error:', e); 
        }
        // Refresh connection status after any account change
        await fetchStatus();
    };

    const fetchStatus = async () => {
        if (!uid) return;
        try {
            const response = await fetch(`/api/connection-status?user_id=${uid}`);
            const data = await response.json();
            if (response.ok && data.status) {
                setConnectionStatus(data.status);
                setConnectionLastChecked(data.last_checked || null);
            }
        } catch (e) {
            console.error('Connection status fetch error:', e);
        }
    };

    const fetchUnreadMessages = async () => {
        if (!uid || uid === '00000000-0000-4000-a000-000000000000') return;
        try {
            const response = await fetch(`/api/unread-messages?user_id=${uid}`);
            const data = await response.json();
            if (response.ok) {
                setUnreadMessages(data.unread_count || 0);
            }
        } catch (e) {
            console.error('Unread messages fetch error:', e);
        }
    };

    useEffect(() => { load(); }, [uid, view]);

    // Fetch connection status on mount / uid change + real-time subscription
    useEffect(() => {
        if (!uid) return;

        // Immediate fetch on mount / uid change
        fetchStatus();

        // Subscribe to real-time updates for instant feedback
        // Polling removed — status only changes on link/unlink/server events
        const subscription = (supabase as any)
            .channel('connection_status_changes')
            .on('postgres_changes', 
                { 
                    event: '*', 
                    schema: 'public', 
                    table: 'connection_status', 
                    filter: `user_id=eq.${uid}` 
                },
                (payload: any) => {
                    if (payload.new?.mt5_status) {
                        setConnectionStatus(payload.new.mt5_status);
                    }
                    if (payload.new?.last_checked) {
                        setConnectionLastChecked(payload.new.last_checked);
                    }
                }
            )
            .subscribe();

        return () => {
            subscription.unsubscribe();
        };
    }, [uid]);

    // Fetch unread messages on mount / uid change + real-time subscription
    useEffect(() => {
        if (!uid || uid === '00000000-0000-4000-a000-000000000000') return;

        // Immediate fetch on mount / uid change
        fetchUnreadMessages();

        // Subscribe to real-time updates when new admin messages arrive or messages are marked as read
        const messagesSubscription = (supabase as any)
            .channel('support_messages_changes')
            .on('postgres_changes', 
                { 
                    event: '*', 
                    schema: 'public', 
                    table: 'support_messages', 
                    filter: `user_id=eq.${uid}` 
                },
                (payload: any) => {
                    // Refetch unread count when messages change
                    fetchUnreadMessages();
                }
            )
            .subscribe();

        return () => {
            messagesSubscription.unsubscribe();
        };
    }, [uid]);

    // TechSupport staff dashboard
    if (isTechSupport) {
        return (
            <div className="min-h-screen bg-[#0d0f14]">
                {view === 'HOME' && <TechSupportDashboard uid={uid} onBack={() => setView('HOME')} />}
                {view !== 'HOME' && <TechSupportDashboard uid={uid} onBack={() => setView('HOME')} />}
            </div>
        );
    }

    // Super Admin dashboard
    if (isSuperAdmin) {
        return (
            <div className="min-h-screen bg-[#0d0f14]">
                <AdminDashboard adminId={uid} onBack={() => { /* admin stays in dashboard */ }} />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#0d0f14] flex flex-col pt-12 pb-safe animate-fade-in relative overflow-hidden">
            {view === 'BILLING' && <MembershipProtocol uid={uid} paymentStatus={paymentStatus} onBack={() => setView('HOME')} onRefresh={load} />}
            {view === 'SUPPORT' && <SupportProtocol uid={uid} onBack={() => setView('HOME')} prefillMessage={supportMessage} />}
            {view === 'CONFIG' && <TerminalProtocol uid={uid} traderId={session.user.user_metadata?.trader_id} mt5Login={mt5Login} riskState={risk} paymentStatus={paymentStatus} onBack={() => setView('HOME')} onSuccess={() => setView('HOME')} onRefresh={(r) => load(r)} onOpenSupport={(msg) => { setSupportMessage(msg); setView('SUPPORT'); }} onAccountChanged={load} />}

            {/* Profile Selection Overlay */}
            {showProfileMenu && (
                <div className="fixed inset-0 z-[600] flex items-center justify-center p-8 animate-fade-in backdrop-blur-md bg-dark/60">
                    <div className="w-full max-w-sm bg-[#1a1c22] border border-white/5 rounded-[2.5rem] p-10 space-y-10 shadow-2xl animate-scale-in">
                        <div className="text-center space-y-2">
                            <h3 className="text-xl font-black text-white uppercase tracking-tighter">Profile Protocol</h3>
                            <p className="text-[10px] text-white/30 font-black uppercase tracking-widest leading-relaxed">Select your institutional identifier</p>
                        </div>

                        <div className="grid grid-cols-2 gap-6">
                            {avatarOptions.map((url, i) => (
                                <div key={i} 
                                    onClick={() => handleAvatarSelect(url)}
                                    className={`aspect-square rounded-3xl border-2 transition-all cursor-pointer overflow-hidden p-2 ${avatarUrl === url ? 'border-primary bg-primary/10 shadow-lg shadow-primary/20' : 'border-white/5 bg-white/5 hover:border-white/20'}`}
                                >
                                    <img src={url} alt={`Avatar ${i}`} className="w-full h-full object-contain" />
                                </div>
                            ))}
                        </div>

                        <div className="space-y-4 pt-4">
                            <Button onClick={() => setShowProfileMenu(false)} className="w-full py-5 text-xs uppercase font-black tracking-widest">Done</Button>
                            <button 
                                onClick={() => {
                                    setShowChangePassword(true);
                                    setShowProfileMenu(false);
                                }}
                                className="w-full flex items-center justify-center gap-2 border border-primary/20 text-primary transition-all py-5 rounded-[1.5rem] text-[10px] font-black uppercase tracking-[0.4em] hover:bg-primary/5 hover:border-primary/40 leading-none">
                                <Lock size={14} /> Change Password
                            </button>
                            <button onClick={() => { if (confirm('Logout?')) supabase.auth.signOut().then(onDisconnect) }} 
                                className="w-full flex items-center justify-center gap-2 border border-red-500/20 text-red-500 transition-all py-5 rounded-[1.5rem] text-[10px] font-black uppercase tracking-[0.4em] hover:bg-red-500/5 hover:border-red-500/40 leading-none">
                                <LogOutIcon size={14} /> Logout
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Change Password Modal */}
            {showChangePassword && (
                <div className="fixed inset-0 z-[600] flex items-center justify-center p-8 animate-fade-in backdrop-blur-md bg-dark/60">
                    <div className="w-full max-w-sm bg-[#1a1c22] border border-white/5 rounded-[2.5rem] p-10 shadow-2xl animate-scale-in max-h-[90vh] overflow-y-auto">
                        <ChangePassword 
                            sessionToken={session.access_token}
                            onClose={() => setShowChangePassword(false)}
                        />
                    </div>
                </div>
            )}

            {/* Top Navigation */}
            <header className="px-8 pt-6 flex justify-between items-center h-24 shrink-0">
                <div><h1 className="text-3xl font-black text-white tracking-tighter">{`Hi ${firstName}`}</h1><p className="text-xs text-white/30 font-bold uppercase tracking-widest mt-0.5">Welcome back</p></div>
                <div className="flex items-center gap-4">
                    {/* Notification Bell Icon */}
                    {unreadMessages > 0 && (
                        <button onClick={() => setView('SUPPORT')} className="relative w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-all active:scale-90 group">
                            <Bell size={20} className="text-white/40 group-hover:text-white transition-all" />
                            <div className="absolute top-2 right-2 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center text-[9px] font-black text-white shadow-lg shadow-red-500/50">
                                {unreadMessages > 9 ? '9+' : unreadMessages}
                            </div>
                        </button>
                    )}
                    <div className="w-14 h-14 rounded-2xl border border-white/10 relative overflow-hidden active:scale-95 transition-all shadow-2xl" onClick={() => setShowProfileMenu(true)}>
                        <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                        <div className="absolute bottom-1 right-1 w-3 h-3 bg-green-500 rounded-full border-2 border-[#0d0f14]" />
                    </div>
                </div>
            </header>

            <main className="flex-1 px-8 pt-8 space-y-10 overflow-y-auto pb-10">

                {/* MetaTrader Account Card */}
                <div className="space-y-4">
                    <h3 className="text-xs font-black text-white/30 uppercase tracking-[0.2em] ml-1">Connection</h3>
                    <div className="relative h-[220px] rounded-[2.5rem] bg-[#1a1c22] border border-white/5 overflow-hidden shadow-2xl flex">
                        {/* Slanted Section: BLUE */}
                        <div className="absolute left-[-20%] top-[-20%] w-[100%] h-[140%] bg-gradient-to-br from-[#2138bc] to-[#133284] rotate-[15deg] transition-all"
                            style={{ clipPath: 'polygon(0 0, 85% 0, 65% 100%, 0% 100%)' }} />
                        <div className="relative z-10 w-[60%] p-10 flex flex-col justify-between h-full">
                            <div className="space-y-1"><p className="text-[10px] text-white/50 uppercase font-black tracking-widest leading-none">Terminal</p><h2 className="text-2xl font-black text-white tracking-tighter leading-none">MetaTrader <br /> Account</h2></div>
                            <button onClick={() => setView('CONFIG')} className="flex items-center gap-1 group w-max">
                                <span className="text-sm font-black text-white underline underline-offset-4 decoration-white/20">Configure now</span>
                                <TrendingUp size={16} className="text-white/40 group-hover:text-white transition-all transform group-hover:translate-x-1 group-hover:-translate-y-1" />
                            </button>
                        </div>
                        <div className="relative z-10 w-[40%] pr-10 pt-10 flex flex-col items-end space-y-10 text-right">
                            <div className="space-y-1"><p className="text-[10px] text-white/30 uppercase font-black leading-none tracking-widest">Broker</p><p className="text-xl font-black text-white">Weltrade</p></div>
                            <div className="space-y-1">
                                <p className="text-[10px] text-white/30 font-black tracking-widest leading-none uppercase">Login</p>
                                <p className={`text-xl font-black tracking-tight ${mt5Login ? 'text-white' : 'text-white/10'}`}>{mt5Login || '---'}</p>
                                <div className="flex items-center justify-end gap-2 mt-1">
                                    <div className={`text-[10px] font-black uppercase tracking-widest ${
                                        risk.pauseCopy 
                                            ? 'text-red-500' 
                                            : (mt5Login 
                                                ? (connectionStatus === 'CONNECTED' 
                                                    ? 'text-green-500' 
                                                    : 'text-yellow-500')
                                                : 'text-red-500/30')
                                    }`}>
                                        {risk.pauseCopy 
                                            ? '○ Disconnected' 
                                            : (mt5Login 
                                                ? (() => {
                                                    switch(connectionStatus) {
                                                        case 'CONNECTED': return '● Connected';
                                                        case 'ERROR': return '◉ Checking...';
                                                        case 'UNKNOWN': return '◉ Verifying...';
                                                        default: return '○ Standby';
                                                    }
                                                  })()
                                                : '○ Standby')
                                        }
                                    </div>
                                    {mt5Login && (
                                        <button
                                            onClick={async () => {
                                                try {
                                                    const res = await fetch(`/api/connection-status?user_id=${uid}`);
                                                    const data = await res.json();
                                                    if (res.ok && data.status) {
                                                        setConnectionStatus(data.status);
                                                        setConnectionLastChecked(data.last_checked || null);
                                                    }
                                                } catch (e) { console.error(e); }
                                            }}
                                            className="text-white/20 hover:text-white/60 transition-all"
                                            title="Check connection"
                                        >
                                            <RefreshCw size={12} />
                                        </button>
                                    )}
                                </div>
                                {mt5Login && connectionLastChecked && (
                                    <p className="text-[8px] text-white/10 font-black uppercase tracking-widest mt-0.5">
                                        Checked {new Date(connectionLastChecked).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </p>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Services Section */}
                <div className="space-y-6 pb-10">
                    <h3 className="text-xs font-black text-white/30 uppercase tracking-[0.2em] ml-1">Services</h3>
                    <div className="flex flex-col gap-6">
                        {/* Membership Card (Horizontal, Slanted - Balanced Alignment) */}
                        <div onClick={() => setView('BILLING')}
                            className="relative h-[140px] rounded-[2.5rem] bg-[#1a1c22] border border-white/5 overflow-hidden shadow-xl flex active:scale-95 transition-all cursor-pointer">
                            {/* Slanted Section: Balanced WHITE on Right - Full Coverage */}
                            <div className="absolute left-[45%] top-[-50%] w-[150%] h-[200%] bg-white rotate-[15deg]"
                                style={{ clipPath: 'polygon(0 0, 100% 0, 100% 100%, 15% 100%)' }} />

                            <div className="relative z-10 w-[55%] p-8 flex flex-col items-start h-full">
                                <CreditCard size={28} className="text-white/40 mb-auto" />
                                <div className="space-y-0.5 mt-4">
                                    <p className="text-lg font-black text-white uppercase leading-none">Membership</p>
                                    <p className="text-[10px] font-bold text-white/30 uppercase tracking-[0.2em]">Manage Billing</p>
                                </div>
                            </div>

                            <div className="relative z-10 w-[45%] flex items-center justify-center pr-4">
                                <img src="/binace.png" alt="Binance" className="w-14" />
                            </div>
                        </div>

                        {/* Support Card (Horizontal banner) */}
                        <div onClick={() => setView('SUPPORT')}
                            className="relative h-[140px] rounded-[2.5rem] overflow-hidden shadow-xl active:scale-95 transition-all cursor-pointer border border-white/5">
                            <img src="/support.jpg" alt="Support" className="absolute inset-0 w-full h-full object-cover opacity-60" />
                            <div className="absolute inset-0 bg-gradient-to-r from-dark/95 via-dark/40 to-transparent" />
                            <div className="absolute inset-0 p-8 flex flex-col justify-between items-start">
                                <div className="relative">
                                    <LifeBuoy size={28} className="text-white/40" />
                                    {unreadMessages > 0 && (
                                        <div className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 rounded-full flex items-center justify-center text-[10px] font-black text-white shadow-lg shadow-red-500/50 animate-pulse">
                                            {unreadMessages > 9 ? '9+' : unreadMessages}
                                        </div>
                                    )}
                                </div>
                                <div>
                                    <p className="text-lg font-black text-white uppercase leading-none">Get Help</p>
                                    <p className="text-[10px] font-bold text-white/50 uppercase tracking-[0.2em]">
                                        {unreadMessages > 0 ? `${unreadMessages} unread message${unreadMessages !== 1 ? 's' : ''}` : 'Live Tech Support Chat'}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <p className="text-[9px] text-center text-white/5 uppercase tracking-[0.6em] font-black pb-6 pt-2">@ Copy By Kebs</p>
            </main>
        </div>
    );
};
