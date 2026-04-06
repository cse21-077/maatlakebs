import axios from 'axios';

const NOW_PAYMENTS_API_URL = '/api';
const NOW_PAYMENTS_IPN_SECRET = import.meta.env.VITE_NOW_PAYMENTS_IPN_SECRET;

export interface InvoiceParams {
  price_amount: number;
  price_currency: string;
  order_id: string;
  order_description: string;
  ipn_callback_url: string;
  success_url: string;
  cancel_url: string;
  user_id: string;
  subscription_plan: 'trial' | 'active' | 'pro';
}

export interface PaymentInvoice {
  id: string;
  invoice_id: string;
  payment_url: string;
  price_amount: number;
  price_currency: string;
  status: string;
}

/**
 * Create a payment invoice with NowPayments
 */
export async function createPaymentInvoice(params: InvoiceParams): Promise<PaymentInvoice> {
  try {
    const response = await axios.post(
      `${NOW_PAYMENTS_API_URL}/create-invoice`,
      {
        price_amount: params.price_amount,
        price_currency: params.price_currency,
        order_id: params.order_id,
        order_description: params.order_description,
        ipn_callback_url: params.ipn_callback_url,
        success_url: params.success_url,
        cancel_url: params.cancel_url,
      }
    );

    return response.data;
  } catch (error) {
    console.error('Payment invoice creation error:', error);
    throw error;
  }
}

/**
 * Get payment status by invoice ID
 */
export async function getPaymentStatus(invoiceId: string) {
  try {
    const response = await axios.get(
      `${NOW_PAYMENTS_API_URL}/get-payment-status?invoiceId=${invoiceId}`
    );

    return response.data;
  } catch (error) {
    console.error('Payment status check error:', error);
    throw error;
  }
}

/**
 * Get estimated price for currency conversion
 */
export async function getEstimatedPrice(
  amount: number,
  from_currency: string,
  to_currency: string = 'usd'
) {
  try {
    const response = await axios.get(
      `${NOW_PAYMENTS_API_URL}/estimate?amount=${amount}&from_currency=${from_currency}&to_currency=${to_currency}`
    );

    return response.data;
  } catch (error) {
    console.error('Price estimation error:', error);
    throw error;
  }
}

/**
 * Get minimum payment amount for a currency pair
 */
export async function getMinimumPaymentAmount(
  from_currency: string,
  to_currency: string = 'usd'
) {
  try {
    const response = await axios.get(
      `${NOW_PAYMENTS_API_URL}/min-amount?from_currency=${from_currency}&to_currency=${to_currency}`
    );

    return response.data.min_amount;
  } catch (error) {
    console.error('Minimum amount error:', error);
    throw error;
  }
}

/**
 * Get list of available cryptocurrencies
 */
export async function getAvailableCurrencies() {
  try {
    const response = await axios.get(
      `${NOW_PAYMENTS_API_URL}/get-currencies`
    );

    return response.data.currencies;
  } catch (error) {
    console.error('Currencies error:', error);
    throw error;
  }
}

/**
 * Verify IPN webhook signature
 */
export function verifyIPNSignature(
  payload: Record<string, any>,
  signature: string
): boolean {
  const crypto = require('crypto');
  
  // Sort object keys and stringify
  const sorted = Object.keys(payload)
    .sort()
    .reduce((result: Record<string, any>, key: string) => {
      result[key] = payload[key];
      return result;
    }, {});

  const message = JSON.stringify(sorted);
  const hmac = crypto.createHmac('sha512', NOW_PAYMENTS_IPN_SECRET);
  hmac.update(message);
  const calculatedSignature = hmac.digest('hex');

  return calculatedSignature === signature;
}
