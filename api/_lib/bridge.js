/**
 * Shared SkuD bridge client.
 *
 * The bridge (final/bridge.py on the Windows VPS) owns all MT5 state:
 * accounts, terminals, orders and liveness. Every api route that needs
 * MT5 talks to it with `Authorization: Bearer SKUD_BRIDGE_KEY`.
 *
 * Config (server-side env, never exposed to the browser):
 *   SKUD_BRIDGE_URL  e.g. https://skud.toporapula.dev
 *   SKUD_BRIDGE_KEY  >= 32 chars, same value the bridge was started with
 */

const DEFAULT_MENTOR_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

export function bridgeConfig() {
  const base = (process.env.SKUD_BRIDGE_URL || '').replace(/\/+$/, '');
  const key = process.env.SKUD_BRIDGE_KEY || '';
  return { base, key, configured: Boolean(base && key) };
}

export function defaultMentorId() {
  return process.env.SKUD_DEFAULT_MENTOR_ID || DEFAULT_MENTOR_ID;
}

export { DEFAULT_MENTOR_ID };

/**
 * Broker family for an MT5 server name. The platform runs two mentor
 * accounts — one Weltrade, one Deriv — and students are assigned to the
 * mentor matching their own broker.
 */
export function detectBroker(server) {
  const s = String(server || '').toLowerCase();
  if (s.startsWith('weltrade')) return 'weltrade';
  if (s.startsWith('deriv')) return 'deriv';
  return null;
}

export function mentorIdForBroker(broker) {
  return broker ? `admin-${broker}` : null;
}

/**
 * Call the bridge. Never throws on HTTP error status — returns
 * { ok, status, data } so callers decide what is fatal. Throws only when
 * the bridge is unconfigured or unreachable.
 */
export async function bridgeFetch(path, { method = 'GET', body, timeoutMs = 15000 } = {}) {
  const { base, key, configured } = bridgeConfig();

  if (!configured) {
    const err = new Error('MT5 bridge not configured: set SKUD_BRIDGE_URL and SKUD_BRIDGE_KEY');
    err.code = 'BRIDGE_NOT_CONFIGURED';
    throw err;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${key}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    const text = await res.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { raw: text };
    }

    return { ok: res.ok, status: res.status, data };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Best-effort bridge call for admin flows: logs a warning instead of
 * throwing, so a bridge hiccup never blocks a Supabase write.
 * Returns { attempted, ok, status, data, error }.
 */
export async function bridgeTry(path, options = {}) {
  try {
    const r = await bridgeFetch(path, { timeoutMs: 10000, ...options });
    if (!r.ok) {
      console.warn(`⚠️ Bridge ${options.method || 'GET'} ${path} → ${r.status}:`, r.data?.error || r.data);
    }
    return { attempted: true, ...r };
  } catch (err) {
    console.warn(`⚠️ Bridge ${options.method || 'GET'} ${path} failed:`, err.message);
    return { attempted: false, ok: false, status: 0, data: null, error: err.message };
  }
}
