export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { amount, from_currency, to_currency = 'usd' } = req.query;

  if (!amount || !from_currency) {
    return res.status(400).json({ error: 'amount and from_currency query parameters required' });
  }

  try {
    const response = await fetch(
      `https://api-sandbox.nowpayments.io/v1/estimate?amount=${amount}&from_currency=${from_currency}&to_currency=${to_currency}`,
      {
        method: 'GET',
        headers: {
          'x-api-key': process.env.NOW_PAYMENTS_API_KEY,
        },
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ error: data });
    }

    res.status(200).json(data);
  } catch (error) {
    console.error('Serverless function error:', error);
    res.status(500).json({ error: error.message });
  }
}
