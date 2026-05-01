import React, { useState, useRef } from 'react';
import {
  ChevronLeft, CreditCard, CheckCircle2, Zap, ShieldCheck,
  Crown, Star, X, Upload, FileImage, Clock, AlertCircle,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { createPaymentInvoice } from '../lib/nowpayments.ts';

const ORIGINAL_PRICE = 150;
const CURRENT_PRICE = 100;
const DISCOUNT_AMT = 50;
const DISCOUNT_PCT = Math.round((DISCOUNT_AMT / ORIGINAL_PRICE) * 100); // 33

interface MembershipProtocolProps {
  uid: string;
  paymentStatus: string;
  onBack: () => void;
  onRefresh: (updatedRisk?: any) => void | Promise<void>;
}

const ShieldAlert = ({ size, className }: { size?: number; className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />
    <path d="M12 8v4" /><path d="M12 16h.01" />
  </svg>
);

type PayMethod = 'crypto' | 'mentor' | null;

export const MembershipProtocol = ({ uid, paymentStatus, onBack, onRefresh }: MembershipProtocolProps) => {
  const isConfirmed = paymentStatus === 'CONFIRMED';

  // Crypto state
  const [loading, setLoading] = useState(false);
  const [showCheckout, setShowCheckout] = useState(false);
  const [paymentUrl, setPaymentUrl] = useState('');
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [cryptoError, setCryptoError] = useState('');

  // Method selection
  const [selectedMethod, setSelectedMethod] = useState<PayMethod>(null);

  // Mentor payment state
  const [mentorFile, setMentorFile] = useState<File | null>(null);
  const [mentorUploading, setMentorUploading] = useState(false);
  const [mentorSubmitted, setMentorSubmitted] = useState(false);
  const [mentorError, setMentorError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  // ── Crypto flow ────────────────────────────────────────────────────────────
  const handleSubscribe = () => {
    setLoading(true);
    setTimeout(() => { setLoading(false); setShowCheckout(true); }, 800);
  };

  const handleCryptoPayment = async () => {
    setPaymentLoading(true);
    setCryptoError('');
    try {
      const invoice = await createPaymentInvoice({
        price_amount: CURRENT_PRICE,
        price_currency: 'usd',
        order_id: `order_${uid}_${Date.now()}`,
        order_description: 'Mentor Maatla Kebs - Monthly Subscription',
        ipn_callback_url: `${import.meta.env.VITE_APP_URL}/api/webhooks/nowpayments`,
        success_url: `${import.meta.env.VITE_APP_URL}/?payment=success`,
        cancel_url: `${import.meta.env.VITE_APP_URL}/?payment=cancelled`,
        user_id: uid,
        subscription_plan: 'active',
      });

      await fetch('/api/store-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: uid,
          invoice_id: invoice.invoice_id,
          price_amount: CURRENT_PRICE,
          price_currency: 'usd',
          subscription_plan: 'active',
          payment_method: 'nowpayments',
          original_price: ORIGINAL_PRICE,
          discount_amount: DISCOUNT_AMT,
        }),
      });

      setPaymentUrl(invoice.payment_url);
    } catch (err: any) {
      setCryptoError(err.message || 'Failed to create payment');
    } finally {
      setPaymentLoading(false);
    }
  };

  // ── Mentor upload flow ─────────────────────────────────────────────────────
  const handleMentorPayment = async () => {
    if (!mentorFile) { setMentorError('Please select a file first'); return; }
    setMentorUploading(true);
    setMentorError('');
    try {
      const ext = mentorFile.name.split('.').pop();
      const filePath = `${uid}/${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('proofofpay')
        .upload(filePath, mentorFile, { cacheControl: '3600', upsert: false });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('proofofpay')
        .getPublicUrl(filePath);

      const res = await fetch('/api/store-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: uid,
          invoice_id: `mentor_${uid}_${Date.now()}`,
          price_amount: CURRENT_PRICE,
          price_currency: 'usd',
          subscription_plan: 'active',
          payment_method: 'mentor',
          payment_status: 'proof_submitted',
          original_price: ORIGINAL_PRICE,
          discount_amount: DISCOUNT_AMT,
          proof_of_payment_url: publicUrl,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setMentorSubmitted(true);
    } catch (err: any) {
      setMentorError(err.message || 'Upload failed. Please try again.');
    } finally {
      setMentorUploading(false);
    }
  };

  // ── Payment redirect screen ────────────────────────────────────────────────
  if (paymentUrl) {
    return (
      <div className="fixed inset-0 bg-[#0d0f14] z-[200] flex flex-col pt-safe animate-in fade-in duration-300">
        <header className="px-8 h-20 flex items-center justify-between border-b border-white/5 bg-[#1a1c22]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center text-dark"><CreditCard size={18} fill="currentColor" /></div>
            <p className="text-sm font-black text-white uppercase tracking-widest">NowPayments Gateway</p>
          </div>
          <button onClick={() => { setShowCheckout(false); setPaymentUrl(''); }} className="text-white/20 hover:text-white p-2"><X size={24} /></button>
        </header>
        <main className="flex-1 flex flex-col items-center justify-center p-8 space-y-8">
          <div className="text-center space-y-3">
            <p className="text-[10px] font-black text-white/30 uppercase tracking-[0.4em]">Redirecting to Payment Gateway</p>
            <div className="flex items-center justify-center gap-3">
              <span className="text-2xl text-white/30 line-through">${ORIGINAL_PRICE}</span>
              <span className="text-4xl font-black text-white">${CURRENT_PRICE} USD</span>
            </div>
            <span className="inline-block px-3 py-1 bg-primary/20 text-primary text-xs font-black rounded-full">{DISCOUNT_PCT}% OFF</span>
          </div>
          <a href={paymentUrl} target="_blank" rel="noopener noreferrer"
            className="w-full max-w-sm bg-primary hover:bg-primary/90 text-dark py-6 rounded-3xl font-black uppercase tracking-[0.2em] text-xs flex items-center justify-center gap-3 shadow-2xl shadow-primary/20">
            <Zap size={18} fill="currentColor" />Open NowPayments Portal
          </a>
          <p className="text-center text-[10px] text-white/40 max-w-sm">Click the button above to complete your payment securely.</p>
        </main>
      </div>
    );
  }

  // ── Crypto checkout loading ────────────────────────────────────────────────
  if (showCheckout && paymentLoading) {
    return (
      <div className="fixed inset-0 bg-[#0d0f14] z-[200] flex flex-col pt-safe">
        <header className="px-8 h-20 flex items-center justify-between border-b border-white/5 bg-[#1a1c22]">
          <p className="text-sm font-black text-white uppercase tracking-widest">Processing Payment</p>
          <button onClick={() => setShowCheckout(false)} className="text-white/20 hover:text-white p-2"><X size={24} /></button>
        </header>
        <main className="flex-1 flex flex-col items-center justify-center gap-4">
          <Zap size={48} className="text-primary animate-pulse" fill="currentColor" />
          <p className="text-white font-bold">Creating payment invoice...</p>
        </main>
      </div>
    );
  }

  // ── Crypto checkout error ──────────────────────────────────────────────────
  if (showCheckout && cryptoError) {
    return (
      <div className="fixed inset-0 bg-[#0d0f14] z-[200] flex flex-col pt-safe">
        <header className="px-8 h-20 flex items-center justify-between border-b border-white/5 bg-[#1a1c22]">
          <p className="text-sm font-black text-white uppercase tracking-widest">Error</p>
          <button onClick={() => { setShowCheckout(false); setCryptoError(''); }} className="text-white/20 hover:text-white p-2"><X size={24} /></button>
        </header>
        <main className="flex-1 flex flex-col items-center justify-center gap-4 p-8 text-center">
          <p className="text-red-500 font-bold">{cryptoError}</p>
          <button onClick={handleCryptoPayment} className="bg-primary hover:bg-primary/90 text-dark py-3 px-8 rounded-2xl font-black uppercase text-sm">Try Again</button>
        </main>
      </div>
    );
  }

  // ── Crypto checkout confirmation ───────────────────────────────────────────
  if (showCheckout) {
    return (
      <div className="fixed inset-0 bg-[#0d0f14] z-[200] flex flex-col pt-safe animate-in fade-in duration-300">
        <header className="px-8 h-20 flex items-center justify-between border-b border-white/5 bg-[#1a1c22]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center text-dark"><CreditCard size={18} fill="currentColor" /></div>
            <p className="text-sm font-black text-white uppercase tracking-widest">Crypto Payment</p>
          </div>
          <button onClick={() => { setShowCheckout(false); setCryptoError(''); }} className="text-white/20 hover:text-white p-2"><X size={24} /></button>
        </header>
        <main className="flex-1 overflow-y-auto p-8 flex flex-col items-center justify-center">
          <div className="space-y-8 w-full max-w-md">
            <div className="text-center space-y-3">
              <p className="text-[10px] font-black text-white/30 uppercase tracking-[0.4em]">Monthly Subscription</p>
              <div className="flex items-center justify-center gap-3">
                <span className="text-2xl text-white/30 line-through">${ORIGINAL_PRICE}.00</span>
                <span className="text-5xl font-black text-white">${CURRENT_PRICE}.00</span>
              </div>
              <div className="flex items-center justify-center gap-2">
                <span className="text-xs text-white/40 uppercase">USD</span>
                <span className="px-3 py-1 bg-primary/20 text-primary text-xs font-black rounded-full">{DISCOUNT_PCT}% DISCOUNT</span>
              </div>
            </div>
            <div className="space-y-4">
              {['Unlimited Signal Mirroring','Institutional Risk Matrix','Advanced Hedge Protocol','24/7 Mentor Support'].map((f, i) => (
                <div key={i} className="flex items-center gap-3">
                  <CheckCircle2 size={16} className="text-primary flex-shrink-0" />
                  <p className="text-xs text-white/70">{f}</p>
                </div>
              ))}
            </div>
            <button onClick={handleCryptoPayment} disabled={paymentLoading}
              className="w-full bg-primary hover:bg-primary/90 disabled:opacity-50 text-dark py-6 rounded-3xl font-black uppercase tracking-[0.2em] text-sm flex items-center justify-center gap-3 shadow-2xl shadow-primary/20">
              <Zap size={20} fill="currentColor" />Proceed to Payment
            </button>
            <p className="text-center text-[10px] text-white/40">You will be directed to NowPayments to select cryptocurrency and complete payment.</p>
          </div>
        </main>
      </div>
    );
  }

  // ── Main membership view ───────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 bg-[#0d0f14] z-[100] flex flex-col pt-12 animate-in slide-in-from-bottom duration-500">
      <header className="px-8 h-24 flex items-center justify-between shrink-0 border-b border-white/5 bg-[#0d0f14]/80 backdrop-blur-xl sticky top-0 z-[110]">
        <button onClick={onBack} className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center text-white/40 hover:bg-white/10 active:scale-90 transition-all">
          <ChevronLeft size={24} />
        </button>
        <div className="text-center">
          <h2 className="text-[10px] font-black text-primary uppercase tracking-[0.4em] mb-1 leading-none">Billing & Payment</h2>
          <p className="text-xl font-black text-white tracking-tighter leading-none">Monthly Subscription</p>
        </div>
        <div className="w-12 h-12" />
      </header>

      <main className="flex-1 overflow-y-auto px-8 py-10 space-y-10 pb-24">

        {/* Status card */}
        <div className="bg-[#1a1c22] border border-white/5 rounded-[2.5rem] p-8 shadow-2xl relative overflow-hidden">
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
          <div className={`absolute -right-20 -top-20 w-64 h-64 blur-[100px] opacity-20 ${isConfirmed ? 'bg-primary' : 'bg-red-500'}`} />
        </div>

        {/* Plan + price card */}
        <div className="relative">
          <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-6 py-2 bg-primary rounded-full z-20 shadow-2xl shadow-primary/40">
            <p className="text-[10px] font-black text-dark uppercase tracking-[0.3em]">Mentor Access</p>
          </div>
          <div className="bg-[#1a1c22] border border-white/10 rounded-[3rem] p-10 pt-16 space-y-8 shadow-2xl relative overflow-hidden">
            {/* Price with discount */}
            <div className="text-center space-y-3 relative z-10">
              <Crown className="text-primary mx-auto mb-2" size={40} />
              <div className="flex items-center justify-center gap-4">
                <span className="text-2xl text-white/30 line-through font-bold">${ORIGINAL_PRICE}</span>
                <span className="px-3 py-1 bg-red-500/20 text-red-400 text-xs font-black rounded-full uppercase">{DISCOUNT_PCT}% OFF</span>
              </div>
              <h4 className="text-4xl font-black text-white tracking-tighter">
                ${CURRENT_PRICE}.00{' '}
                <span className="text-xs text-white/40 font-bold uppercase tracking-widest ml-1">/ month</span>
              </h4>
              <p className="text-[10px] text-primary/70 font-bold">Special mentor discount — save ${DISCOUNT_AMT}/mo</p>
            </div>

            {/* Features */}
            <div className="space-y-5 relative z-10">
              {[
                { icon: <Zap size={16} />, label: 'Unlimited Signal Mirroring' },
                { icon: <ShieldCheck size={16} />, label: 'Institutional Risk Matrix' },
                { icon: <Star size={16} />, label: 'Advanced Hedge Protocol' },
                { icon: <CheckCircle2 size={16} />, label: '24/7 Mentor Support' },
              ].map((feat, i) => (
                <div key={i} className="flex items-center gap-4 group">
                  <div className="w-8 h-8 rounded-xl bg-white/5 flex items-center justify-center text-primary group-hover:scale-110 transition-all">{feat.icon}</div>
                  <p className="text-xs font-bold text-white/70 uppercase tracking-widest group-hover:text-white transition-all">{feat.label}</p>
                </div>
              ))}
            </div>

            <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full -translate-y-1/2 translate-x-1/2 blur-[80px]" />
          </div>
        </div>

        {/* Payment methods — always visible */}
        <div className="space-y-4">
          <div className="flex items-center gap-3 px-2">
            <div className="h-px flex-1 bg-white/10" />
            <p className="text-[10px] font-black text-white/30 uppercase tracking-[0.4em]">
              {isConfirmed ? 'Renew / Change Method' : 'Choose Payment Method'}
            </p>
            <div className="h-px flex-1 bg-white/10" />
          </div>

          {/* Crypto option */}
          <button
            onClick={() => { setSelectedMethod('crypto'); handleSubscribe(); }}
            disabled={loading}
            className={`w-full flex items-center gap-4 p-5 rounded-2xl border transition-all text-left ${
              selectedMethod === 'crypto'
                ? 'bg-primary/10 border-primary/40'
                : 'bg-white/3 border-white/10 hover:border-white/20 hover:bg-white/5'
            }`}
          >
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary flex-shrink-0">
              <Zap size={20} fill="currentColor" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-black text-white">Pay with Crypto</p>
              <p className="text-xs text-white/40 mt-0.5">Via NowPayments — Bitcoin, USDT & more</p>
            </div>
            <div className="flex flex-col items-end gap-1">
              <span className="text-[10px] text-white/30 line-through">${ORIGINAL_PRICE}</span>
              <span className="text-sm font-black text-primary">${CURRENT_PRICE}</span>
            </div>
          </button>

          {/* Mentor payment option */}
          <button
            onClick={() => setSelectedMethod(m => m === 'mentor' ? null : 'mentor')}
            className={`w-full flex items-center gap-4 p-5 rounded-2xl border transition-all text-left ${
              selectedMethod === 'mentor'
                ? 'bg-primary/10 border-primary/40'
                : 'bg-white/3 border-white/10 hover:border-white/20 hover:bg-white/5'
            }`}
          >
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary flex-shrink-0">
              <Upload size={20} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-black text-white">Paid via Mentor</p>
              <p className="text-xs text-white/40 mt-0.5">Upload proof of payment for manual review</p>
            </div>
            <div className="flex flex-col items-end gap-1">
              <span className="text-[10px] text-white/30 line-through">${ORIGINAL_PRICE}</span>
              <span className="text-sm font-black text-primary">${CURRENT_PRICE}</span>
            </div>
          </button>

          {/* Mentor upload panel */}
          {selectedMethod === 'mentor' && (
            <div className="bg-[#1a1c22] border border-white/10 rounded-2xl p-6 space-y-5 animate-in slide-in-from-top duration-300">
              {mentorSubmitted ? (
                <div className="text-center space-y-3 py-4">
                  <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                    <Clock size={28} className="text-primary" />
                  </div>
                  <p className="font-black text-white text-lg">Proof Submitted!</p>
                  <p className="text-xs text-white/50 leading-relaxed">Your payment proof has been uploaded. The mentor will review and activate your subscription within 24 hours.</p>
                  <button onClick={() => { setMentorSubmitted(false); setMentorFile(null); setSelectedMethod(null); }}
                    className="text-xs text-primary font-bold mt-2">Submit another</button>
                </div>
              ) : (
                <>
                  <p className="text-xs font-black text-white/50 uppercase tracking-widest">Upload Proof of Payment</p>

                  {/* File picker */}
                  <div
                    onClick={() => fileRef.current?.click()}
                    className="border-2 border-dashed border-white/20 hover:border-primary/40 rounded-2xl p-6 flex flex-col items-center gap-3 cursor-pointer transition-all hover:bg-white/3 group"
                  >
                    {mentorFile ? (
                      <>
                        <FileImage size={32} className="text-primary" />
                        <p className="text-sm font-bold text-white text-center break-all">{mentorFile.name}</p>
                        <p className="text-xs text-white/40">{(mentorFile.size / 1024).toFixed(1)} KB</p>
                        <p className="text-[10px] text-primary/70 font-bold">Tap to change file</p>
                      </>
                    ) : (
                      <>
                        <Upload size={32} className="text-white/30 group-hover:text-primary transition-all" />
                        <p className="text-sm font-bold text-white/60">Tap to select file</p>
                        <p className="text-[10px] text-white/30">JPG, PNG or PDF — max 10 MB</p>
                      </>
                    )}
                  </div>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,application/pdf"
                    className="hidden"
                    onChange={e => {
                      const f = e.target.files?.[0];
                      if (f) { setMentorFile(f); setMentorError(''); }
                    }}
                  />

                  {/* Error */}
                  {mentorError && (
                    <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
                      <AlertCircle size={14} className="text-red-400 flex-shrink-0" />
                      <p className="text-xs text-red-400">{mentorError}</p>
                    </div>
                  )}

                  {/* Submit */}
                  <button
                    onClick={handleMentorPayment}
                    disabled={mentorUploading || !mentorFile}
                    className="w-full bg-primary hover:bg-primary/90 disabled:opacity-40 text-dark py-5 rounded-2xl font-black uppercase tracking-[0.2em] text-xs flex items-center justify-center gap-3 transition-all"
                  >
                    {mentorUploading ? (
                      <><span className="w-4 h-4 border-2 border-dark/40 border-t-dark rounded-full animate-spin" />Uploading...</>
                    ) : (
                      <><Upload size={16} />Submit Proof</>
                    )}
                  </button>
                  <p className="text-[10px] text-white/30 text-center leading-relaxed">
                    Your proof will be reviewed by the mentor. Activation happens within 24 hours of approval.
                  </p>
                </>
              )}
            </div>
          )}
        </div>

        <p className="text-center text-[9px] text-white/10 uppercase tracking-[0.5em] font-black pt-6 pb-6">
          Mentor Maatla Kebs Institutional Node
        </p>
      </main>
    </div>
  );
};
