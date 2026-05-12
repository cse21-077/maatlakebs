import React, { useState } from 'react';
import { User, Lock, AlertCircle, CheckCircle2, Mail, Key, Eye, EyeOff } from 'lucide-react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { Button, Card } from './shared';
import { ForgotPasswordOTP } from './ForgotPasswordOTP';

interface Props { onLogin: (s?: Session) => void; }

export const AuthScreen = ({ onLogin }: Props) => {
    const [tab, setTab] = useState<'login' | 'register'>('login');

    // ── Login state ──
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    // ── Register state ──
    const [rName, setRName] = useState('');
    const [rEmail, setREmail] = useState('');
    const [rPass, setRPass] = useState('');
    const [rConfirm, setRConfirm] = useState('');
    const [showRPass, setShowRPass] = useState(false);
    const [showRConfirm, setShowRConfirm] = useState(false);
    const [rLoading, setRLoading] = useState(false);
    const [rError, setRError] = useState('');

    // ── Forgot password state ──
    const [forgotMode, setForgotMode] = useState(false);

    const SYSTEM_REFERRAL_CODE = 'MKB96';

    const switchTab = (t: 'login' | 'register') => {
        setTab(t); setError(''); setRError(''); setForgotMode(false);
    };

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true); setError('');
        
        console.log('[Login] Attempting sign-in for:', email);

        const { data, error: err } = await supabase.auth.signInWithPassword({ email, password });
        
        if (err) { 
            console.error('[Login] Error:', err);
            setError(err.message); 
            setLoading(false); 
            return; 
        }

        console.log('[Login] Sign-in successful! User ID:', data.user?.id);
        if (data.user) onLogin();
        setLoading(false);
    };

    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault();
        setRError('');
        if (rPass.length < 8) { setRError('Password must be at least 8 characters.'); return; }
        if (rPass !== rConfirm) { setRError('Passwords do not match.'); return; }
        setRLoading(true);

        try {
            console.log('[Register] Starting signup for:', rEmail);

            const { data, error: signUpErr } = await supabase.auth.signUp({
                email: rEmail,
                password: rPass,
                options: { 
                    data: { 
                        full_name: rName
                    } 
                }
            });

            if (signUpErr) { 
                console.error('[Register] Supabase Sign-Up Error:', signUpErr);
                setRError(signUpErr.message); 
                setRLoading(false); 
                return; 
            }

            console.log('[Register] Sign-Up Success! User ID:', data.user?.id);
            // Switch to login tab after successful registration
            setRName('');
            setREmail('');
            setRPass('');
            setRConfirm('');
            setRError('');
            switchTab('login');
        } catch (e: any) {
            console.error('[Register] Unexpected Exception:', e);
            setRError(e.message || 'An unexpected error occurred.');
        } finally {
            setRLoading(false);
        }
    };

    const handleSocialLogin = async (provider: 'google') => {
        const { error } = await supabase.auth.signInWithOAuth({
            provider,
            options: {
                redirectTo: window.location.origin,
            },
        });
        if (error) {
            setError(error.message);
            setRError(error.message);
        }
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
                    {!forgotMode && (
                        <>
                            {/* Social Login Option */}
                            <div className="space-y-4">
                                <button 
                                    type="button"
                                    onClick={() => handleSocialLogin('google')}
                                    className="w-full flex items-center justify-center gap-3 bg-[#161e31] hover:bg-[#1c263d] border border-white/5 py-4 rounded-2xl transition-all group"
                                >
                                    <img src="https://www.gstatic.com/images/branding/product/1x/gsa_512dp.png" className="w-5 h-5 opacity-70 group-hover:opacity-100 transition-opacity" alt="Google" />
                                    <span className="text-[10px] font-bold text-white/60 group-hover:text-white uppercase tracking-widest">Continue with Google</span>
                                </button>
                            </div>

                            <div className="flex items-center gap-4 px-2">
                                <div className="h-[1px] flex-1 bg-white/5" />
                                <span className="text-[9px] text-white/20 font-bold uppercase tracking-[0.2em]">Secure Email Protocol</span>
                                <div className="h-[1px] flex-1 bg-white/5" />
                            </div>

                            {/* Tab Controller */}
                            <div className="flex bg-[#161e31] p-1.5 rounded-2xl border border-white/5">
                                <button onClick={() => switchTab('login')} className={`flex-1 py-3 text-[10px] font-bold uppercase tracking-widest rounded-xl transition-all ${tab === 'login' ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'text-white/40'}`}>Sign In</button>
                                <button onClick={() => switchTab('register')} className={`flex-1 py-3 text-[10px] font-bold uppercase tracking-widest rounded-xl transition-all ${tab === 'register' ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'text-white/40'}`}>Create Account</button>
                            </div>
                        </>
                    )}

                    {/* Forgot Password Form - Using OTP */}
                    {tab === 'login' && forgotMode && (
                        <ForgotPasswordOTP 
                            onBack={() => setForgotMode(false)}
                            onSuccess={() => {
                                setForgotMode(false);
                                setEmail('');
                                setPassword('');
                            }}
                        />
                    )}

                    {/* Login Form */}
                    {tab === 'login' && !forgotMode && (
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
                                    <div className="flex items-center justify-between">
                                        <label className="text-[10px] text-white/40 font-bold uppercase tracking-widest ml-1">Password</label>
                                        <button type="button" onClick={() => setForgotMode(true)} className="text-[10px] font-bold text-primary uppercase tracking-widest hover:text-primary/80 transition-all">
                                            Forgot?
                                        </button>
                                    </div>
                                    <div className="relative">
                                        <Key className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20" size={18} />
                                        <input type={showPassword ? 'text' : 'password'} required placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)}
                                            className="w-full bg-[#161e31] border border-white/10 rounded-xl py-4 pl-12 pr-12 text-white font-medium focus:border-primary outline-none transition-all" />
                                        <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-all">
                                            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                        </button>
                                    </div>
                                </div>
                            </div>
                            <div className="pt-2 flex flex-col gap-4">
                                <Button loading={loading} type="submit" className="w-full py-4 text-base">
                                    Sign In
                                </Button>
                            </div>
                        </form>
                    )}

                    {/* Register Form */}
                    {tab === 'register' && (
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
                                    <div className="relative">
                                        <Key className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20" size={18} />
                                        <input type={showRPass ? 'text' : 'password'} required placeholder="Min. 8 characters" value={rPass} onChange={e => setRPass(e.target.value)}
                                            className="w-full bg-[#161e31] border border-white/10 rounded-xl py-4 pl-12 pr-12 text-white font-medium focus:border-primary outline-none transition-all" />
                                        <button type="button" onClick={() => setShowRPass(!showRPass)} className="absolute right-4 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-all">
                                            {showRPass ? <EyeOff size={18} /> : <Eye size={18} />}
                                        </button>
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] text-white/40 font-bold uppercase tracking-widest ml-1">Confirm Password</label>
                                    <div className="relative">
                                        <Key className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20" size={18} />
                                        <input type={showRConfirm ? 'text' : 'password'} required placeholder="Confirm password" value={rConfirm} onChange={e => setRConfirm(e.target.value)}
                                            className="w-full bg-[#161e31] border border-white/10 rounded-xl py-4 pl-12 pr-12 text-white font-medium focus:border-primary outline-none transition-all" />
                                        <button type="button" onClick={() => setShowRConfirm(!showRConfirm)} className="absolute right-4 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-all">
                                            {showRConfirm ? <EyeOff size={18} /> : <Eye size={18} />}
                                        </button>
                                    </div>
                                </div>
                            </div>
                            <Button loading={rLoading} type="submit" className="w-full py-4 text-base mt-2">
                                Create Account
                            </Button>
                        </form>
                    )}
                </div>

                <p className="text-[8px] text-center text-white/10 uppercase tracking-[0.5em] font-black py-4">
                    &copy; 2026 MAATLA KEBS | SECURE PROTOCOL
                </p>
            </div>
        </div>
    );
};
