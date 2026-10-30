import React, { useState, useRef, useEffect } from 'react';
import {
  ChevronLeft, CheckCircle2, Zap, ShieldCheck,
  Crown, Star, X, Upload, FileImage, Clock, AlertCircle,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { parseJson } from './shared';
import { WhopPay } from './WhopPay';

const ORIGINAL_PRICE = 150;
const CURRENT_PRICE = 100;
const DISCOUNT_AMT = 50;
const DISCOUNT_PCT = Math.round((DISCOUNT_AMT / ORIGINAL_PRICE) * 100);

// Submission types — the client picks how they paid so the admin verifies
// against the right channel
const PAYMENT_METHODS = [
  { value: 'binance_pay', label: 'Binance Pay' },
  { value: 'bank_transfer', label: 'Bank Transfer (FNB etc.)' },
  { value: 'orange_money', label: 'Orange Money' },
  { value: 'paypal', label: 'PayPal' },
  { value: 'crypto', label: 'Crypto (USDT etc.)' },
  { value: 'cash_deposit', label: 'Cash Deposit' },
  { value: 'ewallet', label: 'E-Wallet' },
  { value: 'other', label: 'Other / Mentor Arranged' },
];

const methodLabel = (value: string) => PAYMENT_METHODS.find(m => m.value === value)?.label || value;

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

export const MembershipProtocol = ({ uid, paymentStatus, onBack, onRefresh }: MembershipProtocolProps) => {
  const isConfirmed = paymentStatus === 'CONFIRMED';

  // Proof upload state
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [method, setMethod] = useState('binance_pay');
  const [uploading, setUploading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [reviewNotice, setReviewNotice] = useState('');
  const [uploadError, setUploadError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  // One submission at a time: if a proof is already under review, show the
  // waiting state instead of the form (also enforced server-side, 409)
  useEffect(() => {
    if (!uid) return;
    (async () => {
      try {
        const { data } = await (supabase as any)
          .from('invoices')
          .select('invoice_id, created_at')
          .eq('user_id', uid)
          .in('payment_status', ['pending', 'proof_submitted'])
          .order('created_at', { ascending: false })
          .limit(1);
        if (data && data.length > 0) {
          setReviewNotice('Your payment proof is already under review. The team will approve or reject it within 24 hours — you can only have one submission at a time.');
          setSubmitted(true);
        }
      } catch {
        // RLS may block the read — the server-side 409 still protects the flow
      }
    })();
  }, [uid]);

  const handleProofUpload = async () => {
    if (!proofFile) { setUploadError('Please select a file first'); return; }
    setUploading(true);
    setUploadError('');
    try {
      const ext = proofFile.name.split('.').pop();
      const filePath = `${uid}/${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('proofofpay')
        .upload(filePath, proofFile, { cacheControl: '3600', upsert: false });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('proofofpay')
        .getPublicUrl(filePath);

      const res = await fetch('/api/store-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: uid,
          invoice_id: `proof_${uid}_${Date.now()}`,
          price_amount: CURRENT_PRICE,
          price_currency: 'usd',
          subscription_plan: 'active',
          payment_method: method,
          payment_status: 'proof_submitted',
          original_price: ORIGINAL_PRICE,
          discount_amount: DISCOUNT_AMT,
          proof_of_payment_url: publicUrl,
        }),
      });
      const json = await parseJson(res).catch((err: Error) => ({ error: err.message }));
      if (!res.ok) {
        if (res.status === 409) {
          // Already have a submission under review — switch to waiting state
          setReviewNotice(json.error || 'You already have a payment submission under review.');
          setSubmitted(true);
          return;
        }
        throw new Error(json.error || `Invoice submission failed (${res.status})`);
      }
      setReviewNotice(`Submitted via ${methodLabel(method)}. The team will review and activate your subscription within 24 hours.`);
      setSubmitted(true);
    } catch (err: any) {
      setUploadError(err.message || 'Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  };

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

        {/* Instant payment — Whop embedded checkout (card / Apple Pay / Google Pay) */}
        <WhopPay userId={uid} price={CURRENT_PRICE} onPaid={() => onRefresh()} />

        {/* ⛔ PAYMENT PROOF UPLOAD TEMPORARILY REMOVED — Whop checkout is the only
            payment method for now. Section kept in place: flip `false` back to `true`
            to re-enable. handleProofUpload and the review state above stay wired. */}
        {false && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 px-2">
            <div className="h-px flex-1 bg-white/10" />
            <p className="text-[10px] font-black text-white/30 uppercase tracking-[0.4em]">
              {isConfirmed ? 'Renew Subscription' : 'Or Submit Proof of Payment'}
            </p>
            <div className="h-px flex-1 bg-white/10" />
          </div>

          {/* Accepted methods info */}
          <div className="bg-[#1a1c22] border border-white/10 rounded-2xl p-6 space-y-3">
            <p className="text-xs font-black text-white/50 uppercase tracking-widest">Accepted Payment Methods</p>
            <p className="text-xs text-white/60 leading-relaxed">
              We accept <span className="text-white font-bold">all payment methods</span> including FNB Bank Transfer, Orange Money, PayPal, Crypto, Cash Deposit, E-Wallet, or any method arranged directly through your Mentor.
            </p>
            <p className="text-xs text-white/60 leading-relaxed">
              Select the method you paid with, then upload your proof (screenshot, receipt, or PDF). Our team will verify and activate your subscription within 24 hours. You can only have one submission under review at a time.
            </p>
          </div>

          {/* Upload panel */}
          <div className="bg-[#1a1c22] border border-white/10 rounded-2xl p-6 space-y-5 animate-in slide-in-from-top duration-300">
            {submitted ? (
              <div className="text-center space-y-3 py-4">
                <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                  <Clock size={28} className="text-primary" />
                </div>
                <p className="font-black text-white text-lg">Proof Under Review</p>
                <p className="text-xs text-white/50 leading-relaxed">{reviewNotice || 'Your payment proof has been uploaded. The team will review and activate your subscription within 24 hours.'}</p>
              </div>
            ) : (
              <>
                {/* Submission type */}
                <div className="space-y-2">
                  <p className="text-xs font-black text-white/50 uppercase tracking-widest">Payment Method Used</p>
                  <select
                    value={method}
                    onChange={e => setMethod(e.target.value)}
                    className="w-full bg-dark/50 border border-white/10 rounded-2xl py-4 px-4 text-white text-sm font-bold appearance-none transition-all focus:border-primary outline-none"
                  >
                    {PAYMENT_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                </div>

                <p className="text-xs font-black text-white/50 uppercase tracking-widest">Upload Proof of Payment</p>

                {/* File picker */}
                <div
                  onClick={() => fileRef.current?.click()}
                  className="border-2 border-dashed border-white/20 hover:border-primary/40 rounded-2xl p-6 flex flex-col items-center gap-3 cursor-pointer transition-all hover:bg-white/3 group"
                >
                  {proofFile ? (
                    <>
                      <FileImage size={32} className="text-primary" />
                      <p className="text-sm font-bold text-white text-center break-all">{proofFile.name}</p>
                      <p className="text-xs text-white/40">{(proofFile.size / 1024).toFixed(1)} KB</p>
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
                    if (f) { setProofFile(f); setUploadError(''); }
                  }}
                />

                {/* Error */}
                {uploadError && (
                  <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
                    <AlertCircle size={14} className="text-red-400 flex-shrink-0" />
                    <p className="text-xs text-red-400">{uploadError}</p>
                  </div>
                )}

                {/* Submit */}
                <button
                  onClick={handleProofUpload}
                  disabled={uploading || !proofFile}
                  className="w-full bg-primary hover:bg-primary/90 disabled:opacity-40 text-dark py-5 rounded-2xl font-black uppercase tracking-[0.2em] text-xs flex items-center justify-center gap-3 transition-all"
                >
                  {uploading ? (
                    <><span className="w-4 h-4 border-2 border-dark/40 border-t-dark rounded-full animate-spin" />Uploading...</>
                  ) : (
                    <><Upload size={16} />Submit Proof</>
                  )}
                </button>
                <p className="text-[10px] text-white/30 text-center leading-relaxed">
                  Only one submission can be under review at a time. If your proof is rejected you will be able to submit a new one.
                </p>
              </>
            )}
          </div>
        </div>
        )}

        <p className="text-center text-[9px] text-white/10 uppercase tracking-[0.5em] font-black pt-6 pb-6">
          Mentor Maatla Kebs Institutional Node
        </p>
      </main>
    </div>
  );
};
