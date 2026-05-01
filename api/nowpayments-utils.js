/**
 * Unified NowPayments utility proxy — merges 3 endpoints into 1 function slot
 * GET /api/nowpayments-utils?action=estimate&amount=...&from_currency=...&to_currency=...
 * GET /api/nowpayments-utils?action=min-amount&from_currency=...&to_currency=...
 * GET /api/nowpayments-utils?action=currencies
 */

const NOW_PAYMENTS_BASE = 'https://api-sandbox.nowpayments.io/v1';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { action, amount, from_currency, to_currency = 'usd' } = req.query;

  if (!action) {
    return res.status(400).json({ error: 'Missing required query param: action' });
  }

  const headers = { 'x-api-key': process.env.NOW_PAYMENTS_API_KEY };

  try {
    if (action === 'estimate') {
      if (!amount || !from_currency) {
        return res.status(400).json({ error: 'amount and from_currency required for estimate' });
      }
      const response = await fetch(
        `${NOW_PAYMENTS_BASE}/estimate?amount=${amount}&from_currency=${from_currency}&to_currency=${to_currency}`,
        { method: 'GET', headers }
      );
      const data = await response.json();
      if (!response.ok) return res.status(response.status).json({ error: data });
      return res.status(200).json(data);
    }

    if (action === 'min-amount') {
      if (!from_currency) {
        return res.status(400).json({ error: 'from_currency required for min-amount' });
      }
      const response = await fetch(
        `${NOW_PAYMENTS_BASE}/min-amount?from_currency=${from_currency}&to_currency=${to_currency}`,
        { method: 'GET', headers }
      );
      const data = await response.json();
      if (!response.ok) return res.status(response.status).json({ error: data });
      return res.status(200).json({ min_amount: data.min_amount });
    }

    if (action === 'currencies') {
      const response = await fetch(`${NOW_PAYMENTS_BASE}/currencies`, {
        method: 'GET',
        headers,
      });
      const data = await response.json();
      if (!response.ok) return res.status(response.status).json({ error: data });
      return res.status(200).json({ currencies: data.currencies });
    }

    return res.status(400).json({ error: `Unknown action: "${action}". Use estimate | min-amount | currencies` });

  } catch (error) {
    console.error('❌ nowpayments-utils error:', error);
    return res.status(500).json({ error: error.message });
  }
}
