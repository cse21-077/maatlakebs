export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  console.log('API KEY:', process.env.NOW_PAYMENTS_API_KEY);
  console.log('Request body:', req.body);

  try {
    console.log('Attempting to fetch from NowPayments (LIVE)...');
    
    const response = await fetch('https://api-sandbox.nowpayments.io/v1/invoice', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.NOW_PAYMENTS_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(req.body),
    });

    console.log('Response status:', response.status);
    const data = await response.json();
    console.log('NowPayments response:', data);

    if (!response.ok) {
      console.error('NowPayments API error:', data);
      return res.status(response.status).json({ error: data });
    }

    console.log('Invoice created successfully:', data.id);
    res.status(200).json({
      id: data.id,
      invoice_id: data.id,
      payment_url: data.invoice_url,
      price_amount: data.price_amount,
      price_currency: data.price_currency,
      status: data.status,
    });
  } catch (error) {
    console.error('Fetch error caught:', {
      name: error.name,
      message: error.message,
      cause: error.cause,
      code: error.code,
      errno: error.errno,
    });
    
    // More helpful error message
    let errorMsg = error.message;
    if (error.message.includes('ENOTFOUND')) errorMsg = 'DNS resolution failed - cannot reach NowPayments';
    if (error.message.includes('ECONNREFUSED')) errorMsg = 'Connection refused - NowPayments not responding';
    if (error.name === 'AbortError') errorMsg = 'Request timeout';
    
    res.status(500).json({ 
      error: errorMsg,
      details: error.message
    });
  }
}

