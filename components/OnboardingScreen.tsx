import React, { useState } from 'react';
import { AlertCircle, CheckCircle2, CheckCircle, ShieldAlert } from 'lucide-react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { Button } from './shared';

interface Props { session: Session; onComplete: () => void; }

export const OnboardingScreen = ({ session, onComplete }: Props) => {
    const [step, setStep] = useState(0);
    const [mt5, setMt5] = useState({ login: '', server: '', password: '' });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [termsAccepted, setTermsAccepted] = useState(false);

    const isWeltrade = (s: string) => /weltrade/i.test(s);
    const traderId = session.user.user_metadata?.trader_id ?? null;

    const handleNext = async () => {
        setError('');
        if (step === 0) { setStep(1); return; }

        if (!termsAccepted) {
            setError('Please accept the Terms of Service to continue.'); return;
        }

        setLoading(true);

        const isGuest = session.user.id === '00000000-0000-4000-a000-000000000000';

        if (!isGuest) {
            // Create or update risk profile to mark onboarding as complete
            const { error: riskErr } = await supabase.from('risk_profiles')
                .upsert({
                    user_id: session.user.id,
                    aggressiveness: 1.0,
                    max_lot: 0.5,
                    max_drawdown: 20,
                    pause_copy: false,
                    trader_id: traderId
                } as any, { onConflict: 'user_id' });

            if (riskErr) {
                console.error('Onboarding Error:', riskErr);
                setError('System error: ' + riskErr.message);
                setLoading(false);
                return;
            }
        }

        setLoading(false);
        onComplete();
    };

    const steps = [
        {
            title: 'Get Started',
            content: (
                <div className="fixed inset-0 z-0 h-[100dvh] bg-dark overflow-hidden flex flex-col">
                    <img src="/kebs.jpg" alt="Mentor" className="absolute inset-0 w-full h-full object-cover object-top scale-105" />
                    <div className="absolute inset-0 bg-gradient-to-t from-dark via-dark/30 to-transparent" />
                    
                    {/* Scrollable Content Container */}
                    <div className="relative z-10 flex-1 overflow-y-auto flex flex-col justify-between p-10 pb-safe pb-16 pt-[8dvh]">
                        <div className="animate-fade-in max-w-sm shrink-0">
                            <h1 className="text-4xl font-black text-white leading-[1.0] tracking-tighter">
                                Master the <br /> <span className="text-primary italic">Markets</span>
                            </h1>
                            <div className="w-12 h-1 bg-primary mt-4 rounded-full" />
                        </div>
                        <div className="animate-slide-up space-y-6 max-w-sm w-full mt-auto pt-10">
                            <p className="text-lg font-medium text-white/90 leading-relaxed text-balance pr-10">
                                Link your account and start copying professional trades in real-time. Zero custody, full control.
                            </p>
                            <button onClick={handleNext}
                                className="w-full py-5 text-lg font-bold text-white bg-[#323434] border border-white/20 rounded-2xl shadow-2xl active:scale-95 transition-all flex items-center justify-center gap-2 group">
                                Get Started <span className="group-hover:translate-x-1 transition-transform">→</span>
                            </button>
                        </div>
                    </div>
                </div>
            ),
        },
        {
            title: 'Risk Disclaimer',
            content: (
                <div className="fixed inset-0 z-0 h-[100dvh] bg-[#0a0a0a] overflow-hidden flex flex-col pt-safe animate-fade-in">
                    {/* Subtle Trading Chart Illustration Background */}
                    <div className="absolute top-[20dvh] right-[-20px] opacity-10 transform rotate-[-12deg] pointer-events-none">
                        <svg width="240" height="200" viewBox="0 0 240 200" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <rect x="20" y="80" width="12" height="60" rx="2" fill="#323434" />
                            <rect x="25" y="60" width="2" height="100" fill="#323434" />
                            <rect x="50" y="40" width="12" height="80" rx="2" fill="#323434" />
                            <rect x="55" y="20" width="2" height="120" fill="#323434" />
                            <rect x="80" y="100" width="12" height="40" rx="2" fill="#3b82f6" fillOpacity="0.6" />
                            <rect x="85" y="80" width="2" height="80" fill="#3b82f6" fillOpacity="0.4" />
                            <rect x="110" y="70" width="12" height="60" rx="2" fill="#323434" />
                            <rect x="115" y="50" width="2" height="100" fill="#323434" />
                            <rect x="140" y="30" width="12" height="100" rx="2" fill="#3b82f6" fillOpacity="0.6" />
                            <rect x="145" y="10" width="2" height="140" fill="#3b82f6" fillOpacity="0.4" />
                        </svg>
                    </div>

                    <div className="relative z-10 flex-1 overflow-y-auto p-10 py-16 flex flex-col">
                        <div className="animate-fade-in shrink-0">
                            <h1 className="text-4xl font-black text-white leading-[1.0] tracking-tighter text-left">
                                Risk <br /> <span className="text-primary italic">Disclaimer</span>
                            </h1>
                            <div className="w-16 h-1.5 bg-primary mt-6 rounded-full" />
                        </div>

                        <div className="space-y-4 pt-10 text-left">
                            {[
                                { title: 'Market Volatility', desc: 'Synthetic index trading involves high-risk of capital loss.' },
                                { title: 'App Protocols', desc: 'This App strictly copies professional trades to your account.' },
                                { title: 'Responsibility', desc: 'You retain full control over your risk and drawdown settings.' },
                                { title: 'No Advice', desc: 'Maatla Kebs is a technology provider, not a financial advisor.' },
                            ].map((item, i) => (
                                <div key={i} className="flex gap-4 items-center bg-[#1a1a1a] border border-white/5 p-4 rounded-2xl group transition-all">
                                    <CheckCircle className={`shrink-0 transition-colors duration-500 ${termsAccepted ? 'text-white' : 'text-primary opacity-40'}`} size={16} />
                                    <div className="space-y-0.5">
                                        <h4 className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em] leading-none">{item.title}</h4>
                                        <p className="text-sm font-medium text-white/90 leading-tight">{item.desc}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                        
                        <div className="pt-10 space-y-6 mt-auto">
                            <label className="flex items-center gap-4 cursor-pointer group px-1">
                                <div className="relative">
                                    <input type="checkbox" className="sr-only peer" checked={termsAccepted} onChange={e => setTermsAccepted(e.target.checked)} />
                                    <div className="w-5 h-5 border-2 border-white/10 rounded-md peer-checked:border-primary peer-checked:bg-primary transition-all flex items-center justify-center">
                                       {termsAccepted && <CheckCircle size={10} className="text-white" />}
                                    </div>
                                </div>
                                <span className={`text-xs font-medium text-white/40 transition-colors uppercase tracking-widest ${termsAccepted ? 'text-white/80' : 'group-hover:text-white/60'}`}>
                                    I accept the Terms of Service & Privacy Policy
                                </span>
                            </label>

                            <button onClick={handleNext} disabled={!termsAccepted}
                                className={`w-full py-5 text-lg font-bold text-white bg-[#323434] border border-white/10 rounded-2xl shadow-2xl backdrop-blur-xl transition-all flex items-center justify-center gap-2 group ${!termsAccepted ? 'opacity-30 cursor-not-allowed grayscale' : 'active:scale-95'}`}>
                                Accept & Continue <span className="group-hover:translate-x-1 transition-transform">→</span>
                            </button>
                        </div>
                    </div>
                </div>
            ),
        },
    ];

    return (
        <div className={`min-h-screen bg-dark transition-all duration-500 animate-fade-in`}>
            {error && (
                <div className="fixed top-8 left-1/2 -translate-x-1/2 z-[200] bg-red-500 text-white px-6 py-3 rounded-2xl shadow-2xl font-bold animate-shake w-[90%] text-center">
                    {error}
                </div>
            )}
            <div className={`max-w-md mx-auto w-full relative z-10`}>
                {step === 0 && steps[0].content}
                {step === 1 && steps[1].content}
            </div>
        </div>
    );
};

