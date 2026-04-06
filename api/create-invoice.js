export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // DIAGNOSTIC: Check if API key is loading
  console.log('API KEY:', process.env.NOW_PAYMENTS_API_KEY);
  console.log('Request body:', req.body);

  try {
    const response = await fetch('https://api.nowpayments.io/v1/invoice', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.NOW_PAYMENTS_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(req.body),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('NowPayments API error:', data);
      return res.status(response.status).json({ error: data });
    }

    res.status(200).json({
      id: data.id,
      invoice_id: data.invoice_id,
      payment_url: data.link,
      price_amount: data.price_amount,
      price_currency: data.price_currency,
      status: data.status,
    });
  } catch (error) {
    console.error('Serverless function error:', error.message);
    res.status(500).json({ error: error.message });
  }
}
