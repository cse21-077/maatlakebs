/**
 * /api/send-push
 * Sends a Web Push notification to a specific user via their stored subscription.
 * Called by TechSupportDashboard after admin replies to a support chat.
 * 
 * Supports both:
 * 1. Simple text/plain push (preferred - more reliable)
 * 2. VAPID-signed JSON push (fallback if VAPID keys available)
 */

import { createClient } from '@supabase/supabase-js';

const VAPID_PUBLIC_KEY  = 'BCuOGe8e3f4Dt-BhVjS3m7KI5tSniQbPUoz85WvOmVB0retsClv3jR65FtHKzfn9EkGDIxKVXRj2e_veuBcyLUI';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY; // set in Vercel env vars
const VAPID_SUBJECT     = 'mailto:support@maatlakebs.com';

console.log('[Push] VAPID_PRIVATE_KEY configured:', !!VAPID_PRIVATE_KEY);

// ── JWT / VAPID helpers ────────────────────────────────────────────────────

function base64urlEncode(buffer) {
    return Buffer.from(buffer)
        .toString('base64')
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function base64urlToBuffer(str) {
    const padded = str + '='.repeat((4 - str.length % 4) % 4);
    return Buffer.from(padded.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

async function buildVapidJwt(audience) {
    try {
        const { subtle } = await import('node:crypto');
        const header  = base64urlEncode(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
        const payload = base64urlEncode(JSON.stringify({
            aud: audience,
            exp: Math.floor(Date.now() / 1000) + 12 * 3600,
            sub: VAPID_SUBJECT
        }));
        const keyData = base64urlToBuffer(VAPID_PRIVATE_KEY);
        const cryptoKey = await subtle.importKey(
            'pkcs8',
            (() => {
                // Build minimal PKCS8 DER for P-256 private key from raw scalar
                const prefix = Buffer.from('308187020100301306072a8648ce3d020106082a8648ce3d030107046d306b0201010420', 'hex');
                const suffix = Buffer.from('a144034200', 'hex');
                const pubKey  = base64urlToBuffer(VAPID_PUBLIC_KEY);
                return Buffer.concat([prefix, keyData, suffix, pubKey]);
            })(),
            { name: 'ECDSA', namedCurve: 'P-256' },
            false,
            ['sign']
        );
        const sig = await subtle.sign(
            { name: 'ECDSA', hash: 'SHA-256' },
            cryptoKey,
            Buffer.from(`${header}.${payload}`)
        );
        console.log('[Push] VAPID JWT built successfully');
        return `${header}.${payload}.${base64urlEncode(sig)}`;
    } catch (err) {
        console.error('[Push] VAPID JWT generation failed:', err.message);
        throw err;
    }
}

// ── Main handler ───────────────────────────────────────────────────────────

export default async function handler(req, res) {
    console.log('[Push] Request received');
    
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { user_id, title, body, url = '/' } = req.body;
    console.log('[Push] Payload:', { user_id, title, bodyLen: body?.length });
    
    if (!user_id || !title) {
        console.error('[Push] Missing user_id or title');
        return res.status(400).json({ error: 'user_id and title required' });
    }

    const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

    // Fetch user's push subscription
    console.log('[Push] Fetching subscription for user:', user_id);
    const { data, error } = await supabase
        .from('push_subscriptions')
        .select('subscription')
        .eq('user_id', user_id)
        .single();

    if (error || !data) {
        console.error('[Push] No subscription found:', error?.message || 'No data');
        return res.status(404).json({ error: 'No push subscription for this user' });
    }

    try {
        const subscription = JSON.parse(data.subscription);
        const endpoint = subscription.endpoint;
        console.log('[Push] Subscription found, endpoint:', endpoint.substring(0, 50) + '...');

        // Try simple text/plain push first (most reliable)
        console.log('[Push] Attempting simple text/plain push...');
        const simplePayload = JSON.stringify({ title, body, url });

        const pushRes = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'text/plain',
                'TTL': '86400',
            },
            body: simplePayload,
        });

        console.log('[Push] Response status:', pushRes.status);

        if (pushRes.ok) {
            console.log('[Push] ✅ Notification sent successfully (simple)');
            return res.status(200).json({ success: true, method: 'simple' });
        }

        // If simple push fails and we have VAPID keys, try VAPID-signed push
        if (!VAPID_PRIVATE_KEY) {
            const errText = await pushRes.text();
            console.error('[Push] ❌ Simple push failed and no VAPID key:', pushRes.status, errText);
            
            // If subscription expired, clean it up
            if (pushRes.status === 410 || pushRes.status === 404) {
                await supabase.from('push_subscriptions').delete().eq('user_id', user_id);
            }
            
            return res.status(502).json({ 
                error: 'Push delivery failed', 
                status: pushRes.status,
                details: 'VAPID_PRIVATE_KEY not configured'
            });
        }

        // Try VAPID-signed push as fallback
        console.log('[Push] Simple push failed, attempting VAPID-signed push...');
        const audience = new URL(endpoint).origin;
        const jwt  = await buildVapidJwt(audience);
        const auth = `vapid t=${jwt},k=${VAPID_PUBLIC_KEY}`;

        const vapidRes = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Authorization': auth,
                'Content-Type': 'application/json',
                'TTL': '86400',
            },
            body: simplePayload,
        });

        console.log('[Push] VAPID response status:', vapidRes.status);

        if (!vapidRes.ok) {
            const errText = await vapidRes.text();
            console.error('[Push] ❌ VAPID push failed:', vapidRes.status, errText);
            
            // If subscription expired, clean it up
            if (vapidRes.status === 410 || vapidRes.status === 404) {
                await supabase.from('push_subscriptions').delete().eq('user_id', user_id);
            }
            
            return res.status(502).json({ 
                error: 'Push delivery failed', 
                status: vapidRes.status,
                method: 'vapid'
            });
        }

        console.log('[Push] ✅ Notification sent successfully (VAPID)');
        return res.status(200).json({ success: true, method: 'vapid' });

    } catch (err) {
        console.error('[Push] ❌ Error:', err.message, err.stack);
        return res.status(500).json({ error: err.message });
    }
}
