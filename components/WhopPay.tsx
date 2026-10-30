import React, { useState } from 'react';
import { Zap, Lock, AlertCircle } from 'lucide-react';

// Whop checkout uses a production-hosted checkout page.
const WHOP_PLAN_ID = (import.meta.env.VITE_WHOP_PLAN_ID as string) || '';
const whopConfigured = WHOP_PLAN_ID.startsWith('plan_');

interface WhopPayProps {
  userId: string;
  price: number;
}

export const WhopPay: React.FC<WhopPayProps> = ({ userId, price }) => {
  const [starting, setStarting] = useState(false);
  const [payError, setPayError] = useState('');

  const startCheckout = async () => {
    setPayError('');
    setStarting(true);
    try {
      // The server creates a hosted checkout link tagged with this user's id.
      const res = await fetch('/api/whop-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          ...(window.location.protocol === 'https:'
            ? { return_url: `${window.location.origin}${window.location.pathname}` }
            : {}),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.checkoutUrl) {
        throw new Error(json.error || `Could not start checkout (${res.status})`);
      }
      const checkoutUrl = new URL(json.checkoutUrl);
      if (
        checkoutUrl.protocol !== 'https:' ||
        !(checkoutUrl.hostname === 'whop.com' || checkoutUrl.hostname.endsWith('.whop.com'))
      ) {
        throw new Error('Whop returned an invalid checkout link. Please try again later.');
      }
      window.location.assign(checkoutUrl.toString());
    } catch (err: any) {
      setPayError(err.message || 'Could not start checkout — please try again.');
    } finally {
      setStarting(false);
    }
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
        <>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Zap size={16} className="text-primary" />
              <p className="text-xs font-black text-white/50 uppercase tracking-widest">Pay Online</p>
            </div>
            <div className="flex items-center gap-2">
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
        </>
      </div>
    </div>
  );
};
