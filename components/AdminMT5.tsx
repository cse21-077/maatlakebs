import React, { useState, useEffect, useCallback } from 'react';
import { Server, Loader, CheckCircle, XCircle, LogOut, RefreshCw, Plus } from 'lucide-react';
import { MT5_SERVER_PRESETS } from './shared';

interface AdminMT5Props {
  adminId: string;
}

interface MentorStatus {
  connected: boolean;
  status?: string;
  balance?: number | null;
  currency?: string | null;
  reported_server?: string | null;
  expected_server?: string | null;
  server_mismatch?: boolean;
  message?: string | null;
  bridge_error?: string;
}

interface MentorAccount {
  login: string;
  server: string;
  broker: 'weltrade' | 'deriv' | string;
  mentor_id: string;
  connected_at: string;
  status?: MentorStatus;
}

const BROKER_BADGE: Record<string, { label: string; cls: string }> = {
  weltrade: { label: 'Wel', cls: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
  deriv: { label: 'Dev', cls: 'bg-red-500/10 text-red-400 border-red-500/20' },
};

export const AdminMT5: React.FC<AdminMT5Props> = ({ adminId }) => {
  const [accounts, setAccounts] = useState<MentorAccount[]>([]);
  const [bridgeConfigured, setBridgeConfigured] = useState(true);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ login: '', password: '', server: '' });
  const [connecting, setConnecting] = useState(false);
  const [busyLogin, setBusyLogin] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const fetchAccounts = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/mt5?admin_id=${encodeURIComponent(adminId)}`);
      const data = await res.json().catch(() => null);
      if (res.ok && data) {
        setAccounts(Array.isArray(data.accounts) ? data.accounts : []);
        setBridgeConfigured(data.configured !== false);
      }
    } catch {
      // Keep the last known state — the bridge may be briefly unreachable
    } finally {
      setLoading(false);
    }
  }, [adminId]);

  useEffect(() => {
    fetchAccounts();
    const timer = setInterval(fetchAccounts, 5000);
    return () => clearInterval(timer);
  }, [fetchAccounts]);

  const showError = (msg: string) => {
    setError(msg);
    setTimeout(() => setError(''), 5000);
  };

  const showNotice = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(''), 4000);
  };

  const handleConnect = async () => {
    setError('');
    if (!form.login || !form.password || !form.server) {
      showError('Fill in login, password and server');
      return;
    }
    setConnecting(true);
    try {
      const res = await fetch('/api/admin/mt5', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          admin_id: adminId,
          login: form.login,
          password: form.password,
          server: form.server,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Connect failed (${res.status})`);

      setForm({ login: '', password: '', server: '' });
      setShowForm(false);
      showNotice(data.message || 'Mentor terminal connected');
      await fetchAccounts();
    } catch (err: any) {
      showError(err.message || 'Failed to connect MT5 account');
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async (login: string) => {
    setBusyLogin(login);
    try {
      const res = await fetch('/api/admin/mt5', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ admin_id: adminId, login }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Disconnect failed');

      showNotice('MT5 account disconnected');
      await fetchAccounts();
    } catch (err: any) {
      showError(err.message || 'Failed to disconnect');
    } finally {
      setBusyLogin('');
    }
  };

  const fmtBalance = (s?: MentorStatus) => {
    if (!s || s.balance === null || s.balance === undefined) return '—';
    try {
      return new Intl.NumberFormat('en-US', { style: 'currency', currency: s.currency || 'USD' }).format(s.balance);
    } catch {
      return `${s.balance} ${s.currency || ''}`.trim();
    }
  };

  const badge = (broker: string) => BROKER_BADGE[broker] || { label: broker.slice(0, 3).toUpperCase(), cls: 'bg-white/5 text-white/40 border-white/10' };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-[#1a1c22] border border-white/5 rounded-2xl p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-primary">
              <Server size={18} />
            </div>
            <div>
              <p className="text-[10px] font-black text-primary uppercase tracking-[0.4em]">Mentor Accounts</p>
              <h2 className="text-base sm:text-lg font-black text-white tracking-tighter">
                {accounts.length ? `${accounts.length} connected` : 'Connect your MT5 accounts'}
              </h2>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchAccounts}
              className="w-9 h-9 bg-white/5 rounded-xl flex items-center justify-center text-white/40 hover:text-white transition-all"
              title="Refresh status"
            >
              <RefreshCw size={14} />
            </button>
            <button
              onClick={() => setShowForm(v => !v)}
              className="flex items-center gap-1.5 px-3 py-2 bg-primary/10 text-primary rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-primary/20 transition-all"
              title="Connect an account"
            >
              <Plus size={14} />
              <span className="hidden sm:inline">Account</span>
            </button>
          </div>
        </div>
        <p className="mt-3 text-[10px] font-bold text-white/30 leading-relaxed">
          One mentor account per broker. Trades you make on each account are copied to approved students on the same broker.
        </p>
        {!bridgeConfigured && (
          <p className="mt-3 text-[10px] font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-xl p-3">
            Bridge not configured — set MK_BRIDGE_URL and MK_BRIDGE_KEY.
          </p>
        )}
      </div>

      {/* Account cards */}
      {accounts.map((acct) => {
        const s = acct.status;
        const connected = Boolean(s?.connected);
        const b = badge(acct.broker);
        return (
          <div key={acct.login} className="bg-[#1a1c22] border border-white/5 rounded-2xl p-4 sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${connected ? 'bg-emerald-500/10 text-emerald-400' : 'bg-white/5 text-white/30'}`}>
                  <Server size={18} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-base sm:text-lg font-black text-white tracking-tighter">Login {acct.login}</p>
                    <span className={`px-2 py-0.5 rounded-md border text-[9px] font-black uppercase tracking-widest ${b.cls}`}>{b.label}</span>
                  </div>
                  <p className="text-[9px] font-black text-white/30 uppercase tracking-[0.2em] mt-0.5">
                    Broker · {acct.broker}
                  </p>
                </div>
              </div>
              <button
                onClick={() => handleDisconnect(acct.login)}
                disabled={busyLogin === acct.login}
                className="flex items-center gap-1.5 px-3 py-2 bg-red-500/10 text-red-400 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-red-500/20 transition-all disabled:opacity-50"
                title="Disconnect and stop this mentor terminal"
              >
                {busyLogin === acct.login ? <Loader size={14} className="animate-spin" /> : <LogOut size={14} />}
                <span className="hidden sm:inline">Disconnect</span>
              </button>
            </div>

            <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="bg-white/5 rounded-xl p-3">
                <p className="text-[8px] font-black text-white/30 uppercase tracking-widest">Status</p>
                <p className={`text-xs font-black uppercase mt-1 flex items-center gap-1 ${connected ? 'text-emerald-400' : 'text-red-400'}`}>
                  {connected ? <CheckCircle size={12} /> : <XCircle size={12} />}
                  {connected ? 'Connected' : (s?.status || 'Disconnected')}
                </p>
              </div>
              <div className="bg-white/5 rounded-xl p-3">
                <p className="text-[8px] font-black text-white/30 uppercase tracking-widest">Balance</p>
                <p className="text-xs font-black text-white mt-1">{fmtBalance(s)}</p>
              </div>
              <div className="bg-white/5 rounded-xl p-3">
                <p className="text-[8px] font-black text-white/30 uppercase tracking-widest">Server</p>
                <p className="text-xs font-black text-white mt-1 truncate">{s?.reported_server || acct.server}</p>
              </div>
              <div className="bg-white/5 rounded-xl p-3">
                <p className="text-[8px] font-black text-white/30 uppercase tracking-widest">Role</p>
                <p className="text-xs font-black text-primary mt-1">MENTOR</p>
              </div>
            </div>

            {s?.server_mismatch && (
              <p className="mt-3 text-[10px] font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-xl p-3">
                Server mismatch: the terminal reports “{s.reported_server}” but the account is registered as “{s.expected_server}”.
              </p>
            )}
            {s && !connected && s.bridge_error && (
              <p className="mt-3 text-[10px] font-bold text-white/40">{s.bridge_error}</p>
            )}
          </div>
        );
      })}

      {!loading && accounts.length === 0 && (
        <div className="bg-[#1a1c22] border border-white/5 rounded-2xl p-6 text-center">
          <p className="text-[10px] font-black text-white/30 uppercase tracking-widest">No mentor accounts connected</p>
        </div>
      )}

      {/* Connect form */}
      {showForm && (
        <div className="bg-[#1a1c22] border border-white/5 rounded-2xl p-4 sm:p-5 space-y-3">
          <p className="text-[10px] font-black text-white/30 uppercase tracking-widest">
            Connect one account per broker — the server name decides the broker (Weltrade-* or Deriv*).
          </p>
          <input
            type="number"
            placeholder="MT5 Login ID"
            value={form.login}
            onChange={(e) => setForm({ ...form, login: e.target.value })}
            className="w-full bg-dark/50 border border-white/10 rounded-xl py-4 px-4 text-white text-sm font-bold focus:border-primary transition-all outline-none"
          />
          <input
            list="mt5-servers"
            placeholder="Server (e.g. Weltrade-Real, DerivSVG-Server)"
            value={form.server}
            onChange={(e) => setForm({ ...form, server: e.target.value })}
            className="w-full bg-dark/50 border border-white/10 rounded-xl py-4 px-4 text-white text-sm font-bold focus:border-primary transition-all outline-none"
          />
          <datalist id="mt5-servers">
            {MT5_SERVER_PRESETS.map(s => <option key={s} value={s} />)}
          </datalist>
          <input
            type="password"
            placeholder="MT5 Password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            className="w-full bg-dark/50 border border-white/10 rounded-xl py-4 px-4 text-white text-sm font-bold focus:border-primary transition-all outline-none"
          />
          <button
            onClick={handleConnect}
            disabled={connecting}
            className="w-full py-4 rounded-xl bg-gradient-to-r from-primary to-secondary text-white text-xs font-black uppercase tracking-[0.2em] shadow-lg shadow-primary/20 transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {connecting && <Loader size={14} className="animate-spin" />}
            Connect Mentor Account
          </button>
        </div>
      )}

      {error && (
        <p className="text-[10px] font-bold text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl p-3">{error}</p>
      )}
      {notice && (
        <p className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3">{notice}</p>
      )}
    </div>
  );
};
