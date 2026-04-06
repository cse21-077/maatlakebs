export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  console.log('API KEY:', process.env.NOW_PAYMENTS_API_KEY);
  console.log('Request body:', req.body);

  try {
    console.log('Attempting to fetch from NowPayments...');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const response = await fetch('https://api.sandbox.nowpayments.io/v1/invoice', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.NOW_PAYMENTS_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(req.body),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    console.log('Response status:', response.status);
    const data = await response.json();
    console.log('NowPayments response:', data);

    if (!response.ok) {
      console.error('NowPayments API error:', data);
      return res.status(response.status).json({ error: data });
    }

    console.log('Invoice created successfully:', data.invoice_id);
    res.status(200).json({
      id: data.id,
      invoice_id: data.invoice_id,
      payment_url: data.link,
      price_amount: data.price_amount,
      price_currency: data.price_currency,
      status: data.status,
    });
  } catch (error) {
    console.error('Serverless function error:', error.name, error.message);
    console.error('Error code:', error.code);
    console.error('Full error:', JSON.stringify(error, null, 2));
    res.status(500).json({ 
      error: error.message,
      code: error.code,
      name: error.name
    });
  }
}

