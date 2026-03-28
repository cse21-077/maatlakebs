import React, { useState, useEffect } from 'react';
import { 
    ChevronLeft, CreditCard, CheckCircle2, Zap, 
    ShieldCheck, Crown, Star, ArrowRight, X, Clock, QrCode
} from 'lucide-react';
import { Button } from './shared';

interface MembershipProtocolProps {
    uid: string;
    paymentStatus: string;
    onBack: () => void;
    onRefresh: (updatedRisk?: any) => void | Promise<void>;
}

export const MembershipProtocol = ({ 
    uid, paymentStatus, onBack, onRefresh 
}: MembershipProtocolProps) => {
    const isConfirmed = paymentStatus === 'CONFIRMED';
    const [loading, setLoading] = useState(false);
    const [showCheckout, setShowCheckout] = useState(false);
    const [timeLeft, setTimeLeft] = useState(900); // 15:00

    useEffect(() => {
        if (!showCheckout) return;
        const timer = setInterval(() => setTimeLeft(t => t > 0 ? t - 1 : 0), 1000);
        return () => clearInterval(timer);
    }, [showCheckout]);

    const formatTime = (s: number) => {
        const m = Math.floor(s / 60);
        const sec = s % 60;
        return `${m}:${sec < 10 ? '0' : ''}${sec}`;
    };

    const handleSubscribe = async () => {
        setLoading(true);
        setTimeout(() => {
            setLoading(false);
            setShowCheckout(true);
        }, 1000);
    };

    const handleSimulateSuccess = () => {
        alert("Payment Confirmed via Binance Merchant Protocol.");
        setShowCheckout(false);
        onRefresh();
        onBack();
    };

    if (showCheckout) {
        return (
            <div className="fixed inset-0 bg-[#0d0f14] z-[200] flex flex-col pt-safe animate-in fade-in duration-300">
                <header className="px-8 h-20 flex items-center justify-between border-b border-white/5 bg-[#1a1c22]">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-[#F3BA2F] rounded-lg flex items-center justify-center text-dark font-black text-xl">
                            <Zap size={18} fill="currentColor" />
                        </div>
                        <p className="text-sm font-black text-white uppercase tracking-widest">Binance Pay</p>
                    </div>
                    <button onClick={() => setShowCheckout(false)} className="text-white/20 hover:text-white p-2">
                        <X size={24} />
                    </button>
                </header>

                <main className="flex-1 p-8 space-y-10 overflow-y-auto">
                    <div className="text-center space-y-2">
                        <p className="text-[10px] font-black text-white/30 uppercase tracking-[0.4em]">Amount to Pay</p>
                        <h2 className="text-5xl font-black text-white tracking-tighter">99.00 <span className="text-xl text-[#F3BA2F]">USDT</span></h2>
                        <div className="flex justify-center items-center gap-2 text-white/40">
                            <Clock size={14} />
                            <p className="text-xs font-bold font-mono uppercase tracking-widest">{formatTime(timeLeft)}</p>
                        </div>
                    </div>

                    <div className="bg-[#1a1c22] border border-white/10 rounded-[2.5rem] p-10 flex flex-col items-center gap-8 shadow-2xl relative overflow-hidden">
                        <div className="bg-white p-4 rounded-3xl shadow-2xl shadow-white/5 group relative">
                            <QrCode size={180} className="text-dark" strokeWidth={1} />
                            <div className="absolute inset-0 bg-white/95 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-all rounded-3xl px-4 text-center cursor-pointer" onClick={handleSimulateSuccess}>
                                <CheckCircle2 size={40} className="text-[#F3BA2F] mb-2" />
                                <p className="text-[10px] font-black text-dark uppercase tracking-widest leading-tight">Confirm <br /> Payment</p>
                            </div>
                        </div>
                        <div className="text-center space-y-1">
                            <p className="text-[10px] font-black text-[#F3BA2F] uppercase tracking-widest">Scan with Binance App</p>
                            <p className="text-[9px] font-bold text-white/20 uppercase tracking-[0.2em]">Merchant: Maatla Kebs</p>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div className="flex justify-between items-center px-4">
                            <p className="text-[10px] font-black text-white/20 uppercase tracking-widest">Order ID</p>
                            <p className="text-[10px] font-black text-white font-mono uppercase">MK-{uid.slice(0,8)}</p>
                        </div>
                        <div className="flex justify-between items-center px-4">
                            <p className="text-[10px] font-black text-white/20 uppercase tracking-widest">Service</p>
                            <p className="text-[10px] font-black text-white uppercase tracking-widest">Mirror Protocol v2</p>
                        </div>
                    </div>
                </main>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 bg-[#0d0f14] z-[100] flex flex-col pt-safe animate-in slide-in-from-bottom duration-500">
            {/* Header */}
            <header className="px-8 h-24 flex items-center justify-between shrink-0 border-b border-white/5">
                <button onClick={onBack} className="p-4 -ml-4 active:scale-95 transition-all text-white/40 hover:text-white">
                    <ChevronLeft size={24} />
                </button>
                <div className="text-center">
                    <h2 className="text-[10px] font-black text-primary uppercase tracking-[0.4em] mb-1">Billing & Payment</h2>
                    <p className="text-xl font-black text-white tracking-tighter">My Membership</p>
                </div>
                <div className="w-12 h-12" /> {/* Spacer */}
            </header>

            <main className="flex-1 overflow-y-auto px-8 py-10 space-y-12">
                {/* Status Card */}
                <div className="bg-[#1a1c22] border border-white/5 rounded-[2.5rem] p-8 shadow-2xl relative overflow-hidden group">
                    <div className="flex justify-between items-start relative z-10">
                        <div className="space-y-1">
                            <p className="text-[10px] text-white/30 font-black uppercase tracking-widest leading-none">Status</p>
                            <h3 className={`text-2xl font-black tracking-tighter ${isConfirmed ? 'text-primary' : 'text-red-500'}`}>
                                {isConfirmed ? 'Subscription Active' : 'Payment Required'}
                            </h3>
                        </div>
                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${isConfirmed ? 'bg-primary/10 text-primary' : 'bg-red-500/10 text-red-500'}`}>
                            {isConfirmed ? <ShieldCheck size={24} /> : <ShieldAlert size={24} />}
                        </div>
                    </div>
                    {/* Background Glow */}
                    <div className={`absolute -right-20 -top-20 w-64 h-64 blur-[100px] opacity-20 ${isConfirmed ? 'bg-primary' : 'bg-red-500'}`} />
                </div>

                {/* Primary Plan Card */}
                <div className="relative">
                    <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-6 py-2 bg-primary rounded-full z-20 shadow-2xl shadow-primary/40">
                        <p className="text-[10px] font-black text-dark uppercase tracking-[0.3em]">Full Protocol Access</p>
                    </div>
                    
                    <div className="bg-[#1a1c22] border border-white/10 rounded-[3rem] p-10 pt-16 space-y-10 shadow-2xl relative overflow-hidden">
                        <div className="text-center space-y-4 relative z-10">
                            <div className="flex justify-center flex-col items-center gap-2">
                                <Crown className="text-primary mb-2" size={40} />
                                <h4 className="text-4xl font-black text-white tracking-tighter">$99.00 <span className="text-xs text-white/40 font-bold uppercase tracking-widest ml-1">/ USDT</span></h4>
                            </div>
                            <p className="text-xs text-white/40 font-bold leading-relaxed px-4">
                                Complete institutional signal mirroring with advanced risk management and 24/7 technical surveillance.
                            </p>
                        </div>

                        <div className="space-y-6 relative z-10">
                            {[
                                { icon: <Zap size={16} />, label: 'Unlimited Signal Mirroring' },
                                { icon: <ShieldCheck size={16} />, label: 'Institutional Risk Matrix' },
                                { icon: <Star size={16} />, label: 'Advanced Hedge Protocol' },
                                { icon: <CheckCircle2 size={16} />, label: 'Zero Latency Handshake' }
                            ].map((feat, i) => (
                                <div key={i} className="flex items-center gap-4 group">
                                    <div className="w-8 h-8 rounded-xl bg-white/5 flex items-center justify-center text-primary group-hover:scale-110 transition-all shadow-lg">
                                        {feat.icon}
                                    </div>
                                    <p className="text-xs font-bold text-white/70 uppercase tracking-widest group-hover:text-white transition-all">{feat.label}</p>
                                </div>
                            ))}
                        </div>

                        {!isConfirmed && (
                            <button 
                                onClick={handleSubscribe} 
                                className="w-full bg-[#F3BA2F] hover:bg-[#ebac12] text-[#0d0f14] py-6 rounded-3xl font-black uppercase tracking-[0.2em] text-xs flex items-center justify-center gap-3 shadow-2xl shadow-[#F3BA2F]/20 active:scale-[0.98] transition-all"
                            >
                                <Zap size={18} fill="currentColor" />
                                Pay with Binance Pay
                            </button>
                        )}
                        
                        {isConfirmed && (
                            <div className="p-6 bg-primary/10 rounded-3xl border border-primary/10 text-center">
                                <p className="text-[10px] font-black text-primary uppercase tracking-[0.2em]">Billing Active via Binance Merchant</p>
                            </div>
                        )}

                        <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full -translate-y-1/2 translate-x-1/2 blur-[80px]" />
                    </div>
                </div>

                <p className="text-center text-[9px] text-white/10 uppercase tracking-[0.5em] font-black pt-10 pb-6">
                    Maatla Kebs Institutional Node
                </p>
            </main>
        </div>
    );
};

const ShieldAlert = ({ size, className }: { size?: number, className?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />
        <path d="M12 8v4" />
        <path d="M12 16h.01" />
    </svg>
);
