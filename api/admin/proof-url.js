import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { url } = req.query;
  if (!url) {
    return res.status(400).json({ error: 'Missing url parameter' });
  }

  try {
    // Extract bucket and path from public URL
    // URL format: https://project.supabase.co/storage/v1/object/public/bucket/path
    const urlObj = new URL(url);
    const pathSegments = urlObj.pathname.split('/');
    
    // Find index of 'public' or 'authenticated' in path
    const objectIndex = pathSegments.findIndex(s => s === 'object');
    if (objectIndex === -1 || objectIndex + 2 >= pathSegments.length) {
      return res.status(400).json({ error: 'Invalid Supabase storage URL' });
    }
    
    const bucket = pathSegments[objectIndex + 2];
    const filePath = pathSegments.slice(objectIndex + 3).join('/');

    // Create signed URL (valid for 1 hour)
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrl(filePath, 3600);

    if (error) {
      console.error('❌ Failed to create signed URL:', error);
      return res.status(500).json({ error: error.message });
    }

    return res.status(200).json({ signedUrl: data.signedUrl });
  } catch (err) {
    console.error('❌ Proof URL API error:', err);
    return res.status(500).json({ error: err.message });
  }
}
