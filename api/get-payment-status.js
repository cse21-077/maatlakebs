export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { invoiceId } = req.query;

  if (!invoiceId) {
    return res.status(400).json({ error: 'invoiceId query parameter required' });
  }

  try {
    const response = await fetch(`https://api.sandbox.nowpayments.io/v1/payment/${invoiceId}`, {
      method: 'GET',
      headers: {
        'x-api-key': process.env.NOW_PAYMENTS_API_KEY,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ error: data });
    }

    res.status(200).json({
      invoice_id: data.invoice_id,
      payment_status: data.payment_status,
      pay_address: data.pay_address,
      pay_amount: data.pay_amount,
      pay_currency: data.pay_currency,
      price_amount: data.price_amount,
      price_currency: data.price_currency,
      actually_paid: data.actually_paid,
    });
  } catch (error) {
    console.error('Serverless function error:', error);
    res.status(500).json({ error: error.message });
  }
}
