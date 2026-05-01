import React, { useState, useEffect } from 'react';
import { CreditCard, Loader, Check, AlertCircle, Upload, X } from 'lucide-react';
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
  original_price_usd?: number; // Original price before discount
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
    original_price_usd: 14.99, // Show discount: was 14.99, now 9.99
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
    price_usd: 99.99,
    original_price_usd: 149.99, // Show discount: was 149.99, now 99.99
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

type PaymentMethod = 'crypto' | 'mentor';

export const PaymentWidget: React.FC<PaymentWidgetProps> = ({
  userId,
  currentPlan,
  onPaymentSuccess,
}) => {
  const [selectedPlan, setSelectedPlan] = useState<string>('active');
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<PaymentMethod>('crypto');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [paymentUrl, setPaymentUrl] = useState('');
  const [paymentStatus, setPaymentStatus] = useState('');
  const [availableCryptos, setAvailableCryptos] = useState<string[]>([]);
  const [selectedCrypto, setSelectedCrypto] = useState('BTC');
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

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

      if (selectedPaymentMethod === 'mentor') {
        setError('Please upload proof of payment first');
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
        payment_method: 'crypto',
        original_price: plan.original_price_usd || plan.price_usd,
        discount_amount: plan.original_price_usd ? (plan.original_price_usd - plan.price_usd) : null,
      } as any);

      setPaymentUrl(invoice.payment_url);
      setPaymentStatus('pending');
    } catch (err: any) {
      setError(err.message || 'Failed to create payment');
    } finally {
      setLoading(false);
    }
  };

  const handleMentorPaymentSubmit = async () => {
    try {
      setUploading(true);
      setError('');

      if (!proofFile) {
        setError('Please select a proof of payment file');
        return;
      }

      const plan = PRICING_PLANS.find((p) => p.id === selectedPlan);
      if (!plan) {
        setError('Please select a plan');
        return;
      }

      // Upload file to Supabase Storage
      const timestamp = Date.now();
      const fileName = `${userId}/${selectedPlan}_${timestamp}_${proofFile.name}`;
      
      const { data, error: uploadError } = await supabase.storage
        .from('proofofpay')
        .upload(fileName, proofFile);

      if (uploadError) {
        setError(`Upload failed: ${uploadError.message}`);
        return;
      }

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('proofofpay')
        .getPublicUrl(fileName);

      // Store invoice with proof URL
      await supabase.from('invoices').insert({
        user_id: userId,
        invoice_id: `mentor_${userId}_${timestamp}`,
        price_amount: plan.price_usd.toString(),
        price_currency: 'USD',
        payment_status: 'proof_submitted',
        subscription_plan: plan.id,
        payment_method: 'mentor',
        proof_of_payment_url: publicUrl,
        original_price: plan.original_price_usd || plan.price_usd,
        discount_amount: plan.original_price_usd ? (plan.original_price_usd - plan.price_usd) : null,
      } as any);

      // Reset form
      setProofFile(null);
      setPaymentStatus('proof_submitted');
      setError('');
    } catch (err: any) {
      setError(err.message || 'Failed to submit mentor payment');
    } finally {
      setUploading(false);
    }
  };

  const handleOpenPaymentWindow = () => {
    if (paymentUrl) {
      window.open(paymentUrl, 'NowPayments', 'width=500,height=600');
    }
  };

  if (paymentStatus === 'proof_submitted') {
    return (
      <Card className="p-6 bg-blue-50 border border-blue-200">
        <div className="text-center space-y-4">
          <Check className="w-12 h-12 text-blue-600 mx-auto" />
          <h3 className="text-lg font-semibold text-slate-900">
            Proof of Payment Submitted
          </h3>
          <p className="text-sm text-slate-600">
            Thank you! Your proof of payment has been received. Our team will verify and activate your plan shortly.
          </p>
          <Button
            onClick={() => {
              setPaymentStatus('');
              setProofFile(null);
            }}
            className="bg-blue-600 hover:bg-blue-700"
          >
            Submit Another Payment
          </Button>
        </div>
      </Card>
    );
  }

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
        {PRICING_PLANS.map((plan) => {
          const discount = plan.original_price_usd ? Math.round(((plan.original_price_usd - plan.price_usd) / plan.original_price_usd) * 100) : 0;
          return (
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
              
              {/* Price with discount display */}
              <div className="my-2">
                {plan.original_price_usd ? (
                  <>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-slate-500 line-through">
                        ${plan.original_price_usd}
                      </span>
                      <span className="text-xs font-bold text-red-600 bg-red-100 px-2 py-1 rounded">
                        {discount}% OFF
                      </span>
                    </div>
                    <p className="text-2xl font-bold text-emerald-600 mt-1">
                      ${plan.price_usd}
                      <span className="text-sm text-slate-500">/month</span>
                    </p>
                  </>
                ) : (
                  <p className="text-2xl font-bold text-emerald-600">
                    ${plan.price_usd}
                    <span className="text-sm text-slate-500">/month</span>
                  </p>
                )}
              </div>

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
          );
        })}
      </div>

      {/* Payment Method Selector */}
      <div className="grid grid-cols-2 gap-3">
        <Card
          className={`p-4 cursor-pointer transition-all text-center ${
            selectedPaymentMethod === 'crypto'
              ? 'ring-2 ring-emerald-500 bg-emerald-50'
              : 'hover:shadow-lg'
          }`}
          onClick={() => setSelectedPaymentMethod('crypto')}
        >
          <CreditCard className="w-6 h-6 mx-auto mb-2 text-slate-700" />
          <p className="font-semibold text-slate-900">Crypto Payment</p>
          <p className="text-xs text-slate-500 mt-1">Bitcoin, Ethereum, etc</p>
        </Card>
        
        <Card
          className={`p-4 cursor-pointer transition-all text-center ${
            selectedPaymentMethod === 'mentor'
              ? 'ring-2 ring-emerald-500 bg-emerald-50'
              : 'hover:shadow-lg'
          }`}
          onClick={() => setSelectedPaymentMethod('mentor')}
        >
          <Upload className="w-6 h-6 mx-auto mb-2 text-slate-700" />
          <p className="font-semibold text-slate-900">Paid via Mentor</p>
          <p className="text-xs text-slate-500 mt-1">Upload proof</p>
        </Card>
      </div>

      {/* Crypto Payment Section */}
      {selectedPaymentMethod === 'crypto' && (
        <>
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
        </>
      )}

      {/* Mentor Payment Section */}
      {selectedPaymentMethod === 'mentor' && (
        <>
          <Card className="p-4 bg-blue-50 border border-blue-200">
            <p className="text-sm text-slate-700">
              <strong>Paid via Mentor:</strong> Upload proof of payment (screenshot, receipt, etc.) and we'll verify your payment.
            </p>
          </Card>

          {/* File Upload */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Upload Proof of Payment
            </label>
            <div className="flex items-center gap-3">
              <label className="flex-1 flex items-center justify-center px-4 py-3 border-2 border-dashed border-slate-300 rounded-lg cursor-pointer hover:bg-slate-50 transition-all">
                <div className="flex flex-col items-center">
                  <Upload className="w-5 h-5 text-slate-500 mb-1" />
                  <span className="text-sm text-slate-600">
                    {proofFile ? proofFile.name : 'Click to upload'}
                  </span>
                </div>
                <input
                  type="file"
                  className="hidden"
                  onChange={(e) => setProofFile(e.target.files?.[0] || null)}
                  accept="image/*,.pdf"
                />
              </label>
              {proofFile && (
                <button
                  onClick={() => setProofFile(null)}
                  className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-all"
                >
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-2">
              Supported formats: JPG, PNG, PDF. Max 5MB
            </p>
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
              <AlertCircle className="w-4 h-4" />
              {error}
            </div>
          )}

          {/* Submit Button */}
          <Button
            onClick={handleMentorPaymentSubmit}
            disabled={uploading || !proofFile}
            className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300"
          >
            {uploading ? (
              <>
                <Loader className="w-4 h-4 animate-spin mr-2" />
                Uploading...
              </>
            ) : (
              <>
                <Upload className="w-4 h-4 mr-2" />
                Submit Proof of Payment
              </>
            )}
          </Button>
        </>
      )}
    </div>
  );
};
