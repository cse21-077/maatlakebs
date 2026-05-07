import React, { useState, useEffect } from 'react';
import { 
    ChevronLeft, Lock, Unlock, Zap, ShieldAlert,
    Eye, EyeOff, Trash2
} from 'lucide-react';
import { Button } from './shared';
import { supabase } from '../lib/supabase';
import { DEFAULT_TRADER_ID } from '../lib/database.types';

interface TerminalProtocolProps {
    uid: string;
    traderId: string | null;
    mt5Login: string;
    riskState: any;
    paymentStatus: string;
    onBack: () => void;
    onSuccess: () => void;
    onRefresh: (updatedRisk?: any) => void | Promise<void>;
    onOpenSupport?: (message: string) => void;
    onAccountChanged?: () => void | Promise<void>;
}

export const TerminalProtocol = ({ 
    uid, traderId, mt5Login, riskState, paymentStatus, onBack, onSuccess, onRefresh, onOpenSupport, onAccountChanged
}: TerminalProtocolProps) => {
    const isUnpaid = paymentStatus !== 'CONFIRMED' && uid !== '00000000-0000-4000-a000-000000000000';
    
    const [mt5, setMt5] = useState({ login: '', server: '', password: '' });
    const [showUnlinkConfirm, setShowUnlinkConfirm] = useState(false);
    const [showVerifyModal, setShowVerifyModal] = useState(false);
    const [aggressiveness, setAggressiveness] = useState(riskState.aggressiveness || 1.0);
    const [maxLot, setMaxLot] = useState(riskState.maxLot || 50.0);
    const [maxDD, setMaxDD] = useState(riskState.maxDD || 100.0);
    const [minBal, setMinBal] = useState(riskState.minBalance || 1.0);
    const [pauseCopy, setPauseCopy] = useState(isUnpaid ? true : (riskState.pauseCopy || false));
    const [advanced, setAdvanced] = useState(riskState.advanced_options || { hedge: false });

    // Sync local state when parent props change (Crucial for refreshes)
    useEffect(() => {
        if (!isUnpaid) {
            setPauseCopy(riskState.pauseCopy || false);
        }
        setAggressiveness(riskState.aggressiveness || 1.0);
        setMaxLot(riskState.maxLot || 50.0);
        setMaxDD(riskState.maxDD || 100.0);
        setMinBal(riskState.minBalance || 1.0);
        setAdvanced(riskState.advanced_options || { hedge: false });
    }, [riskState, isUnpaid]);

    useEffect(() => {
        if (isUnpaid) setPauseCopy(true);
    }, [isUnpaid]);
    
    const [isLocked, setIsLocked] = useState(true);
    const [loading, setLoading] = useState(false);
    const [seePw, setSeePw] = useState(false);
    const [err, setErr] = useState('');
    const [userAccounts, setUserAccounts] = useState<any[]>([]);
    const [showAddNew, setShowAddNew] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [accountToDelete, setAccountToDelete] = useState<{login: string, server: string} | null>(null);

    // Local override for mt5Login to ensure UI responsiveness after unlink
    const [localMt5Login, setLocalMt5Login] = useState(mt5Login);

    useEffect(() => { setLocalMt5Login(mt5Login); }, [mt5Login]);

    // Fetch all linked accounts for this user
    useEffect(() => {
        if (!uid || uid === '00000000-0000-4000-a000-000000000000') return;
        const fetchAccounts = async () => {
            const { data, error } = await (supabase as any)
                .from('student_accounts')
                .select('id, mt5_login, mt5_server, is_active, folder_path')
                .eq('user_id', uid)
                .order('created_at', { ascending: false });
            if (!error) setUserAccounts(data || []);
        };
        fetchAccounts();
    }, [uid, localMt5Login, loading]);

    const handleSave = async () => {
        setErr(''); setLoading(true);
        try {
            if (!localMt5Login && mt5.login) {
                const encrypted = mt5.password;
                const resolvedTraderId = traderId || DEFAULT_TRADER_ID;
                
                // Save credentials
                const upsertResponse = await fetch('/api/upsert-student-account', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    user_id: uid,
                    mt5_login: mt5.login,
                    mt5_server: mt5.server,
                    encrypted_password: encrypted,
                    trader_id: resolvedTraderId,
                    is_active: true,
                  }),
                });

                const upsertData = await upsertResponse.json();
                if (!upsertResponse.ok) {
                  throw new Error(upsertData.error || 'Failed to save student account');
                }

                setLocalMt5Login(mt5.login);

                // Immediately provision terminal folder
                console.log('🎯 Provisioning terminal slot for user:', uid);
                const provisionResponse = await fetch('/api/provision-terminal', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ user_id: uid }),
                });

                const provisionData = await provisionResponse.json();
                if (!provisionResponse.ok) {
                  throw new Error(provisionData.error || 'Failed to provision terminal');
                }

                console.log('✅ Terminal provisioned:', provisionData.folder_path);
                
                // Mark connection status as UNKNOWN until worker actually connects
                await (supabase as any).from('connection_status').upsert({
                    user_id: uid,
                    mt5_status: 'UNKNOWN',
                    last_checked: new Date().toISOString(),
                });

                setShowVerifyModal(true); // Show verification modal
            }

            const { error: riskErr } = await (supabase as any).from('risk_profiles').upsert({
                user_id: uid, aggressiveness, max_lot: maxLot, max_drawdown: maxDD, 
                min_balance: minBal, pause_copy: pauseCopy, advanced_options: advanced
            });
            if (riskErr) throw riskErr;

            onRefresh({
                aggressiveness,
                maxLot,
                maxDD,
                pauseCopy,
                advanced_options: advanced
            }); 
        } catch (e: any) { setErr(e.message); }
        finally { setLoading(false); }
    };

    const handleUnlink = async () => {
        setLoading(true);
        try {
            if (uid !== '00000000-0000-4000-a000-000000000000') {
                const { error } = await (supabase as any)
                    .from('student_accounts')
                    .update({ is_active: false })
                    .eq('user_id', uid)
                    .eq('mt5_login', localMt5Login);
                if (error) throw error;
            }
            setLocalMt5Login('');
            setShowUnlinkConfirm(false);
            if (onAccountChanged) await onAccountChanged();
            else onRefresh();
        } catch (e: any) { setErr(e.message); }
        finally { setLoading(false); }
    };

    const handleSwitchAccount = async (login: string, server: string) => {
        setErr(''); setLoading(true);
        try {
            const res = await fetch('/api/upsert-student-account', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    user_id: uid,
                    mt5_login: login,
                    mt5_server: server,
                    is_active: true,
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to switch account');

            setLocalMt5Login(login);
            setShowAddNew(false);

            // Provision terminal for the switched account
            await fetch('/api/provision-terminal', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: uid }),
            });

            await (supabase as any).from('connection_status').upsert({
                user_id: uid,
                mt5_status: 'UNKNOWN',
                last_checked: new Date().toISOString(),
            });

            if (onAccountChanged) await onAccountChanged();
            else onRefresh();
        } catch (e: any) { setErr(e.message); }
        finally { setLoading(false); }
    };

    const handleDeleteAccount = async () => {
        if (!accountToDelete) return;
        setErr(''); setLoading(true);
        try {
            const res = await fetch('/api/upsert-student-account', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    user_id: uid,
                    mt5_login: accountToDelete.login,
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to delete account');

            setShowDeleteConfirm(false);
            setAccountToDelete(null);

            if (onAccountChanged) await onAccountChanged();
            else onRefresh();
        } catch (e: any) { setErr(e.message); }
        finally { setLoading(false); }
    };

    return (
        <>
        {showVerifyModal && (
            <div className="fixed inset-0 bg-dark/95 z-[500] flex items-center justify-center p-8 animate-fade-in backdrop-blur-md">
                <div className="w-full max-w-xs bg-[#1a1c22] border border-white/5 rounded-[2.5rem] p-8 space-y-8 shadow-2xl animate-slide-up">
                    <div className="w-16 h-16 bg-primary/10 text-primary rounded-full flex items-center justify-center mx-auto">
                        <Zap size={32} />
                    </div>
                    <div className="text-center space-y-4">
                        <h3 className="text-xl font-black text-white uppercase tracking-tighter">Verify Connection</h3>
                        <p className="text-[11px] text-white/50 font-bold leading-relaxed">
                            Your account has been saved. We need to verify connectivity to ensure seamless signal mirroring. Please request verification through support — our team will confirm and activate your terminal.
                        </p>
                    </div>
                    <div className="space-y-3">
                        <button 
                            onClick={() => {
                                setShowVerifyModal(false);
                                if (onOpenSupport) {
                                    onOpenSupport('Hi, Please verify that my account has successfully linked and is ready for signal mirroring.');
                                }
                            }}
                            className="w-full py-5 text-primary hover:text-primary/80 font-black uppercase text-xs tracking-widest border border-primary/30 hover:border-primary/60 rounded-xl transition-all"
                        >
                            Request Verification →
                        </button>
                        <button 
                            onClick={() => setShowVerifyModal(false)}
                            className="w-full py-4 text-[10px] font-black text-white/20 uppercase tracking-widest hover:text-white transition-all"
                        >
                            I'll Do This Later
                        </button>
                    </div>
                </div>
            </div>
        )}
        {showUnlinkConfirm && (
            <div className="fixed inset-0 bg-dark/95 z-[500] flex items-center justify-center p-8 animate-fade-in backdrop-blur-md">
                <div className="w-full max-w-xs bg-[#1a1c22] border border-white/5 rounded-[2.5rem] p-8 space-y-8 shadow-2xl animate-slide-up">
                    <div className="w-16 h-16 bg-red-500/10 text-red-500 rounded-full flex items-center justify-center mx-auto">
                        <ShieldAlert size={32} />
                    </div>
                    <div className="text-center space-y-2">
                        <h3 className="text-xl font-black text-white uppercase tracking-tighter">Unlink Terminal?</h3>
                        <p className="text-[11px] text-white/30 font-bold uppercase tracking-widest leading-relaxed">
                            Signal mirroring will stop. You can reconnect with a different account anytime — the terminal slot is reserved.
                        </p>
                    </div>
                    <div className="space-y-3">
                        <Button loading={loading} onClick={handleUnlink} className="w-full py-5 bg-red-500 hover:bg-red-600 text-white font-black uppercase text-xs tracking-widest border-none">
                            Confirm Unlink
                        </Button>
                        <button onClick={() => setShowUnlinkConfirm(false)} className="w-full py-4 text-[10px] font-black text-white/20 uppercase tracking-widest hover:text-white transition-all">
                            Keep Active Link
                        </button>
                    </div>
                </div>
            </div>
        )}
        {showDeleteConfirm && accountToDelete && (
            <div className="fixed inset-0 bg-dark/95 z-[500] flex items-center justify-center p-8 animate-fade-in backdrop-blur-md">
                <div className="w-full max-w-xs bg-[#1a1c22] border border-white/5 rounded-[2.5rem] p-8 space-y-8 shadow-2xl animate-slide-up">
                    <div className="w-16 h-16 bg-red-500/10 text-red-500 rounded-full flex items-center justify-center mx-auto">
                        <Trash2 size={32} />
                    </div>
                    <div className="text-center space-y-2">
                        <h3 className="text-xl font-black text-white uppercase tracking-tighter">Delete Account?</h3>
                        <p className="text-[11px] text-white/30 font-bold uppercase tracking-widest leading-relaxed">
                            This will permanently remove account <span className="text-white font-black">{accountToDelete.login}</span> from your saved accounts. You will need to re-enter the password to link it again.
                        </p>
                    </div>
                    <div className="space-y-3">
                        <Button loading={loading} onClick={handleDeleteAccount} className="w-full py-5 bg-red-500 hover:bg-red-600 text-white font-black uppercase text-xs tracking-widest border-none">
                            Permanently Delete
                        </Button>
                        <button onClick={() => { setShowDeleteConfirm(false); setAccountToDelete(null); }} className="w-full py-4 text-[10px] font-black text-white/20 uppercase tracking-widest hover:text-white transition-all">
                            Keep Saved Account
                        </button>
                    </div>
                </div>
            </div>
        )}

        <div className="absolute inset-0 bg-[#0d0f14] z-[300] flex flex-col pt-12 animate-slide-up overflow-y-auto pb-24">
            <header className="px-8 flex items-center justify-between sticky top-0 z-[310] bg-[#0d0f14]/80 backdrop-blur-xl shrink-0 pt-4 pb-4">
                <button onClick={onBack} className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center text-white/40 hover:bg-white/10 active:scale-90 transition-all shadow-xl"><ChevronLeft size={24} /></button>
                <div className="text-center">
                    <h2 className="text-xl font-black text-white uppercase tracking-tighter">Account Settings</h2>
                    <p className="text-[9px] text-white/30 font-black tracking-[0.2em] uppercase mt-1">MT5 Connection</p>
                </div>
                <div className="w-12" />
            </header>

            <div className="p-8 space-y-10 max-w-md mx-auto w-full pt-4">
                {/* Global Inactive Overlay State */}
                <div className="space-y-10 transition-all duration-700" style={{ opacity: pauseCopy ? 0.2 : 1, pointerEvents: pauseCopy ? 'none' : 'auto' }}>
                    <div className="bg-[#1a1c22] border border-white/5 rounded-[2.5rem] p-10 space-y-8 shadow-2xl relative overflow-hidden group">
                        <div className="flex flex-col items-center justify-center gap-3 text-center">
                            <img src="/metatrader.png" alt="MT5" className="w-5 opacity-40" />
                            <h3 className="text-xs font-black text-white/30 uppercase tracking-[0.2em]">Account</h3>
                        </div>

                        {err && <p className="text-xs text-red-500 font-bold bg-red-500/10 p-4 rounded-xl">{err}</p>}

                        {/* Active Account Card */}
                        {localMt5Login && (
                            <div className="p-6 bg-green-500/5 rounded-3xl border border-green-500/20 flex flex-col gap-4">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <p className="text-[10px] text-green-400 font-black uppercase tracking-widest leading-none">Active Login</p>
                                        <p className="mt-2 text-3xl font-black text-white tracking-tighter">{localMt5Login}</p>
                                    </div>
                                    <div className="flex flex-col items-end gap-1">
                                        <img src="/weltrade.png" alt="Weltrade" className="w-10 h-10 object-contain" />
                                        <span className="text-[9px] font-black text-green-400 uppercase tracking-[0.2em]">Connected</span>
                                    </div>
                                </div>
                                <button onClick={() => setShowUnlinkConfirm(true)} className="w-full text-[10px] font-black text-red-500/30 hover:text-red-500 uppercase tracking-[0.4em] transition-all">Disconnect Account →</button>
                            </div>
                        )}

                        {/* Saved Accounts List */}
                        {userAccounts.length > 0 && (
                            <div className="space-y-3">
                                <p className="text-[10px] font-black text-white/30 uppercase tracking-[0.3em]">Saved Accounts</p>
                                <p className="text-[9px] text-white/20 font-bold leading-relaxed">
                                    Only one account can be active at a time. Switching deactivates the current account.
                                </p>
                                {userAccounts.filter(a => a.mt5_login !== localMt5Login).slice(0, 3).map((acct) => (
                                    <div key={acct.id} className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/5">
                                        <div>
                                            <p className="text-lg font-black text-white tracking-tight">{acct.mt5_login}</p>
                                            <p className="text-[9px] font-black text-white/30 uppercase tracking-[0.2em]">{acct.mt5_server || 'Unknown Server'}</p>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => {
                                                    setAccountToDelete({ login: acct.mt5_login, server: acct.mt5_server });
                                                    setShowDeleteConfirm(true);
                                                }}
                                                className="p-2 text-white/10 hover:text-red-500 transition-all"
                                                title="Delete account"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                            <Button
                                                onClick={() => handleSwitchAccount(acct.mt5_login, acct.mt5_server)}
                                                loading={loading}
                                                className="px-4 py-2 text-[9px] uppercase font-black tracking-[0.2em]"
                                            >
                                                Switch →
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                                {userAccounts.filter(a => a.mt5_login !== localMt5Login).length > 3 && (
                                    <p className="text-[9px] text-white/20 font-black uppercase tracking-widest text-center">
                                        +{userAccounts.filter(a => a.mt5_login !== localMt5Login).length - 3} more saved accounts
                                    </p>
                                )}
                            </div>
                        )}

                        {/* Link Different Account Toggle */}
                        {(!localMt5Login || userAccounts.length > 0) && (
                            <button
                                onClick={() => setShowAddNew(!showAddNew)}
                                className="w-full py-4 border border-white/10 rounded-2xl text-[10px] font-black text-white/30 hover:text-primary hover:border-primary/30 uppercase tracking-[0.3em] transition-all"
                            >
                                {showAddNew ? '← Cancel' : '+ Link Different Account'}
                            </button>
                        )}

                        {/* Link Different Account Form */}
                        {showAddNew && (
                            <div className="space-y-4 pt-4 border-t border-white/5">
                                <input type="number" placeholder="MT5 Login ID" className="w-full bg-dark/50 border border-white/10 rounded-2xl py-5 px-6 text-white text-lg font-bold" value={mt5.login} onChange={e => setMt5({ ...mt5, login: e.target.value })} />
                                <div className="relative">
                                    <select className="w-full bg-dark/50 border border-white/10 rounded-2xl py-5 px-6 text-white text-lg font-bold appearance-none transition-all focus:border-primary" value={mt5.server} onChange={e => setMt5({ ...mt5, server: e.target.value })}>
                                        <option value="">Protocol Server</option>
                                        <option value="Weltrade-Real">Weltrade-Real</option>
                                        <option value="Weltrade-Demo">Weltrade-Demo</option>
                                    </select>
                                    <img src="/weltrade.png" className="absolute right-6 top-1/2 -translate-y-1/2 w-8 opacity-20" />
                                </div>
                                <div className="relative">
                                    <input type={seePw ? "text" : "password"} placeholder="Passphrase" className="w-full bg-dark/50 border border-white/10 rounded-2xl py-5 px-6 text-white text-lg font-bold pr-14" value={mt5.password} onChange={e => setMt5({ ...mt5, password: e.target.value })} />
                                    <button onClick={() => setSeePw(!seePw)} className="absolute right-6 top-1/2 -translate-y-1/2 text-white/20 hover:text-white transition-all">
                                        {seePw ? <EyeOff size={20} /> : <Eye size={20} />}
                                    </button>
                                </div>
                                <Button loading={loading} onClick={handleSave} className="w-full py-5 text-xs uppercase font-black tracking-[0.2em] shadow-2xl shadow-primary/20">
                                    Connect →
                                </Button>
                            </div>
                        )}

                        {/* No accounts at all — show default form */}
                        {!localMt5Login && userAccounts.length === 0 && !showAddNew && (
                            <div className="space-y-4">
                                <input type="number" placeholder="MT5 Login ID" className="w-full bg-dark/50 border border-white/10 rounded-2xl py-5 px-6 text-white text-lg font-bold" value={mt5.login} onChange={e => setMt5({ ...mt5, login: e.target.value })} />
                                <div className="relative">
                                    <select className="w-full bg-dark/50 border border-white/10 rounded-2xl py-5 px-6 text-white text-lg font-bold appearance-none transition-all focus:border-primary" value={mt5.server} onChange={e => setMt5({ ...mt5, server: e.target.value })}>
                                        <option value="">Protocol Server</option>
                                        <option value="Weltrade-Real">Weltrade-Real</option>
                                        <option value="Weltrade-Demo">Weltrade-Demo</option>
                                    </select>
                                    <img src="/weltrade.png" className="absolute right-6 top-1/2 -translate-y-1/2 w-8 opacity-20" />
                                </div>
                                <div className="relative">
                                    <input type={seePw ? "text" : "password"} placeholder="Passphrase" className="w-full bg-dark/50 border border-white/10 rounded-2xl py-5 px-6 text-white text-lg font-bold pr-14" value={mt5.password} onChange={e => setMt5({ ...mt5, password: e.target.value })} />
                                    <button onClick={() => setSeePw(!seePw)} className="absolute right-6 top-1/2 -translate-y-1/2 text-white/20 hover:text-white transition-all">
                                        {seePw ? <EyeOff size={20} /> : <Eye size={20} />}
                                    </button>
                                </div>
                                <Button loading={loading} onClick={handleSave} className="w-full py-5 text-xs uppercase font-black tracking-[0.2em] shadow-2xl shadow-primary/20">
                                    Connect →
                                </Button>
                            </div>
                        )}
                    </div>

                    <div className="bg-[#1a1c22] border border-white/5 rounded-[2.5rem] p-10 space-y-10 shadow-2xl relative">
                        {/* Floating Badge Lock */}
                        <button 
                            onClick={() => {
                                if (advanced?.settings_locked) return;
                                setIsLocked(!isLocked);
                            }} 
                            className={`absolute -top-3 right-8 px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-[0.2em] transition-all shadow-xl z-20 ${
                                isLocked 
                                    ? (advanced?.settings_locked ? 'bg-blue-600 text-white shadow-blue-500/20' : 'bg-red-500 text-white shadow-red-500/20') 
                                    : 'bg-primary text-dark shadow-primary/20'
                            } ${advanced?.settings_locked ? 'cursor-default' : 'cursor-pointer'}`}
                        >
                            {isLocked ? (advanced?.settings_locked ? 'Mentor Set' : 'Click to Edit') : 'Edit Mode'}
                        </button>

                        <div className="flex justify-between items-center">
                            <div className="flex items-center gap-2">
                               <Zap size={16} className="text-primary opacity-40" />
                               <h3 className="text-xs font-black text-white/30 uppercase tracking-[0.2em]">Risk Management</h3>
                            </div>
                        </div>
                        <div className="space-y-10 transition-all duration-500" style={{ opacity: isLocked ? 0.3 : 1, pointerEvents: isLocked ? 'none' : 'auto' }}>
                            {[
                                { label: 'Trade Size (Multiplied)', val: aggressiveness, set: setAggressiveness, min: 0.1, max: 10.0, step: 0.1, unit: 'x' },
                                { label: 'Lot Size Cap', val: maxLot, set: setMaxLot, min: 0.01, max: 50.0, step: 0.01, unit: ' L' },
                                { label: 'Loss Limit', val: maxDD, set: setMaxDD, min: 5, max: 100, step: 5, unit: '%' },
                                { label: 'Minimum Equity', val: minBal, set: setMinBal, min: 0, max: 1000, step: 1, unit: '$' }
                            ].map((item, i) => (
                                <div key={i} className="space-y-4">
                                    <div className="flex justify-between items-end"><p className="text-[10px] text-white/30 font-bold uppercase tracking-widest">{item.label}</p><p className="text-2xl font-black text-white tracking-tighter">{item.val}{item.unit}</p></div>
                                    <input type="range" min={item.min} max={item.max} step={item.step} value={item.val} onChange={e => item.set(parseFloat(e.target.value))} className="w-full h-1 bg-white/10 rounded-full appearance-none accent-primary" />
                                </div>
                            ))}

                            <div className="flex items-center justify-between pt-6 border-t border-white/5">
                                <div className="space-y-1">
                                    <p className="text-xs font-black text-white uppercase tracking-tighter">Hedge Mode</p>
                                    <p className="text-[9px] text-white/30 font-bold uppercase tracking-widest">Advanced Mirroring</p>
                                </div>
                                <button onClick={() => setAdvanced({...advanced, hedge: !advanced.hedge})}
                                    className={`w-12 h-6 rounded-full transition-all relative ${advanced.hedge ? 'bg-primary' : 'bg-white/10'}`}>
                                    <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${advanced.hedge ? 'left-7' : 'left-1'}`} />
                                </button>
                            </div>
                        </div>
                        {!isLocked && <Button loading={loading} onClick={handleSave} className="w-full py-5 text-xs uppercase font-black tracking-[0.2em]">Sync →</Button>}
                    </div>
                </div>

                {/* Independent Kill Switch Card */}
                <div className="bg-red-500 rounded-[2.5rem] p-8 shadow-2xl shadow-red-500/20 relative">
                    <div className="flex items-center justify-between">
                        <div className="space-y-1">
                            <p className="text-sm font-black text-dark uppercase tracking-tighter">
                                {isUnpaid ? 'Handshake Locked' : 'Emergency Stop'}
                            </p>
                            <p className="text-[10px] text-dark/40 font-bold uppercase tracking-widest">
                                {isUnpaid ? 'Payment Required' : 'Stop All Trades'}
                            </p>
                        </div>
                        <button 
                            disabled={isUnpaid || loading}
                            onClick={async () => {
                                const nextState = !pauseCopy;
                                const isGuest = uid === '00000000-0000-4000-a000-000000000000';
                                
                                setLoading(true);
                                try {
                                    setPauseCopy(nextState);
                                    
                                    const currentState = {
                                        aggressiveness,
                                        maxLot,
                                        maxDD,
                                        pauseCopy: nextState,
                                        advanced_options: advanced
                                    };

                                    if (!isGuest) {
                                        const { error } = await (supabase as any).from('risk_profiles').upsert({ 
                                            user_id: uid, 
                                            pause_copy: nextState,
                                            aggressiveness,
                                            max_lot: maxLot,
                                            max_drawdown: maxDD,
                                            advanced_options: advanced
                                        });
                                        if (error) throw error;
                                    }
                                    
                                    onRefresh(currentState); // Pull new state to MainApp
                                } catch (e: any) {
                                    console.error('Handshake Error:', e.message);
                                    setErr(e.message);
                                    setPauseCopy(!nextState); // Rollback on fail
                                } finally {
                                    setLoading(false);
                                }
                            }}
                            className={`w-14 h-8 rounded-full transition-all relative ${pauseCopy ? 'bg-dark shadow-inner outline outline-2 outline-white/20' : 'bg-white/30'} ${isUnpaid ? 'opacity-50 grayscale' : ''}`}
                        >
                            <div className={`absolute top-1.5 w-5 h-5 bg-white rounded-full transition-all shadow-xl ${pauseCopy ? 'left-7.5' : 'left-1.5'}`} />
                        </button>
                    </div>
                    {pauseCopy && (
                        <div className="mt-6 pt-6 border-t border-dark/10 animate-fade-in">
                            <p className="text-[10px] font-black text-dark/60 uppercase tracking-widest leading-relaxed">
                                {isUnpaid ? 'ACCESS SUSPENDED. Mirror trading is disabled until subscription dues are settled.' : 'Terminal Disconnected. Signal traffic is suspended across all institutional nodes.'}
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
        </>
    );
};
