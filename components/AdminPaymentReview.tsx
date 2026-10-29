import React, { useState, useEffect } from 'react';
import { CheckCircle, XCircle, Loader, AlertCircle, ExternalLink, Eye } from 'lucide-react';
import { Button, Card } from './shared';
import { supabase } from '../lib/supabase';
import { ProofImage } from './ProofImage';

interface PendingPayment {
  id: string;
  invoice_id: string;
  user_id: string;
  user?: {
    id: string;
    email: string;
    first_name?: string;
    last_name?: string;
  };
  price_amount: string;
  price_currency: string;
  subscription_plan: string;
  payment_method?: string;
  proof_of_payment_url: string;
  created_at: string;
  original_price?: number;
  discount_amount?: number;
}

const METHOD_LABELS: Record<string, string> = {
  binance_pay: 'Binance Pay',
  bank_transfer: 'Bank Transfer',
  orange_money: 'Orange Money',
  paypal: 'PayPal',
  crypto: 'Crypto',
  cash_deposit: 'Cash Deposit',
  ewallet: 'E-Wallet',
  other: 'Other',
  proof_upload: 'Proof Upload',
};

const methodLabel = (value?: string) => (value && METHOD_LABELS[value]) || 'Proof Upload';

interface AdminPaymentReviewProps {
  adminId: string;
  onClose?: () => void;
}

