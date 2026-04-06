export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { from_currency, to_currency = 'usd' } = req.query;

  if (!from_currency) {
    return res.status(400).json({ error: 'from_currency query parameter required' });
  }

  try {
    const response = await fetch(
      `https://api.nowpayments.io/v1/min-amount?from_currency=${from_currency}&to_currency=${to_currency}`,
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

    res.status(200).json({ min_amount: data.min_amount });
  } catch (error) {
    console.error('Serverless function error:', error);
    res.status(500).json({ error: error.message });
  }
}
