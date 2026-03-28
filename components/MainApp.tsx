import React, { useState, useEffect } from 'react';
import {
    ShieldCheck, Settings, LayoutDashboard,
    AlertCircle, Smartphone, CheckCircle2, Zap,
    LogOut as LogOutIcon, ShieldAlert, CreditCard, Clock,
    CheckCircle, QrCode, X, WifiOff, Wifi, ChevronRight,
    MessageSquare, HelpCircle, Lock, Unlock, ChevronLeft,
    TrendingUp, User as UserIcon, LifeBuoy
} from 'lucide-react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { SubscriptionStatus, ConnectionState } from '../lib/database.types';
import { Button } from './shared';

import { TerminalProtocol } from './TerminalProtocol';
import { MembershipProtocol } from './MembershipProtocol';

type AppView = 'HOME' | 'CONFIG' | 'BILLING';
type UIPaymentStatus = 'UNPAID' | 'CONFIRMED';

interface Props { session: Session; onDisconnect: () => void; }

// ── Main Home View ────────────────────────────────────────────────────────────
export const MainApp = ({ session, onDisconnect }: Props) => {
    const [view, setView] = useState<AppView>('HOME');
    const [showQR, setShowQR] = useState(false);
    const [mt5Login, setMt5Login] = useState('');
    const [paymentStatus, setPaymentStatus] = useState<UIPaymentStatus>('UNPAID');
    const [risk, setRisk] = useState({ aggressiveness: 1.0, maxLot: 0.5, maxDD: 20, pauseCopy: false });

    const uid = session.user.id;
    const fullName = session.user.user_metadata?.full_name ?? 'Trader';
    const firstName = fullName.split(' ')[0];

    const load = async (updatedRisk?: any) => {
        if (updatedRisk) setRisk(updatedRisk);

        const isGuest = uid === '00000000-0000-4000-a000-000000000000';
        if (isGuest) { 
            setMt5Login('8850921'); 
            setPaymentStatus('CONFIRMED'); 
            return; 
        }
        
        try {
            const { data: acct } = await supabase.from('student_accounts').select('mt5_login').eq('user_id', uid).single();
            const { data: ps } = await supabase.from('payment_status').select('subscription_status').eq('user_id', uid).single();
            setMt5Login(acct ? (acct as any).mt5_login : '');
            setPaymentStatus(ps?.subscription_status === 'active' ? 'CONFIRMED' : 'UNPAID');
            const { data: r } = await supabase.from('risk_profiles').select('*').eq('user_id', uid).single();
            if (r) {
                const rs = r as any;
                setRisk({ aggressiveness: rs.aggressiveness, maxLot: rs.max_lot, maxDD: rs.max_drawdown, pauseCopy: rs.pause_copy });
            }
        } catch (e) { console.error('Load Error:', e); }
    };

    useEffect(() => { load(); }, [uid, view]);

    return (
        <div className="min-h-screen bg-[#0d0f14] flex flex-col pt-safe animate-fade-in relative overflow-hidden">
            {view === 'BILLING' && <MembershipProtocol uid={uid} paymentStatus={paymentStatus} onBack={() => setView('HOME')} onRefresh={load} />}
            {view === 'CONFIG' && <TerminalProtocol uid={uid} traderId={session.user.user_metadata?.trader_id} mt5Login={mt5Login} riskState={risk} paymentStatus={paymentStatus} onBack={() => setView('HOME')} onSuccess={() => setView('HOME')} onRefresh={(r) => load(r)} />}

            {/* Top Navigation */}
            <header className="px-8 pt-8 flex justify-between items-center h-24 shrink-0">
                <div><h1 className="text-3xl font-black text-white tracking-tighter">Hi {firstName}</h1><p className="text-xs text-white/30 font-bold uppercase tracking-widest mt-0.5">Welcome back</p></div>
                <div className="w-14 h-14 rounded-2xl border border-white/10 relative overflow-hidden active:scale-95 transition-all shadow-2xl" onClick={() => { if (confirm('Logout?')) supabase.auth.signOut().then(onDisconnect) }}>
                    <img src={`https://api.dicebear.com/7.x/big-ears-neutral/svg?seed=${firstName}`} alt="Avatar" className="w-full h-full object-cover" />
                    <div className="absolute bottom-1 right-1 w-3 h-3 bg-green-500 rounded-full border-2 border-[#0d0f14]" />
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
                                <div className={`text-[10px] font-black uppercase tracking-widest mt-1 ${risk.pauseCopy ? 'text-red-500' : (mt5Login ? 'text-green-500' : 'text-red-500/30')}`}>
                                    {risk.pauseCopy ? '○ Disconnected' : (mt5Login ? '● Connected' : '○ Standby')}
                                </div>
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
                        <div onClick={() => window.open('https://wa.me/26771000000', '_blank')}
                            className="relative h-[140px] rounded-[2.5rem] overflow-hidden shadow-xl active:scale-95 transition-all cursor-pointer border border-white/5">
                            <img src="/support.jpg" alt="Support" className="absolute inset-0 w-full h-full object-cover opacity-60" />
                            <div className="absolute inset-0 bg-gradient-to-r from-dark/95 via-dark/40 to-transparent" />
                            <div className="absolute inset-0 p-8 flex flex-col justify-between items-start">
                                <LifeBuoy size={28} className="text-white/40" />
                                <div>
                                    <p className="text-lg font-black text-white uppercase leading-none">Technical Help</p>
                                    <p className="text-[10px] font-bold text-white/50 uppercase tracking-[0.2em]">Live Support Node</p>
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