export const AdminPaymentReview: React.FC<AdminPaymentReviewProps> = ({ adminId, onClose }) => {
  const [pendingPayments, setPendingPayments] = useState<PendingPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [selectedProof, setSelectedProof] = useState<PendingPayment | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  useEffect(() => {
    fetchPendingPayments();
  }, []);

  const fetchPendingPayments = async () => {
    try {
      setLoading(true);
      setError('');

      const response = await fetch(`/api/admin/payments?admin_id=${adminId}`);
      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Failed to fetch pending payments');
        return;
      }

      setPendingPayments(data.invoices);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch pending payments');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (invoiceId: string) => {
    try {
      setProcessing(invoiceId);
      setError('');

      const response = await fetch('/api/admin/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoice_id: invoiceId,
          action: 'approve',
          admin_id: adminId,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Failed to approve payment');
        return;
      }

      setSuccess(`Payment approved! Subscription activated for 30 days.`);
      setPendingPayments(pendingPayments.filter(p => p.id !== invoiceId));
      setSelectedProof(null);

      // Clear success message after 3 seconds
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to approve payment');
    } finally {
      setProcessing(null);
    }
  };

  const handleReject = async (invoiceId: string) => {
    try {
      setProcessing(invoiceId);
      setError('');

      const response = await fetch('/api/admin/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoice_id: invoiceId,
          action: 'reject',
          admin_id: adminId,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Failed to reject payment');
        return;
      }

      setSuccess('Payment rejected and proof removed.');
      setPendingPayments(pendingPayments.filter(p => p.id !== invoiceId));
      setSelectedProof(null);

      // Clear success message after 3 seconds
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to reject payment');
    } finally {
      setProcessing(null);
    }
  };

  const formatPrice = (payment: PendingPayment) => {
    if (payment.original_price && payment.discount_amount) {
      const discount = Math.round(((payment.discount_amount / payment.original_price) * 100));
      return (
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-500 line-through">
              ${payment.original_price}
            </span>
            <span className="text-xs font-bold text-red-600 bg-red-100 px-2 py-0.5 rounded">
              {discount}% OFF
            </span>
          </div>
          <p className="font-semibold text-slate-900">
            ${payment.price_amount} {payment.price_currency}
          </p>
        </div>
      );
    }
    return <p className="font-semibold">${payment.price_amount} {payment.price_currency}</p>;
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-8">
        <Loader className="w-8 h-8 animate-spin text-slate-400 mb-2" />
        <p className="text-slate-600">Loading pending payments...</p>
      </div>
    );
  }

  if (previewOpen && selectedProof) {
    return (
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-slate-900">Payment Proof Review</h2>
          <button
            onClick={() => setPreviewOpen(false)}
            className="text-slate-500 hover:text-slate-700"
          >
            ✕
          </button>
        </div>

        {/* User Info */}
        <div className="mb-6 p-4 bg-slate-50 rounded-lg">
          <h3 className="font-semibold text-slate-900 mb-2">User Information</h3>
          <p className="text-sm text-slate-600">
            <strong>Email:</strong> {selectedProof.user?.email}
          </p>
          {selectedProof.user?.first_name && (
            <p className="text-sm text-slate-600">
              <strong>Name:</strong> {selectedProof.user.first_name} {selectedProof.user.last_name}
            </p>
          )}
          <p className="text-sm text-slate-600">
            <strong>Plan:</strong> {selectedProof.subscription_plan}
          </p>
          <p className="text-sm text-slate-600">
            <strong>Method:</strong> {methodLabel(selectedProof.payment_method)}
          </p>
          <p className="text-sm text-slate-600">
            <strong>Amount:</strong> ${selectedProof.price_amount} {selectedProof.price_currency}
          </p>
          <p className="text-sm text-slate-600">
            <strong>Submitted:</strong> {new Date(selectedProof.created_at).toLocaleString()}
          </p>
        </div>

        {/* Proof Preview */}
        <div className="mb-6 border-2 border-dashed border-slate-300 rounded-lg p-4">
          <p className="text-sm text-slate-600 mb-2">Proof of Payment:</p>
          <ProofImage
            url={selectedProof.proof_of_payment_url}
            alt="Proof of payment"
            className="rounded"
          />
        </div>

        {/* Error / Success */}
        {error && (
          <div className="mb-4 flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
            <AlertCircle className="w-4 h-4" />
            {error}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-3">
          <Button
            onClick={() => handleApprove(selectedProof.id)}
            disabled={processing === selectedProof.id}
            className="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300"
          >
            {processing === selectedProof.id ? (
              <>
                <Loader className="w-4 h-4 animate-spin mr-2" />
                Processing...
              </>
            ) : (
              <>
                <CheckCircle className="w-4 h-4 mr-2" />
                Approve & Activate
              </>
            )}
          </Button>
          <Button
            onClick={() => handleReject(selectedProof.id)}
            disabled={processing === selectedProof.id}
            className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-slate-300"
          >
            {processing === selectedProof.id ? (
              <>
                <Loader className="w-4 h-4 animate-spin mr-2" />
                Processing...
              </>
            ) : (
              <>
                <XCircle className="w-4 h-4 mr-2" />
                Reject
              </>
            )}
          </Button>
          <Button
            onClick={() => setPreviewOpen(false)}
            className="bg-slate-300 hover:bg-slate-400"
          >
            Back
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Payment Reviews</h1>
          <p className="text-sm text-slate-600 mt-1">
            {pendingPayments.length} pending payment proof{pendingPayments.length !== 1 ? 's' : ''}
          </p>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-slate-700"
          >
            ✕
          </button>
        )}
      </div>

      {/* Success Message */}
      {success && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded text-emerald-700 text-sm flex items-center gap-2">
          <CheckCircle className="w-4 h-4" />
          {success}
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded text-red-700 text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4" />
          {error}
        </div>
      )}

      {/* Empty State */}
      {pendingPayments.length === 0 && (
        <Card className="p-8 text-center">
          <CheckCircle className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
          <p className="text-slate-900 font-semibold">All caught up!</p>
          <p className="text-slate-600 text-sm mt-1">No pending payment proofs to review.</p>
        </Card>
      )}

      {/* Payment List */}
      <div className="space-y-3">
        {pendingPayments.map((payment) => (
          <Card key={payment.id} className="p-4 hover:shadow-lg transition-all">
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-center">
              {/* User Info */}
              <div>
                <p className="font-semibold text-slate-900 text-sm">
                  {payment.user?.first_name} {payment.user?.last_name}
                </p>
                <p className="text-xs text-slate-500">{payment.user?.email}</p>
              </div>

              {/* Plan & Amount */}
              <div>
                <p className="text-xs text-slate-500 uppercase font-bold">Plan</p>
                <p className="font-semibold text-slate-900 capitalize">{payment.subscription_plan}</p>
                <div className="mt-1">{formatPrice(payment)}</div>
              </div>

              {/* Date */}
              <div>
                <p className="text-xs text-slate-500 uppercase font-bold">Submitted</p>
                <p className="text-sm text-slate-900">
                  {new Date(payment.created_at).toLocaleDateString()}
                </p>
                <p className="text-xs text-slate-500">
                  {new Date(payment.created_at).toLocaleTimeString()}
                </p>
              </div>

              {/* Proof Status */}
              <div>
                <p className="text-xs text-slate-500 uppercase font-bold">Method</p>
                <p className="text-sm text-slate-900">{methodLabel(payment.payment_method)}</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {payment.proof_of_payment_url?.endsWith('.pdf') ? 'PDF proof' : 'Image proof'}
                </p>
              </div>

              {/* Actions */}
              <div className="flex gap-2 justify-end">
                <Button
                  onClick={() => {
                    setSelectedProof(payment);
                    setPreviewOpen(true);
                  }}
                  className="bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-1"
                >
                  <Eye className="w-4 h-4" />
                  Review
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Refresh Button */}
      {pendingPayments.length > 0 && (
        <div className="flex justify-center pt-4">
          <Button
            onClick={fetchPendingPayments}
            className="bg-slate-600 hover:bg-slate-700"
          >
            Refresh
          </Button>
        </div>
      )}
    </div>
  );
};
