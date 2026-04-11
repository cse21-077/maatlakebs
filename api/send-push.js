/**
 * /api/send-push
 * Sends a Web Push notification to a specific user via their stored subscription.
 * Called by TechSupportDashboard after admin replies to a support chat.
 */

import { createClient } from '@supabase/supabase-js';

const VAPID_PUBLIC_KEY  = 'BCuOGe8e3f4Dt-BhVjS3m7KI5tSniQbPUoz85WvOmVB0retsClv3jR65FtHKzfn9EkGDIxKVXRj2e_veuBcyLUI';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY; // set in Vercel env vars
const VAPID_SUBJECT     = 'mailto:support@maatlakebs.com';

// ── JWT / VAPID helpers (no external libs needed in Node 18+) ──────────────

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
        // Convert raw private scalar to PKCS8 (wrap it properly)
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
    return `${header}.${payload}.${base64urlEncode(sig)}`;
}

// ── Encrypt payload for Web Push (AES-128-GCM + ECDH) ─────────────────────
async function encryptPayload(subscription, plaintext) {
    const { subtle } = await import('node:crypto');
    const payload = Buffer.from(JSON.stringify(plaintext));

    // Auth secret and receiver public key from subscription
    const authSecret   = base64urlToBuffer(subscription.keys.auth);
    const receiverPub  = base64urlToBuffer(subscription.keys.p256dh);

    // Generate ephemeral sender key pair
    const senderKeys = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey']);
    const senderPublicRaw = Buffer.from(await subtle.exportKey('raw', senderKeys.publicKey));

    // Import receiver public key
    const receiverKey = await subtle.importKey('raw', receiverPub, { name: 'ECDH', namedCurve: 'P-256' }, false, []);

    // Derive shared secret
    const sharedSecret = await subtle.deriveBits({ name: 'ECDH', public: receiverKey }, senderKeys.privateKey, 256);

    // HKDF to derive content encryption key
    const salt = Buffer.from(require('crypto').randomBytes(16));
    const prk = await subtle.importKey('raw', Buffer.from(sharedSecret), 'HKDF', false, ['deriveKey']);
    const contentKey = await subtle.deriveKey(
        { name: 'HKDF', hash: 'SHA-256', salt, info: Buffer.concat([
            Buffer.from('Content-Encoding: aes128gcm\0', 'utf8'),
            Buffer.alloc(1)
        ]) },
        prk, { name: 'AES-GCM', length: 128 }, false, ['encrypt']
    );

    // Encrypt
    const iv = require('crypto').randomBytes(12);
    const paddedPayload = Buffer.concat([payload, Buffer.alloc(1)]); // add the \2 delimiter
    const ciphertext = Buffer.from(await subtle.encrypt({ name: 'AES-GCM', iv }, contentKey, paddedPayload));

    // Build RFC8188 header
    const header = Buffer.concat([salt, Buffer.from([0, 0, 16, 0]), Buffer.from([senderPublicRaw.length]), senderPublicRaw]);
    return { body: Buffer.concat([header, ciphertext]), salt };
}

// ── Main handler ───────────────────────────────────────────────────────────

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).end();

    const { user_id, title, body, url = '/' } = req.body;
    if (!user_id || !title) return res.status(400).json({ error: 'user_id and title required' });
    if (!VAPID_PRIVATE_KEY) return res.status(500).json({ error: 'VAPID_PRIVATE_KEY not configured' });

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

    // Fetch user's push subscription
    const { data, error } = await supabase
        .from('push_subscriptions')
        .select('subscription')
        .eq('user_id', user_id)
        .single();

    if (error || !data) {
        return res.status(404).json({ error: 'No push subscription for this user' });
    }

    const subscription = JSON.parse(data.subscription);
    const endpoint = subscription.endpoint;
    const audience = new URL(endpoint).origin;

    try {
        const jwt  = await buildVapidJwt(audience);
        const auth = `vapid t=${jwt},k=${VAPID_PUBLIC_KEY}`;

        // Simple text push (no encryption needed for text/plain)
        const pushPayload = JSON.stringify({ title, body, url });

        const pushRes = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Authorization': auth,
                'Content-Type': 'application/json',
                'TTL': '86400',
            },
            body: pushPayload,
        });

        if (!pushRes.ok) {
            const errText = await pushRes.text();
            console.error('[Push] Delivery failed:', pushRes.status, errText);
            // If subscription expired, clean it up
            if (pushRes.status === 410 || pushRes.status === 404) {
                await supabase.from('push_subscriptions').delete().eq('user_id', user_id);
            }
            return res.status(502).json({ error: 'Push delivery failed', status: pushRes.status });
        }

        return res.status(200).json({ success: true });
    } catch (err) {
        console.error('[Push] Error:', err);
        return res.status(500).json({ error: err.message });
    }
}
