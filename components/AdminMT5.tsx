import React, { useState, useEffect, useCallback } from 'react';
import { Server, Loader, CheckCircle, XCircle, LogOut, RefreshCw, ChevronDown } from 'lucide-react';
import { DERIV_SERVERS } from './shared';

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

const BROKERS = [
  {
    key: 'weltrade',
    label: 'Weltrade',
    servers: ['Weltrade-Real', 'Weltrade-Demo'],
    badge: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    dot: 'bg-blue-400',
  },
  {
    key: 'deriv',
    label: 'Deriv',
    servers: DERIV_SERVERS,
    badge: 'bg-red-500/10 text-red-400 border-red-500/20',
    dot: 'bg-red-400',
  },
];

const brokerOf = (server: string): string | null => {
  const s = String(server || '').toLowerCase();
  if (s.startsWith('weltrade')) return 'weltrade';
  if (s.startsWith('deriv')) return 'deriv';
  return null;
};

const fmtBalance = (s?: MentorStatus) => {
  if (!s || s.balance === null || s.balance === undefined) return '—';
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: s.currency || 'USD' }).format(s.balance);
  } catch {
    return `${s.balance} ${s.currency || ''}`.trim();
  }
};

export const AdminMT5: React.FC<AdminMT5Props> = ({ adminId }) => {
  const [accounts, setAccounts] = useState<MentorAccount[]>([]);
  const [bridgeConfigured, setBridgeConfigured] = useState(true);
  const [loading, setLoading] = useState(true);
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
          <button
            onClick={fetchAccounts}
            className="w-9 h-9 bg-white/5 rounded-xl flex items-center justify-center text-white/40 hover:text-white transition-all"
            title="Refresh status"
          >
            <RefreshCw size={14} />
          </button>
        </div>
        <p className="mt-3 text-[10px] font-bold text-white/30 leading-relaxed">
          One mentor account per broker. Trades you make on each account are copied to approved students on the same broker.
        </p>
        {!bridgeConfigured && (
          <p className="mt-3 text-[10px] font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-xl p-3">
            Bridge not configured — set MK_BRIDGE_URL and MK_BRIDGE_KEY (or MK_KEY).
          </p>
        )}
      </div>

      {/* One box per broker */}
      {BROKERS.map((broker) => (
        <BrokerBox
          key={broker.key}
          broker={broker}
          adminId={adminId}
          account={accounts.find(a => (a.broker || brokerOf(a.server)) === broker.key) || null}
          busyLogin={busyLogin}
          connecting={connecting}
          onBusy={(v) => { setConnecting(v); }}
          onBusyLogin={(v) => setBusyLogin(v)}
          onError={showError}
          onNotice={showNotice}
          onChanged={fetchAccounts}
        />
      ))}

      {!loading && accounts.length === 0 && (
        <div className="bg-[#1a1c22] border border-white/5 rounded-2xl p-6 text-center">
          <p className="text-[10px] font-black text-white/30 uppercase tracking-widest">No mentor accounts connected</p>
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

// ── One broker's box: its connected mentor account or the connect form ──────
const BrokerBox = ({
  broker, adminId, account, busyLogin, connecting, onBusy, onBusyLogin, onError, onNotice, onChanged,
}: {
  broker: typeof BROKERS[number];
  adminId: string;
  account: MentorAccount | null;
  busyLogin: string;
  connecting: boolean;
  onBusy: (v: boolean) => void;
  onBusyLogin: (v: string) => void;
  onError: (msg: string) => void;
  onNotice: (msg: string) => void;
  onChanged: () => Promise<void>;
}) => {
  const [form, setForm] = useState({ login: '', password: '', server: '' });
  const [showForm, setShowForm] = useState(false);
  const [seePw, setSeePw] = useState(false);

  const s = account?.status;
  const connected = Boolean(s?.connected);

  const handleConnect = async () => {
    onError('');
    if (!form.login || !form.password || !form.server) {
      onError('Fill in login, password and server');
      return;
    }
    onBusy(true);
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
      onNotice(data.message || `${broker.label} mentor terminal connected`);
      await onChanged();
    } catch (err: any) {
      onError(err.message || 'Failed to connect MT5 account');
    } finally {
      onBusy(false);
    }
  };

  const handleDisconnect = async () => {
    if (!account) return;
    onBusyLogin(account.login);
    try {
      const res = await fetch('/api/admin/mt5', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ admin_id: adminId, login: account.login }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Disconnect failed');

      onNotice(`${broker.label} account disconnected`);
      await onChanged();
    } catch (err: any) {
      onError(err.message || 'Failed to disconnect');
    } finally {
      onBusyLogin('');
    }
  };

  return (
    <div className="bg-[#1a1c22] border border-white/5 rounded-2xl p-4 sm:p-5 space-y-4">
      {/* Broker header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className={`w-2.5 h-2.5 rounded-full ${broker.dot}`} />
          <h3 className="text-xs font-black text-white/60 uppercase tracking-[0.2em]">{broker.label} Mentor Account</h3>
        </div>
        <span className={`px-2.5 py-1 rounded-lg border text-[9px] font-black uppercase tracking-widest ${account ? broker.badge : 'bg-white/5 text-white/30 border-white/10'}`}>
          {account ? 'Linked' : 'Not Linked'}
        </span>
      </div>

      {account ? (
        <>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${connected ? 'bg-emerald-500/10 text-emerald-400' : 'bg-white/5 text-white/30'}`}>
                <Server size={18} />
              </div>
              <div className="min-w-0">
                <p className="text-base sm:text-lg font-black text-white tracking-tighter truncate">Login {account.login}</p>
                <p className={`text-[9px] font-black uppercase tracking-[0.2em] mt-0.5 flex items-center gap-1 ${connected ? 'text-emerald-400' : 'text-red-400'}`}>
                  {connected ? <CheckCircle size={10} /> : <XCircle size={10} />}
                  {connected ? 'Connected' : (s?.status || 'Disconnected')}
                  {!connected && s?.message ? <span className="text-white/30 normal-case tracking-normal font-bold truncate">· {s.message}</span> : null}
                </p>
              </div>
            </div>
            <button
              onClick={handleDisconnect}
              disabled={busyLogin === account.login}
              className="flex items-center gap-1.5 px-3 py-2 bg-red-500/10 text-red-400 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-red-500/20 transition-all disabled:opacity-50 shrink-0"
              title="Disconnect and stop this mentor terminal"
            >
              {busyLogin === account.login ? <Loader size={14} className="animate-spin" /> : <LogOut size={14} />}
              <span className="hidden sm:inline">Disconnect</span>
            </button>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="bg-white/5 rounded-xl p-3">
              <p className="text-[8px] font-black text-white/30 uppercase tracking-widest">Balance</p>
              <p className="text-xs font-black text-white mt-1 truncate">{fmtBalance(s)}</p>
            </div>
            <div className="bg-white/5 rounded-xl p-3">
              <p className="text-[8px] font-black text-white/30 uppercase tracking-widest">Server</p>
              <p className="text-xs font-black text-white mt-1 truncate">{s?.reported_server || account.server}</p>
            </div>
            <div className="bg-white/5 rounded-xl p-3">
              <p className="text-[8px] font-black text-white/30 uppercase tracking-widest">Role</p>
              <p className="text-xs font-black text-primary mt-1">MENTOR</p>
            </div>
          </div>

          {s?.server_mismatch && (
            <p className="text-[10px] font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-xl p-3">
              Server mismatch: the terminal reports “{s.reported_server}” but the account is registered as “{s.expected_server}”.
            </p>
          )}
          {s && !connected && s.bridge_error && (
            <p className="text-[10px] font-bold text-white/40">{s.bridge_error}</p>
          )}
        </>
      ) : showForm ? (
        <div className="space-y-3">
          <input
            type="number"
            placeholder={`${broker.label} MT5 Login ID`}
            value={form.login}
            onChange={(e) => setForm({ ...form, login: e.target.value })}
            className="w-full bg-dark/50 border border-white/10 rounded-xl py-4 px-4 text-white text-sm font-bold focus:border-primary transition-all outline-none"
          />
          <div className="relative">
            <select
              value={form.server}
              onChange={(e) => setForm({ ...form, server: e.target.value })}
              className="w-full bg-dark/50 border border-white/10 rounded-xl py-4 px-4 text-white text-sm font-bold appearance-none focus:border-primary transition-all outline-none"
            >
              <option value="">Select {broker.label} Server</option>
              {broker.servers.map(sv => <option key={sv} value={sv}>{sv}</option>)}
            </select>
            <ChevronDown size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-white/20 pointer-events-none" />
          </div>
          <div className="relative">
            <input
              type={seePw ? 'text' : 'password'}
              placeholder="MT5 Password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="w-full bg-dark/50 border border-white/10 rounded-xl py-4 px-4 pr-12 text-white text-sm font-bold focus:border-primary transition-all outline-none"
            />
            <button
              onClick={() => setSeePw(!seePw)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-white/20 hover:text-white transition-all"
              type="button"
            >
              {seePw ? 'Hide' : 'Show'}
            </button>
          </div>
          <button
            onClick={handleConnect}
            disabled={connecting}
            className="w-full py-4 rounded-xl bg-gradient-to-r from-primary to-secondary text-white text-xs font-black uppercase tracking-[0.2em] shadow-lg shadow-primary/20 transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {connecting && <Loader size={14} className="animate-spin" />}
            Connect {broker.label} Mentor Account
          </button>
        </div>
      ) : (
        <button
          onClick={() => setShowForm(true)}
          className="w-full py-4 border border-white/10 rounded-xl text-[10px] font-black text-white/30 hover:text-primary hover:border-primary/30 uppercase tracking-[0.3em] transition-all"
        >
          + Link {broker.label} Account
        </button>
      )}
    </div>
  );
};
