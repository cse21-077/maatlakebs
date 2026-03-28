import React, { useState } from 'react';
import { User, Lock, AlertCircle, CheckCircle2, Mail, Key } from 'lucide-react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { Button, Card } from './shared';

interface Props { onLogin: (s?: Session) => void; }

const mockSession: Session = {
    access_token: 'mock',
    refresh_token: 'mock',
    expires_in: 3600,
    token_type: 'bearer',
    user: {
        id: '00000000-0000-4000-a000-000000000000',
        app_metadata: {},
        user_metadata: { full_name: 'Demo User', trader_id: '00000000-0000-0000-0000-000000000000' },
        aud: 'authenticated',
        created_at: new Date().toISOString(),
        email: 'demo@maatlakebs.com',
    }
} as any;

export const AuthScreen = ({ onLogin }: Props) => {
    const [tab, setTab] = useState<'login' | 'register'>('login');

    // ── Login state ──
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    // ── Register state ──
    const [rName, setRName] = useState('');
    const [rEmail, setREmail] = useState('');
    const [rPass, setRPass] = useState('');
    const [rConfirm, setRConfirm] = useState('');
    const [rLoading, setRLoading] = useState(false);
    const [rError, setRError] = useState('');
    const [rSuccess, setRSuccess] = useState(false);

    const SYSTEM_REFERRAL_CODE = 'MKB96';

    const switchTab = (t: 'login' | 'register') => {
        setTab(t); setError(''); setRError('');
    };

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true); setError('');
        const { data, error: err } = await supabase.auth.signInWithPassword({ email, password });
        if (err) { setError(err.message); setLoading(false); return; }
        if (data.user) onLogin();
        setLoading(false);
    };

    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault();
        setRError('');
        if (rPass.length < 8) { setRError('Password must be at least 8 characters.'); return; }
        setRLoading(true);

        const { data: trader, error: tErr } = await supabase.from('users').select('id')
            .eq('referral_code', SYSTEM_REFERRAL_CODE).eq('role', 'trader').single();

        if (tErr || !trader) { setRError('System configuration error.'); setRLoading(false); return; }

        const { data, error: signUpErr } = await supabase.auth.signUp({
            email: rEmail, password: rPass, options: { data: { full_name: rName, trader_id: (trader as any).id } } as any,
        });

        if (signUpErr) { setRError(signUpErr.message); setRLoading(false); return; }

        if (data.user) {
            await (supabase.from('users') as any).insert({ id: (data.user as any).id, full_name: rName, email: rEmail, role: 'student', trader_id: (trader as any).id });
            setRSuccess(true);
        }
        setRLoading(false);
    };

    return (
        <div className="min-h-screen bg-dark flex flex-col items-center justify-center p-6 animate-fade-in overflow-y-auto pt-safe pb-safe">
            <div className="w-full max-w-sm space-y-10">
                {/* Clean Logo Header */}
                <div className="flex flex-col items-center text-center space-y-4">
                    <div className="w-20 h-20 bg-[#1a1c22] border border-white/10 rounded-3xl flex items-center justify-center shadow-2xl mb-2">
                        <img src="/MK Logo.png" alt="Maatla Kebs" className="w-12 h-12 object-contain" />
                    </div>
                    <div className="space-y-1">
                        <h1 className="text-2xl font-bold text-white tracking-tight">Maatla Kebs</h1>
                        <p className="text-xs text-white/30 font-medium uppercase tracking-[0.2em]">Premium Copy Trading</p>
                    </div>
                </div>

                <div className="space-y-6">
                    {/* Tab Controller */}
                    <div className="flex bg-[#161e31] p-1.5 rounded-2xl border border-white/5">
                        <button onClick={() => switchTab('login')} className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider rounded-xl transition-all ${tab === 'login' ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'text-white/40'}`}>Login</button>
                        <button onClick={() => switchTab('register')} className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider rounded-xl transition-all ${tab === 'register' ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'text-white/40'}`}>Register</button>
                    </div>

                    {/* Login Form */}
                    {tab === 'login' && (
                        <form onSubmit={handleLogin} className="space-y-5 animate-fade-in">
                            {error && <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-red-400 text-xs font-medium">{error}</div>}
                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <label className="text-[10px] text-white/40 font-bold uppercase tracking-widest ml-1">Email Address</label>
                                    <div className="relative">
                                        <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20" size={18} />
                                        <input type="email" required placeholder="name@example.com" value={email} onChange={e => setEmail(e.target.value)}
                                            className="w-full bg-[#161e31] border border-white/10 rounded-xl py-4 pl-12 pr-5 text-white font-medium focus:border-primary outline-none transition-all" />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] text-white/40 font-bold uppercase tracking-widest ml-1">Password</label>
                                    <div className="relative">
                                        <Key className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20" size={18} />
                                        <input type="password" required placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)}
                                            className="w-full bg-[#161e31] border border-white/10 rounded-xl py-4 pl-12 pr-5 text-white font-medium focus:border-primary outline-none transition-all" />
                                    </div>
                                </div>
                            </div>
                            <div className="pt-2 flex flex-col gap-4">
                                <Button loading={loading} type="submit" className="w-full py-4 text-base">
                                    Sign In
                                </Button>
                                <button type="button" onClick={() => onLogin(mockSession)} className="text-xs font-bold text-white/20 uppercase tracking-widest hover:text-white transition-colors">
                                    Continue as Guest
                                </button>
                            </div>
                        </form>
                    )}

                    {/* Register Form */}
                    {tab === 'register' && !rSuccess && (
                        <form onSubmit={handleRegister} className="space-y-5 animate-fade-in">
                            {rError && <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-red-400 text-xs font-medium">{rError}</div>}
                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <label className="text-[10px] text-white/40 font-bold uppercase tracking-widest ml-1">Official Name</label>
                                    <input type="text" required placeholder="Full Name" value={rName} onChange={e => setRName(e.target.value)}
                                        className="w-full bg-[#161e31] border border-white/10 rounded-xl py-4 px-5 text-white font-medium focus:border-primary outline-none transition-all" />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] text-white/40 font-bold uppercase tracking-widest ml-1">Email Address</label>
                                    <input type="email" required placeholder="name@example.com" value={rEmail} onChange={e => setREmail(e.target.value)}
                                        className="w-full bg-[#161e31] border border-white/10 rounded-xl py-4 px-5 text-white font-medium focus:border-primary outline-none transition-all" />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] text-white/40 font-bold uppercase tracking-widest ml-1">Create Password</label>
                                    <input type="password" required placeholder="Min. 8 characters" value={rPass} onChange={e => setRPass(e.target.value)}
                                        className="w-full bg-[#161e31] border border-white/10 rounded-xl py-4 px-5 text-white font-medium focus:border-primary outline-none transition-all" />
                                </div>
                            </div>
                            <Button loading={rLoading} type="submit" className="w-full py-4 text-base mt-2">
                                Create Account
                            </Button>
                        </form>
                    )}

                    {/* Register Success */}
                    {tab === 'register' && rSuccess && (
                        <div className="bg-[#161e31] border border-white/5 rounded-3xl p-10 text-center space-y-6 animate-fade-in">
                            <div className="w-20 h-20 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-2 text-green-500">
                                <CheckCircle2 size={40} />
                            </div>
                            <div className="space-y-2">
                                <h3 className="text-xl font-bold text-white tracking-tight">Check your email</h3>
                                <p className="text-sm text-white/40 leading-relaxed">
                                    We've sent a verification link to <span className="text-white font-bold">{rEmail}</span>.
                                </p>
                            </div>
                            <Button variant="outline" className="w-full" onClick={() => { switchTab('login'); setRSuccess(false); }}>
                                Return to Login
                            </Button>
                        </div>
                    )}
                </div>

                <p className="text-[8px] text-center text-white/10 uppercase tracking-[0.5em] font-black py-4">
                    &copy; 2026 MAATLA KEBS | SECURE PROTOCOL
                </p>
            </div>
        </div>
    );
};
