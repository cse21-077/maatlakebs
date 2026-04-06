export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const response = await fetch('https://api-sandbox.nowpayments.io/v1/currencies', {
      method: 'GET',
      headers: {
        'x-api-key': process.env.NOW_PAYMENTS_API_KEY,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ error: data });
    }

    res.status(200).json({ currencies: data.currencies });
  } catch (error) {
    console.error('Serverless function error:', error);
    res.status(500).json({ error: error.message });
  }
}
