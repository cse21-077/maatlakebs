import React, { useEffect, useRef, useState } from 'react';
import { Zap, Lock, AlertCircle, CheckCircle2, X } from 'lucide-react';
import { WhopCheckoutEmbed } from '@whop/checkout/react';

// Whop embedded checkout. Sandbox while we test — flip VITE_WHOP_ENV=production
// and use a live plan ID + live keys when going live.
const WHOP_PLAN_ID = (import.meta.env.VITE_WHOP_PLAN_ID as string) || '';
const BUILD_WHOP_ENV: 'sandbox' | 'production' =
  import.meta.env.VITE_WHOP_ENV === 'production' ? 'production' : 'sandbox';
const whopConfigured = WHOP_PLAN_ID.startsWith('plan_');

interface WhopPayProps {
  userId: string;
  price: number;
  onPaid?: () => void;
}

export const WhopPay: React.FC<WhopPayProps> = ({ userId, price, onPaid }) => {
  const [starting, setStarting] = useState(false);
  const [sessionId, setSessionId] = useState('');
  const [checkoutEnvironment, setCheckoutEnvironment] = useState(BUILD_WHOP_ENV);
  const [receiptId, setReceiptId] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [payError, setPayError] = useState('');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // After the embed reports completion, poll until the webhook flips the
  // subscription to active (the webhook usually lands within a few seconds)
  useEffect(() => {
    if (!confirming) return;
    let attempts = 0;
    pollRef.current = setInterval(() => {
      attempts += 1;
      onPaid?.();
      if (attempts >= 8 && pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    }, 2500);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [confirming, onPaid]);

  const startCheckout = async () => {
    setPayError('');
    setStarting(true);
    try {
      // Server mints a Whop checkout session tagged with this user's id, so
      // the webhook can attribute the payment back to them
      const res = await fetch('/api/whop-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.sessionId) {
        throw new Error(json.error || `Could not start checkout (${res.status})`);
      }
      if (json.environment !== 'sandbox' && json.environment !== 'production') {
        throw new Error('Checkout environment was not provided by the server. Please refresh and try again.');
      }
      setCheckoutEnvironment(json.environment);
      setSessionId(json.sessionId);
    } catch (err: any) {
      setPayError(err.message || 'Could not start checkout — please try again.');
    } finally {
      setStarting(false);
    }
  };

  const closeCheckout = () => {
    setSessionId('');
    setPayError('');
  };

  // Not configured yet — point the user at the proof upload instead
  if (!whopConfigured) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3 px-2">
          <div className="h-px flex-1 bg-white/10" />
          <p className="text-[10px] font-black text-white/30 uppercase tracking-[0.4em]">Instant Payment</p>
          <div className="h-px flex-1 bg-white/10" />
        </div>
        <div className="bg-[#1a1c22] border border-white/10 rounded-2xl p-6 space-y-3">
          <div className="flex items-center gap-2">
            <Zap size={16} className="text-primary" />
            <p className="text-xs font-black text-white/50 uppercase tracking-widest">Online Checkout</p>
          </div>
          <p className="text-xs text-white/40 leading-relaxed">
            Online checkout is still being configured — please check back shortly.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 px-2">
        <div className="h-px flex-1 bg-white/10" />
        <p className="text-[10px] font-black text-white/30 uppercase tracking-[0.4em]">Instant Payment</p>
        <div className="h-px flex-1 bg-white/10" />
      </div>

      <div className="bg-[#1a1c22] border border-white/10 rounded-2xl p-6 space-y-5 animate-in slide-in-from-top duration-300">
        {receiptId ? (
          <div className="text-center space-y-3 py-4">
            <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
              <CheckCircle2 size={28} className="text-primary" />
            </div>
            <p className="font-black text-white text-lg">
              {confirming ? 'Confirming Your Payment…' : 'Payment Received'}
            </p>
            <p className="text-xs text-white/50 leading-relaxed">
              {confirming
                ? 'Confirming your payment — your subscription will switch to Active in a few seconds.'
                : 'Your payment is confirmed — your subscription is now Active.'}
            </p>
            <p className="text-[10px] text-white/30 font-bold uppercase tracking-widest">Receipt {receiptId}</p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Zap size={16} className="text-primary" />
                <p className="text-xs font-black text-white/50 uppercase tracking-widest">Pay Online</p>
              </div>
              <div className="flex items-center gap-2">
                {checkoutEnvironment === 'sandbox' && (
                  <span className="px-2 py-1 bg-yellow-500/10 text-yellow-400 text-[9px] font-black rounded-full uppercase tracking-widest">Sandbox</span>
                )}
                <span className="px-2 py-1 bg-white/5 text-white/40 text-[9px] font-black rounded-full uppercase tracking-widest flex items-center gap-1">
                  <Lock size={9} /> Secure
                </span>
              </div>
            </div>

            <p className="text-xs text-white/60 leading-relaxed">
              Pay <span className="text-white font-bold">${price}.00/month</span> instantly by card, Apple Pay or Google Pay — your plan activates automatically as soon as the payment clears.
            </p>

            {payError && (
              <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
                <AlertCircle size={14} className="text-red-400 flex-shrink-0" />
                <p className="text-xs text-red-400">{payError}</p>
              </div>
            )}

            {sessionId ? (
              <div className="space-y-3">
                <div className="rounded-2xl overflow-hidden">
                  <WhopCheckoutEmbed
                    sessionId={sessionId}
                    environment={checkoutEnvironment}
                    skipRedirect
                    theme="dark"
                    themeOptions={{
                      accentColor: '#2138bc',
                      backgroundColor: '#1a1c22',
                      borderRadius: 16,
                      buttonText: `Subscribe · $${price}/mo`,
                    }}
                    onComplete={(_id: string, _setupOrReceipt: string | undefined, result: any) => {
                      setReceiptId(result?.receipt_id || _setupOrReceipt || '');
                      setSessionId('');
                      setConfirming(true);
                    }}
                    onPaymentError={(err: any) =>
                      setPayError(err?.error_message || err?.message || 'Payment failed — please try again.')
                    }
                    fallback={<div className="h-80 animate-pulse bg-white/5 rounded-2xl" />}
                  />
                </div>
                <button
                  onClick={closeCheckout}
                  className="w-full py-3 rounded-2xl bg-white/5 hover:bg-white/10 text-white/50 text-[10px] font-black uppercase tracking-[0.2em] flex items-center justify-center gap-2 transition-all"
                >
                  <X size={12} /> Close Checkout
                </button>
              </div>
            ) : (
              <button
                onClick={startCheckout}
                disabled={starting}
                className="w-full bg-primary hover:bg-primary-hover disabled:opacity-40 text-white py-5 rounded-2xl font-black uppercase tracking-[0.2em] text-xs flex items-center justify-center gap-3 transition-all"
              >
                {starting ? (
                  <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />Preparing Checkout…</>
                ) : (
                  <><Zap size={16} /> Pay ${price}.00 Now</>
                )}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
};
