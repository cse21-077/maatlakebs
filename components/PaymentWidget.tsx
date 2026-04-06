import React, { useState, useEffect } from 'react';
import { CreditCard, Loader, Check, AlertCircle } from 'lucide-react';
import { Button, Card } from './shared';
import { supabase } from '../lib/supabase';
import {
  createPaymentInvoice,
  getPaymentStatus,
  getAvailableCurrencies,
  getEstimatedPrice,
  getMinimumPaymentAmount,
} from '../lib/nowpayments.ts';
// Force module resolution refresh

interface PricingPlan {
  id: string;
  name: string;
  price_usd: number;
  features: string[];
}

const PRICING_PLANS: PricingPlan[] = [
  {
    id: 'trial',
    name: 'Trial (Free)',
    price_usd: 0,
    features: [
      'Copy 1 mentor',
      '1 MT5 account',
      'Basic risk controls',
      '7 days',
    ],
  },
  {
    id: 'active',
    name: 'Basic Plan',
    price_usd: 9.99,
    features: [
      'Copy 3 mentors',
      'Unlimited accounts',
      'Advanced risk controls',
      'Monthly',
      'Email support',
    ],
  },
  {
    id: 'pro',
    name: 'Pro Plan',
    price_usd: 69.99,
    features: [
      'Copy unlimited mentors',
      'Unlimited accounts',
      'Full risk management',
      'Monthly',
      'Priority support',
      'Advanced analytics',
    ],
  },
];

interface PaymentWidgetProps {
  userId: string;
  currentPlan: 'trial' | 'active' | 'pro';
  onPaymentSuccess?: () => void;
}

export const PaymentWidget: React.FC<PaymentWidgetProps> = ({
  userId,
  currentPlan,
  onPaymentSuccess,
}) => {
  const [selectedPlan, setSelectedPlan] = useState<string>('active');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [paymentUrl, setPaymentUrl] = useState('');
  const [paymentStatus, setPaymentStatus] = useState('');
  const [availableCryptos, setAvailableCryptos] = useState<string[]>([]);
  const [selectedCrypto, setSelectedCrypto] = useState('BTC');

  useEffect(() => {
    loadAvailableCryptos();
  }, []);

  const loadAvailableCryptos = async () => {
    try {
      const cryptos = await getAvailableCurrencies();
      setAvailableCryptos(cryptos);
      setSelectedCrypto(cryptos[0] || 'BTC');
    } catch (err) {
      console.error('Failed to load cryptocurrencies:', err);
    }
  };

  const handleCreatePayment = async () => {
    try {
      setLoading(true);
      setError('');

      const plan = PRICING_PLANS.find((p) => p.id === selectedPlan);
      if (!plan || plan.price_usd === 0) {
        setError('Please select a paid plan');
        return;
      }

      // Get estimate
      const estimate = await getEstimatedPrice(
        plan.price_usd,
        'usd',
        selectedCrypto
      );

      // Check minimum
      const minimum = await getMinimumPaymentAmount('usd', selectedCrypto);
      if (plan.price_usd < minimum) {
        setError(`Minimum payment is $${minimum} USD`);
        return;
      }

      // Create invoice
      const invoice = await createPaymentInvoice({
        price_amount: plan.price_usd,
        price_currency: 'usd',
        order_id: `order_${userId}_${Date.now()}`,
        order_description: `Maatla Kebs - ${plan.name}`,
        ipn_callback_url: `${import.meta.env.VITE_APP_URL}/api/webhooks/nowpayments`,
        success_url: `${import.meta.env.VITE_APP_URL}/dashboard?payment=success`,
        cancel_url: `${import.meta.env.VITE_APP_URL}/dashboard?payment=cancelled`,
        user_id: userId,
        subscription_plan: plan.id as 'trial' | 'active' | 'pro',
      });

      // Store invoice in DB for tracking
      await supabase.from('invoices').insert({
        user_id: userId,
        invoice_id: invoice.invoice_id,
        price_amount: invoice.price_amount,
        price_currency: invoice.price_currency,
        payment_status: 'pending',
        subscription_plan: plan.id,
      } as any);

      setPaymentUrl(invoice.payment_url);
      setPaymentStatus('pending');
    } catch (err: any) {
      setError(err.message || 'Failed to create payment');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenPaymentWindow = () => {
    if (paymentUrl) {
      window.open(paymentUrl, 'NowPayments', 'width=500,height=600');
    }
  };

  if (paymentUrl) {
    return (
      <Card className="p-6 bg-emerald-50 border border-emerald-200">
        <div className="text-center space-y-4">
          <Check className="w-12 h-12 text-emerald-600 mx-auto" />
          <h3 className="text-lg font-semibold text-slate-900">
            Payment Invoice Created
          </h3>
          <p className="text-sm text-slate-600">
            Click the button below to complete payment with {selectedCrypto}
          </p>
          <Button
            onClick={handleOpenPaymentWindow}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            Open Payment Window
          </Button>
          <p className="text-xs text-slate-500">
            You'll be redirected after successful payment
          </p>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Pricing Plans */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {PRICING_PLANS.map((plan) => (
          <Card
            key={plan.id}
            className={`p-4 cursor-pointer transition-all ${
              selectedPlan === plan.id
                ? 'ring-2 ring-emerald-500 bg-emerald-50'
                : 'hover:shadow-lg'
            } ${currentPlan === plan.id ? 'border-emerald-500' : ''}`}
            onClick={() => setSelectedPlan(plan.id)}
          >
            <h3 className="font-semibold text-slate-900">{plan.name}</h3>
            <p className="text-2xl font-bold text-emerald-600 my-2">
              ${plan.price_usd}
              <span className="text-sm text-slate-500">/month</span>
            </p>
            <ul className="space-y-1 text-xs text-slate-600">
              {plan.features.map((feature) => (
                <li key={feature}>✓ {feature}</li>
              ))}
            </ul>
            {currentPlan === plan.id && (
              <p className="mt-2 text-xs font-semibold text-emerald-600">
                Current plan
              </p>
            )}
          </Card>
        ))}
      </div>

      {/* Cryptocurrency Selector */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2">
          Payment Currency
        </label>
        <select
          value={selectedCrypto}
          onChange={(e) => setSelectedCrypto(e.target.value)}
          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900"
        >
          {availableCryptos.map((crypto) => (
            <option key={crypto} value={crypto}>
              {crypto}
            </option>
          ))}
        </select>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
          <AlertCircle className="w-4 h-4" />
          {error}
        </div>
      )}

      {/* Payment Button */}
      <Button
        onClick={handleCreatePayment}
        disabled={loading || selectedPlan === currentPlan}
        className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300"
      >
        {loading ? (
          <>
            <Loader className="w-4 h-4 animate-spin mr-2" />
            Creating Invoice...
          </>
        ) : (
          <>
            <CreditCard className="w-4 h-4 mr-2" />
            Proceed to Payment
          </>
        )}
      </Button>
    </div>
  );
};
