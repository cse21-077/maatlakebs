import React, { useState, useEffect } from 'react';
import {
  ChevronLeft,
  CreditCard,
  CheckCircle2,
  Zap,
  ShieldCheck,
  Crown,
  Star,
  X,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { createPaymentInvoice, getAvailableCurrencies } from '../lib/nowpayments.ts';

interface MembershipProtocolProps {
  uid: string;
  paymentStatus: string;
  onBack: () => void;
  onRefresh: (updatedRisk?: any) => void | Promise<void>;
}

const ShieldAlert = ({
  size,
  className,
}: {
  size?: number;
  className?: string;
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />
    <path d="M12 8v4" />
    <path d="M12 16h.01" />
  </svg>
);

export const MembershipProtocol = ({
  uid,
  paymentStatus,
  onBack,
  onRefresh,
}: MembershipProtocolProps) => {
  const isConfirmed = paymentStatus === 'CONFIRMED';
  const [loading, setLoading] = useState(false);
  const [showCheckout, setShowCheckout] = useState(false);
  const [paymentUrl, setPaymentUrl] = useState('');
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubscribe = () => {
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setShowCheckout(true);
    }, 1000);
  };

  const handlePaymentClick = async () => {
    setPaymentLoading(true);
    setError('');
    try {
      const invoice = await createPaymentInvoice({
        price_amount: 100,
        price_currency: 'usd',
        order_id: `order_${uid}_${Date.now()}`,
        order_description: 'Mentor Maatla Kebs - Monthly Subscription',
        ipn_callback_url: `${import.meta.env.VITE_APP_URL}/api/webhooks/nowpayments`,
        success_url: `${import.meta.env.VITE_APP_URL}/?payment=success`,
        cancel_url: `${import.meta.env.VITE_APP_URL}/?payment=cancelled`,
        user_id: uid,
        subscription_plan: 'active',
      });

      console.log('✅ Invoice created from NowPayments:', {
        id: invoice.invoice_id,
        payment_url: invoice.payment_url,
      });

      // Store invoice in DB via backend API (uses service key to bypass RLS)
      const storeResponse = await fetch('/api/store-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: uid,
          invoice_id: invoice.invoice_id,
          price_amount: 100,
          price_currency: 'usd',
          subscription_plan: 'active',
        }),
      });

      const storeData = await storeResponse.json();

      if (!storeResponse.ok) {
        console.error('❌ Failed to store invoice:', storeData.error);
        throw new Error(`Invoice storage failed: ${storeData.error}`);
      }

      console.log('✅ Invoice stored in Supabase:', storeData.data);
      setPaymentUrl(invoice.payment_url);
      setPaymentLoading(false);
    } catch (err: any) {
      console.error('❌ Payment error:', err);
      setError(err.message || 'Failed to create payment');
      setPaymentLoading(false);
    }
  };

  // Payment URL received - redirect to NowPayments
  if (paymentUrl) {
    return (
      <div className="fixed inset-0 bg-[#0d0f14] z-[200] flex flex-col pt-safe animate-in fade-in duration-300">
        <header className="px-8 h-20 flex items-center justify-between border-b border-white/5 bg-[#1a1c22]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center text-dark font-black">
              <CreditCard size={18} fill="currentColor" />
            </div>
            <p className="text-sm font-black text-white uppercase tracking-widest">
              NowPayments Gateway
            </p>
          </div>
          <button
            onClick={() => {
              setShowCheckout(false);
              setPaymentUrl('');
            }}
            className="text-white/20 hover:text-white p-2"
          >
            <X size={24} />
          </button>
        </header>

        <main className="flex-1 overflow-y-auto p-8 space-y-8 flex flex-col items-center justify-center">
          <div className="space-y-2 text-center">
            <p className="text-[10px] font-black text-white/30 uppercase tracking-[0.4em]">
              Redirecting to Payment Gateway
            </p>
            <h2 className="text-4xl font-black text-white tracking-tighter">$100 USD</h2>
          </div>

          <a
            href={paymentUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full max-w-sm bg-primary hover:bg-primary/90 text-dark py-6 rounded-3xl font-black uppercase tracking-[0.2em] text-xs flex items-center justify-center gap-3 shadow-2xl shadow-primary/20"
          >
            <Zap size={18} fill="currentColor" />
            Open NowPayments Portal
          </a>

          <p className="text-center text-[10px] text-white/40 max-w-sm">
            Redirecting to NowPayments to complete payment securely. If not redirected automatically, click the button above.
          </p>
        </main>
      </div>
    );
  }

  // Checkout loading/processing
  if (showCheckout && paymentLoading) {
    return (
      <div className="fixed inset-0 bg-[#0d0f14] z-[200] flex flex-col pt-safe animate-in fade-in duration-300">
        <header className="px-8 h-20 flex items-center justify-between border-b border-white/5 bg-[#1a1c22]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center text-dark font-black">
              <CreditCard size={18} fill="currentColor" />
            </div>
            <p className="text-sm font-black text-white uppercase tracking-widest">
              Processing Payment
            </p>
          </div>
          <button
            onClick={() => setShowCheckout(false)}
            className="text-white/20 hover:text-white p-2"
          >
            <X size={24} />
          </button>
        </header>

        <main className="flex-1 overflow-y-auto p-8 space-y-8 flex flex-col items-center justify-center">
          <Zap size={48} className="text-primary animate-pulse" fill="currentColor" />
          <p className="text-white font-bold text-lg">Creating payment invoice...</p>
        </main>
      </div>
    );
  }

  // Checkout error
  if (showCheckout && error) {
    return (
      <div className="fixed inset-0 bg-[#0d0f14] z-[200] flex flex-col pt-safe animate-in fade-in duration-300">
        <header className="px-8 h-20 flex items-center justify-between border-b border-white/5 bg-[#1a1c22]">
          <p className="text-sm font-black text-white uppercase tracking-widest">Error</p>
          <button
            onClick={() => {
              setShowCheckout(false);
              setError('');
            }}
            className="text-white/20 hover:text-white p-2"
          >
            <X size={24} />
          </button>
        </header>

        <main className="flex-1 overflow-y-auto p-8 space-y-8 flex flex-col items-center justify-center">
          <div className="space-y-4 text-center max-w-md">
            <p className="text-red-500 font-bold text-lg">{error}</p>
            <button
              onClick={handlePaymentClick}
              className="bg-primary hover:bg-primary/90 text-dark py-3 px-8 rounded-2xl font-black uppercase text-sm"
            >
              Try Again
            </button>
          </div>
        </main>
      </div>
    );
  }

  // Payment confirmation screen
  if (showCheckout) {
    return (
      <div className="fixed inset-0 bg-[#0d0f14] z-[200] flex flex-col pt-safe animate-in fade-in duration-300">
        <header className="px-8 h-20 flex items-center justify-between border-b border-white/5 bg-[#1a1c22]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center text-dark font-black">
              <CreditCard size={18} fill="currentColor" />
            </div>
            <p className="text-sm font-black text-white uppercase tracking-widest">
              Crypto Payment
            </p>
          </div>
          <button
            onClick={() => {
              setShowCheckout(false);
              setError('');
            }}
            className="text-white/20 hover:text-white p-2"
          >
            <X size={24} />
          </button>
        </header>

        <main className="flex-1 overflow-y-auto p-8 space-y-8 flex flex-col items-center justify-center">
          <div className="space-y-8 w-full max-w-md">
            <div className="text-center space-y-2">
              <p className="text-[10px] font-black text-white/30 uppercase tracking-[0.4em]">
                Monthly Subscription
              </p>
              <h2 className="text-5xl font-black text-white tracking-tighter">
                $100.00
              </h2>
              <p className="text-xs text-white/40">USD</p>
            </div>

            <div className="space-y-4">
              <h3 className="text-sm font-black text-white uppercase">Features:</h3>
              {[
                'Unlimited Signal Mirroring',
                'Institutional Risk Matrix',
                'Advanced Hedge Protocol',
                '24/7 Mentor Support',
              ].map((feature, i) => (
                <div key={i} className="flex items-center gap-3">
                  <CheckCircle2 size={16} className="text-primary flex-shrink-0" />
                  <p className="text-xs text-white/70">{feature}</p>
                </div>
              ))}
            </div>

            <button
              onClick={handlePaymentClick}
              disabled={paymentLoading}
              className="w-full bg-primary hover:bg-primary/90 disabled:opacity-50 text-dark py-6 rounded-3xl font-black uppercase tracking-[0.2em] text-sm flex items-center justify-center gap-3 shadow-2xl shadow-primary/20"
            >
              <Zap size={20} fill="currentColor" />
              Proceed to Payment
            </button>

            <p className="text-center text-[10px] text-white/40">
              You will be directed to NowPayments to select cryptocurrency and complete payment.
            </p>
          </div>
        </main>
      </div>
    );
  }

  // Main membership view
  return (
    <div className="fixed inset-0 bg-[#0d0f14] z-[100] flex flex-col pt-12 animate-in slide-in-from-bottom duration-500">
      <header className="px-8 h-24 flex items-center justify-between shrink-0 border-b border-white/5 bg-[#0d0f14]/80 backdrop-blur-xl sticky top-0 z-[110]">
        <button
          onClick={onBack}
          className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center text-white/40 hover:bg-white/10 active:scale-90 transition-all shadow-xl"
        >
          <ChevronLeft size={24} />
        </button>
        <div className="text-center">
          <h2 className="text-[10px] font-black text-primary uppercase tracking-[0.4em] mb-1 leading-none">
            Billing & Payment
          </h2>
          <p className="text-xl font-black text-white tracking-tighter leading-none">
            Monthly Subscription
          </p>
        </div>
        <div className="w-12 h-12" />
      </header>

      <main className="flex-1 overflow-y-auto px-8 py-10 space-y-12 pb-24">
        <div className="bg-[#1a1c22] border border-white/5 rounded-[2.5rem] p-8 shadow-2xl relative overflow-hidden">
          <div className="flex justify-between items-start relative z-10">
            <div className="space-y-1">
              <p className="text-[10px] text-white/30 font-black uppercase tracking-widest leading-none">
                Status
              </p>
              <h3
                className={`text-2xl font-black tracking-tighter ${
                  isConfirmed ? 'text-primary' : 'text-red-500'
                }`}
              >
                {isConfirmed ? 'Subscription Active' : 'Payment Required'}
              </h3>
            </div>
            <div
              className={`w-12 h-12 rounded-2xl flex items-center justify-center ${
                isConfirmed
                  ? 'bg-primary/10 text-primary'
                  : 'bg-red-500/10 text-red-500'
              }`}
            >
              {isConfirmed ? (
                <ShieldCheck size={24} />
              ) : (
                <ShieldAlert size={24} />
              )}
            </div>
          </div>
          <div
            className={`absolute -right-20 -top-20 w-64 h-64 blur-[100px] opacity-20 ${
              isConfirmed ? 'bg-primary' : 'bg-red-500'
            }`}
          />
        </div>

        <div className="relative">
          <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-6 py-2 bg-primary rounded-full z-20 shadow-2xl shadow-primary/40">
            <p className="text-[10px] font-black text-dark uppercase tracking-[0.3em]">
              Mentor Access
            </p>
          </div>

          <div className="bg-[#1a1c22] border border-white/10 rounded-[3rem] p-10 pt-16 space-y-10 shadow-2xl relative overflow-hidden">
            <div className="text-center space-y-4 relative z-10">
              <div className="flex justify-center flex-col items-center gap-2">
                <Crown className="text-primary mb-2" size={40} />
                <h4 className="text-4xl font-black text-white tracking-tighter">
                  $100.00{' '}
                  <span className="text-xs text-white/40 font-bold uppercase tracking-widest ml-1">
                    / month
                  </span>
                </h4>
              </div>
              <p className="text-xs text-white/40 font-bold leading-relaxed px-4">
                Access Mentor Maatla Kebs institutional signal mirroring with advanced risk management and 24/7 technical support.
              </p>
            </div>

            <div className="space-y-6 relative z-10">
              {[
                {
                  icon: <Zap size={16} />,
                  label: 'Unlimited Signal Mirroring',
                },
                {
                  icon: <ShieldCheck size={16} />,
                  label: 'Institutional Risk Matrix',
                },
                { icon: <Star size={16} />, label: 'Advanced Hedge Protocol' },
                {
                  icon: <CheckCircle2 size={16} />,
                  label: '24/7 Mentor Support',
                },
              ].map((feat, i) => (
                <div key={i} className="flex items-center gap-4 group">
                  <div className="w-8 h-8 rounded-xl bg-white/5 flex items-center justify-center text-primary group-hover:scale-110 transition-all shadow-lg">
                    {feat.icon}
                  </div>
                  <p className="text-xs font-bold text-white/70 uppercase tracking-widest group-hover:text-white transition-all">
                    {feat.label}
                  </p>
                </div>
              ))}
            </div>

            {!isConfirmed && (
              <button
                onClick={handleSubscribe}
                disabled={loading}
                className="w-full bg-primary hover:bg-primary/90 disabled:opacity-60 text-dark py-6 rounded-3xl font-black uppercase tracking-[0.2em] text-xs flex items-center justify-center gap-3 shadow-2xl shadow-primary/20 active:scale-[0.98] transition-all"
              >
                <CreditCard size={18} fill="currentColor" />
                Pay $100 with Crypto
              </button>
            )}

            {isConfirmed && (
              <div className="p-6 bg-primary/10 rounded-3xl border border-primary/10 text-center">
                <p className="text-[10px] font-black text-primary uppercase tracking-[0.2em]">
                  Billing Active via NowPayments
                </p>
              </div>
            )}

            <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full -translate-y-1/2 translate-x-1/2 blur-[80px]" />
          </div>
        </div>

        <p className="text-center text-[9px] text-white/10 uppercase tracking-[0.5em] font-black pt-10 pb-6">
          Mentor Maatla Kebs Institutional Node
        </p>
      </main>
    </div>
  );
};
