import React, { useState, useEffect } from 'react';
import {
  ChevronDown, ChevronUp, Users, CreditCard, AlertCircle,
  CheckCircle, Loader, Eye, ExternalLink, Search, ShieldCheck,
  Monitor, Smartphone, Clock, XCircle, RefreshCw, Filter,
  TrendingUp, Wallet, LogOut, Server, MessageSquare
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Button } from './shared';
import { AdminPaymentReview } from './AdminPaymentReview';
import { AdminSupportPanel } from './AdminSupportPanel';
import { ProofImage } from './ProofImage';

interface StudentAccount {
  id: string;
  mt5_login: string;
  mt5_server: string;
  is_active: boolean;
  is_ghost: boolean;
  folder_path: string | null;
  created_at: string;
}

interface PaymentStatus {
  id: string;
  subscription_status: 'trial' | 'active' | 'overdue' | 'cancelled';
  last_paid: string | null;
  next_due: string | null;
  amount_paid: number | null;
  currency: string | null;
}

interface PendingInvoice {
  id: string;
  invoice_id: string;
  price_amount: string;
  price_currency: string;
  subscription_plan: string;
  payment_status: string;
  payment_method: string;
  proof_of_payment_url: string | null;
  created_at: string;
  original_price?: number;
  discount_amount?: number;
}

interface Student {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  onboarding_completed: boolean;
  created_at: string;
  accounts: StudentAccount[];
  live_accounts: StudentAccount[];
  demo_accounts: StudentAccount[];
  payment_status: PaymentStatus | null;
  pending_invoices: PendingInvoice[];
  has_proof_submitted: boolean;
}

interface AdminDashboardProps {
  adminId: string;
  onBack?: () => void;
}

type AdminTab = 'students' | 'payments' | 'support';

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ adminId, onBack }) => {
  const [activeTab, setActiveTab] = useState<AdminTab>('students');
  const [students, setStudents] = useState<Student[]>([]);
  const [filteredStudents, setFilteredStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [expandedStudent, setExpandedStudent] = useState<string | null>(null);
  const [markingPaid, setMarkingPaid] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState('');
  const [previewProof, setPreviewProof] = useState<PendingInvoice | null>(null);
  const [refreshingServer, setRefreshingServer] = useState(false);

  useEffect(() => {
    fetchStudents();
  }, []);

  useEffect(() => {
    let result = students;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(s =>
        (s.email?.toLowerCase().includes(q)) ||
        (s.full_name?.toLowerCase().includes(q)) ||
        (s.id?.toLowerCase().includes(q))
      );
    }
    if (statusFilter !== 'all') {
      result = result.filter(s => {
        const status = s.payment_status?.subscription_status || 'trial';
        return status === statusFilter;
      });
    }
    setFilteredStudents(result);
  }, [students, searchQuery, statusFilter]);

  const fetchStudents = async () => {
    try {
      setLoading(true);
      setError('');
      const response = await fetch(`/api/admin/students?admin_id=${adminId}`);
      const data = await response.json();
      if (!response.ok) {
        setError(data.error || 'Failed to fetch students');
        return;
      }
      setStudents(data.students || []);
      setFilteredStudents(data.students || []);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch students');
    } finally {
      setLoading(false);
    }
  };

  const handleMarkAsPaid = async (userId: string) => {
    try {
      setMarkingPaid(userId);
      setError('');
      const response = await fetch('/api/admin/students', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, admin_id: adminId }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error || 'Failed to mark as paid');
        return;
      }
      setSuccessMsg(`Student marked as paid. Subscription extended to ${new Date(data.next_due).toLocaleDateString()}.`);
      setTimeout(() => setSuccessMsg(''), 4000);
      await fetchStudents();
    } catch (err: any) {
      setError(err.message || 'Failed to mark as paid');
    } finally {
      setMarkingPaid(null);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  const handleRefreshServer = async () => {
    try {
      setRefreshingServer(true);
      const response = await fetch('http://62.169.27.192:5000/refresh', { method: 'POST' });
      if (!response.ok) throw new Error(`Server returned ${response.status}`);
      setSuccessMsg('Server refreshed successfully.');
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to refresh server');
      setTimeout(() => setError(''), 3000);
    } finally {
      setRefreshingServer(false);
    }
  };

  const getStatusColor = (status?: string) => {
    switch (status) {
      case 'active': return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
      case 'trial': return 'text-blue-400 bg-blue-500/10 border-blue-500/20';
      case 'overdue': return 'text-red-400 bg-red-500/10 border-red-500/20';
      case 'cancelled': return 'text-slate-400 bg-slate-500/10 border-slate-500/20';
      default: return 'text-slate-400 bg-slate-500/10 border-slate-500/20';
    }
  };

  const getStatusIcon = (status?: string) => {
    switch (status) {
      case 'active': return <CheckCircle size={12} />;
      case 'trial': return <Clock size={12} />;
      case 'overdue': return <AlertCircle size={12} />;
      case 'cancelled': return <XCircle size={12} />;
      default: return <Clock size={12} />;
    }
  };

  const isOverdue = (student: Student) => {
    if (!student.payment_status?.next_due) return false;
    return new Date(student.payment_status.next_due) < new Date();
  };

  // ── Proof Preview Modal ───────────────────────────────────────────────────
  if (previewProof) {
    return (
      <div className="fixed inset-0 bg-[#0d0f14]/95 z-[600] flex flex-col p-4 sm:p-6 animate-fade-in overflow-y-auto safe-top">
        <div className="max-w-2xl mx-auto w-full space-y-4 sm:space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg sm:text-xl font-black text-white tracking-tighter">Payment Proof</h2>
            <button onClick={() => setPreviewProof(null)} className="w-10 h-10 bg-white/5 rounded-xl flex items-center justify-center text-white/40 hover:bg-white/10 transition-all">
              ✕
            </button>
          </div>

          <div className="bg-[#1a1c22] border border-white/5 rounded-2xl sm:rounded-3xl p-4 sm:p-6 space-y-3 sm:space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:gap-4 text-sm">
              <div><p className="text-white/30 text-[10px] font-black uppercase tracking-widest">Invoice ID</p><p className="text-white font-bold text-xs sm:text-sm">{previewProof.invoice_id}</p></div>
              <div><p className="text-white/30 text-[10px] font-black uppercase tracking-widest">Amount</p><p className="text-white font-bold text-xs sm:text-sm">${previewProof.price_amount} {previewProof.price_currency}</p></div>
              <div><p className="text-white/30 text-[10px] font-black uppercase tracking-widest">Plan</p><p className="text-white font-bold text-xs sm:text-sm capitalize">{previewProof.subscription_plan}</p></div>
              <div><p className="text-white/30 text-[10px] font-black uppercase tracking-widest">Method</p><p className="text-white font-bold text-xs sm:text-sm capitalize">{previewProof.payment_method}</p></div>
            </div>
          </div>

          <div className="bg-[#1a1c22] border border-white/5 rounded-2xl sm:rounded-3xl p-4 sm:p-6">
            <ProofImage
              url={previewProof.proof_of_payment_url}
              alt="Proof of payment"
              className="rounded-xl sm:rounded-2xl"
            />
          </div>

          <div className="flex gap-3">
            <Button onClick={() => setPreviewProof(null)} className="flex-1 bg-white/5 hover:bg-white/10">Close</Button>
          </div>
        </div>
      </div>
    );
  }

  // ── Payment Reviews Tab ───────────────────────────────────────────────────
  if (activeTab === 'payments') {
    return (
      <div className="min-h-screen bg-[#0d0f14] flex flex-col safe-top">
        {/* Header */}
        <header className="px-4 sm:px-6 pt-4 sm:pt-6 pb-3 sm:pb-4 flex flex-col sm:flex-row sm:items-center justify-between shrink-0 border-b border-white/5 gap-3">
          <div className="flex items-center gap-2 sm:gap-3">
            {onBack && (
              <button onClick={onBack} className="w-9 h-9 sm:w-10 sm:h-10 bg-white/5 rounded-xl flex items-center justify-center text-white/40 hover:bg-white/10 transition-all">
                ✕
              </button>
            )}
            <div>
              <p className="text-[10px] font-black text-primary uppercase tracking-[0.4em]">Admin</p>
              <h1 className="text-lg sm:text-xl font-black text-white tracking-tighter">Dashboard</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 bg-[#1a1c22] rounded-xl p-1 border border-white/5">
              <button onClick={() => setActiveTab('students')} className="px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-white transition-all">Students</button>
              <button onClick={() => setActiveTab('payments')} className="px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest bg-primary text-white shadow-lg shadow-primary/20">Payments</button>
              <button onClick={() => setActiveTab('support')} className="px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-white transition-all">Support</button>
            </div>
            <button
              onClick={handleRefreshServer}
              disabled={refreshingServer}
              className="flex items-center gap-1.5 px-3 py-2 bg-blue-500/10 text-blue-400 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-blue-500/20 transition-all disabled:opacity-50"
              title="Refresh Server"
            >
              {refreshingServer ? <Loader size={14} className="animate-spin" /> : <Server size={14} />}
              <span className="hidden sm:inline">Refresh</span>
            </button>
            <button
              onClick={handleLogout}
              className="w-9 h-9 sm:w-10 sm:h-10 bg-red-500/10 rounded-xl flex items-center justify-center text-red-400 hover:bg-red-500/20 transition-all"
              title="Logout"
            >
              <LogOut size={16} />
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 overflow-y-auto">
          <AdminPaymentReview adminId={adminId} onClose={() => setActiveTab('students')} />
        </main>
      </div>
    );
  }

  // ── Support Tab ────────────────────────────────────────────────────────────
  if (activeTab === 'support') {
    return (
      <div className="min-h-screen bg-[#0d0f14] flex flex-col safe-top">
        {/* Header */}
        <header className="px-4 sm:px-6 pt-4 sm:pt-6 pb-3 sm:pb-4 flex flex-col sm:flex-row sm:items-center justify-between shrink-0 border-b border-white/5 gap-3">
          <div className="flex items-center gap-2 sm:gap-3">
            {onBack && (
              <button onClick={onBack} className="w-9 h-9 sm:w-10 sm:h-10 bg-white/5 rounded-xl flex items-center justify-center text-white/40 hover:bg-white/10 transition-all">
                ✕
              </button>
            )}
            <div>
              <p className="text-[10px] font-black text-primary uppercase tracking-[0.4em]">Admin</p>
              <h1 className="text-lg sm:text-xl font-black text-white tracking-tighter">Dashboard</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 bg-[#1a1c22] rounded-xl p-1 border border-white/5">
              <button onClick={() => setActiveTab('students')} className="px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-white transition-all">Students</button>
              <button onClick={() => setActiveTab('payments')} className="px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-white transition-all">Payments</button>
              <button onClick={() => setActiveTab('support')} className="px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest bg-primary text-white shadow-lg shadow-primary/20">Support</button>
            </div>
            <button
              onClick={handleRefreshServer}
              disabled={refreshingServer}
              className="flex items-center gap-1.5 px-3 py-2 bg-blue-500/10 text-blue-400 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-blue-500/20 transition-all disabled:opacity-50"
              title="Refresh Server"
            >
              {refreshingServer ? <Loader size={14} className="animate-spin" /> : <Server size={14} />}
              <span className="hidden sm:inline">Refresh</span>
            </button>
            <button
              onClick={handleLogout}
              className="w-9 h-9 sm:w-10 sm:h-10 bg-red-500/10 rounded-xl flex items-center justify-center text-red-400 hover:bg-red-500/20 transition-all"
              title="Logout"
            >
              <LogOut size={16} />
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 overflow-y-auto max-w-3xl mx-auto w-full">
          <AdminSupportPanel adminId={adminId} />
        </main>
      </div>
    );
  }

  // ── Students Tab ──────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#0d0f14] flex flex-col safe-top">
      {/* Header */}
      <header className="px-4 sm:px-6 pt-4 sm:pt-6 pb-3 sm:pb-4 flex flex-col sm:flex-row sm:items-center justify-between shrink-0 border-b border-white/5 gap-3">
        <div className="flex items-center gap-2 sm:gap-3">
          {onBack && (
            <button onClick={onBack} className="w-9 h-9 sm:w-10 sm:h-10 bg-white/5 rounded-xl flex items-center justify-center text-white/40 hover:bg-white/10 transition-all">
              ✕
            </button>
          )}
          <div>
            <p className="text-[10px] font-black text-primary uppercase tracking-[0.4em]">Admin</p>
            <h1 className="text-lg sm:text-xl font-black text-white tracking-tighter">Dashboard</h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-[#1a1c22] rounded-xl p-1 border border-white/5">
            <button onClick={() => setActiveTab('students')} className="px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest bg-primary text-white shadow-lg shadow-primary/20">Students</button>
            <button onClick={() => setActiveTab('payments')} className="px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-white transition-all">Payments</button>
            <button onClick={() => setActiveTab('support')} className="px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-white transition-all">Support</button>
          </div>
          <button
            onClick={handleRefreshServer}
            disabled={refreshingServer}
            className="flex items-center gap-1.5 px-3 py-2 bg-blue-500/10 text-blue-400 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-blue-500/20 transition-all disabled:opacity-50"
            title="Refresh Server"
          >
            {refreshingServer ? <Loader size={14} className="animate-spin" /> : <Server size={14} />}
            <span className="hidden sm:inline">Refresh</span>
          </button>
          <button
            onClick={handleLogout}
            className="w-9 h-9 sm:w-10 sm:h-10 bg-red-500/10 rounded-xl flex items-center justify-center text-red-400 hover:bg-red-500/20 transition-all"
            title="Logout"
          >
            <LogOut size={16} />
          </button>
        </div>
      </header>

      {/* Stats Bar */}
      <div className="px-4 sm:px-6 py-3 sm:py-4 grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3 shrink-0">
        {[
          { label: 'Total', value: students.length, icon: Users, color: 'text-blue-400' },
          { label: 'Active', value: students.filter(s => s.payment_status?.subscription_status === 'active').length, icon: ShieldCheck, color: 'text-emerald-400' },
          { label: 'Trial', value: students.filter(s => s.payment_status?.subscription_status === 'trial').length, icon: Clock, color: 'text-blue-400' },
          { label: 'Overdue', value: students.filter(s => s.payment_status?.subscription_status === 'overdue' || isOverdue(s)).length, icon: AlertCircle, color: 'text-red-400' },
        ].map((stat, i) => (
          <div key={i} className="bg-[#1a1c22] border border-white/5 rounded-xl sm:rounded-2xl p-3 sm:p-4 flex items-center gap-2 sm:gap-3">
            <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-white/5 flex items-center justify-center ${stat.color}`}>
              <stat.icon size={16} className="sm:w-[18px] sm:h-[18px]" />
            </div>
            <div>
              <p className="text-base sm:text-lg font-black text-white leading-none">{stat.value}</p>
              <p className="text-[8px] font-black text-white/30 uppercase tracking-widest mt-0.5 sm:mt-1">{stat.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="px-4 sm:px-6 pb-3 sm:pb-4 flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3 shrink-0">
        <div className="flex-1 relative">
          <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20" />
          <input
            type="text"
            placeholder="Search students..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#1a1c22] border border-white/5 rounded-xl py-3 pl-10 pr-4 text-sm text-white font-bold placeholder:text-white/20 focus:border-primary/50 transition-all outline-none"
          />
        </div>
        <div className="flex items-center gap-2">
          <div className="relative flex-1 sm:flex-none">
            <Filter size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full sm:w-auto bg-[#1a1c22] border border-white/5 rounded-xl py-3 pl-9 pr-8 text-sm text-white font-bold appearance-none focus:border-primary/50 transition-all outline-none cursor-pointer"
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="trial">Trial</option>
              <option value="overdue">Overdue</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
          <button onClick={fetchStudents} className="w-11 h-11 bg-[#1a1c22] border border-white/5 rounded-xl flex items-center justify-center text-white/40 hover:text-white hover:border-primary/50 transition-all shrink-0">
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      {/* Alerts */}
      {successMsg && (
        <div className="mx-4 sm:mx-6 mb-3 sm:mb-4 p-3 sm:p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl sm:rounded-2xl text-emerald-400 text-xs sm:text-sm font-bold flex items-center gap-2 animate-fade-in">
          <CheckCircle size={16} /> {successMsg}
        </div>
      )}
      {error && (
        <div className="mx-4 sm:mx-6 mb-3 sm:mb-4 p-3 sm:p-4 bg-red-500/10 border border-red-500/20 rounded-xl sm:rounded-2xl text-red-400 text-xs sm:text-sm font-bold flex items-center gap-2 animate-fade-in">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {/* Student List */}
      <main className="flex-1 overflow-y-auto px-4 sm:px-6 pb-10 custom-scrollbar">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader className="w-8 h-8 animate-spin text-primary mb-3" />
            <p className="text-white/30 text-[10px] font-black uppercase tracking-widest">Loading students...</p>
          </div>
        ) : filteredStudents.length === 0 ? (
          <div className="text-center py-20 space-y-4 opacity-20">
            <Users size={48} className="mx-auto text-white" />
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-white">No students found</p>
          </div>
        ) : (
          <div className="space-y-3 max-w-3xl mx-auto">
            {filteredStudents.map((student) => {
              const isExpanded = expandedStudent === student.id;
              const status = student.payment_status?.subscription_status || 'trial';
              const overdue = isOverdue(student);
              const displayStatus = overdue && status !== 'overdue' ? 'overdue' : status;

              return (
                <div key={student.id} className={`bg-[#1a1c22] border rounded-xl sm:rounded-2xl overflow-hidden transition-all ${isExpanded ? 'border-primary/30' : 'border-white/5 hover:border-white/10'}`}>
                  {/* Student Row Header */}
                  <button
                    onClick={() => setExpandedStudent(isExpanded ? null : student.id)}
                    className="w-full p-3 sm:p-5 flex items-center gap-3 sm:gap-4 text-left"
                  >
                    <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-white/5 flex items-center justify-center shrink-0">
                      <span className="text-sm font-black text-white/60">{student.full_name?.charAt(0)?.toUpperCase() || student.email?.charAt(0)?.toUpperCase() || '?'}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="text-xs sm:text-sm font-black text-white tracking-tight truncate">{student.full_name || 'Unnamed Student'}</h3>
                        {student.has_proof_submitted && (
                          <span className="hidden sm:inline-flex px-2 py-0.5 bg-amber-500/10 text-amber-400 text-[8px] font-black uppercase tracking-wider rounded-md border border-amber-500/20">Proof</span>
                        )}
                      </div>
                      <p className="text-[10px] text-white/30 mt-0.5 sm:mt-1 truncate">{student.email}</p>
                    </div>
                    <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                      <div className={`flex items-center gap-1 px-2 sm:px-2.5 py-1 rounded-lg border text-[9px] sm:text-[10px] font-black uppercase tracking-wider ${getStatusColor(displayStatus)}`}>
                        {getStatusIcon(displayStatus)}
                        <span className="hidden sm:inline">{displayStatus}</span>
                      </div>
                      {isExpanded ? <ChevronUp size={16} className="text-white/40 sm:w-[18px] sm:h-[18px]" /> : <ChevronDown size={16} className="text-white/40 sm:w-[18px] sm:h-[18px]" />}
                    </div>
                  </button>

                  {/* Expanded Details */}
                  {isExpanded && (
                    <div className="px-3 sm:px-5 pb-3 sm:pb-5 border-t border-white/5 animate-fade-in">
                      <div className="pt-3 sm:pt-4 space-y-4 sm:space-y-5">
                        {/* Accounts Section */}
                        <div className="space-y-2 sm:space-y-3">
                          <p className="text-[10px] font-black text-white/30 uppercase tracking-[0.3em] flex items-center gap-2">
                            <Monitor size={12} /> Accounts
                          </p>

                          {/* Live Accounts */}
                          <div className="bg-dark/50 rounded-xl p-3 sm:p-4 border border-white/5">
                            <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest mb-2 sm:mb-3 flex items-center gap-1.5">
                              <TrendingUp size={10} /> Live Accounts ({student.live_accounts.length})
                            </p>
                            {student.live_accounts.length === 0 ? (
                              <p className="text-[10px] text-white/20 font-bold">No live accounts linked</p>
                            ) : (
                              <div className="space-y-2">
                                {student.live_accounts.map(acct => (
                                  <div key={acct.id} className="flex items-center justify-between bg-white/[0.03] rounded-lg px-3 py-2">
                                    <div className="flex items-center gap-3">
                                      <div className={`w-2 h-2 rounded-full ${acct.is_active ? 'bg-emerald-400' : 'bg-white/10'}`} />
                                      <div>
                                        <p className="text-xs font-bold text-white">{acct.mt5_login}</p>
                                        <p className="text-[8px] text-white/30 font-bold uppercase tracking-wider">{acct.mt5_server}</p>
                                      </div>
                                    </div>
                                    {acct.is_active && <span className="text-[8px] font-black text-emerald-400 uppercase tracking-wider">Active</span>}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* Demo Accounts */}
                          <div className="bg-dark/50 rounded-xl p-3 sm:p-4 border border-white/5">
                            <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-2 sm:mb-3 flex items-center gap-1.5">
                              <Smartphone size={10} /> Demo Accounts ({student.demo_accounts.length})
                            </p>
                            {student.demo_accounts.length === 0 ? (
                              <p className="text-[10px] text-white/20 font-bold">No demo accounts linked</p>
                            ) : (
                              <div className="space-y-2">
                                {student.demo_accounts.map(acct => (
                                  <div key={acct.id} className="flex items-center justify-between bg-white/[0.03] rounded-lg px-3 py-2">
                                    <div className="flex items-center gap-3">
                                      <div className={`w-2 h-2 rounded-full ${acct.is_active ? 'bg-blue-400' : 'bg-white/10'}`} />
                                      <div>
                                        <p className="text-xs font-bold text-white">{acct.mt5_login}</p>
                                        <p className="text-[8px] text-white/30 font-bold uppercase tracking-wider">{acct.mt5_server}</p>
                                      </div>
                                    </div>
                                    {acct.is_active && <span className="text-[8px] font-black text-blue-400 uppercase tracking-wider">Active</span>}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Payment Status Section */}
                        <div className="space-y-2 sm:space-y-3">
                          <p className="text-[10px] font-black text-white/30 uppercase tracking-[0.3em] flex items-center gap-2">
                            <Wallet size={12} /> Payment Status
                          </p>
                          <div className="bg-dark/50 rounded-xl p-3 sm:p-4 border border-white/5">
                            {student.payment_status ? (
                              <div className="space-y-3">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                  <div className={`inline-flex self-start items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[10px] font-black uppercase tracking-wider ${getStatusColor(displayStatus)}`}>
                                    {getStatusIcon(displayStatus)}
                                    {displayStatus}
                                  </div>
                                  {student.payment_status.next_due && (
                                    <p className={`text-[10px] font-bold ${overdue ? 'text-red-400' : 'text-white/40'}`}>
                                      Due: {new Date(student.payment_status.next_due).toLocaleDateString()}
                                    </p>
                                  )}
                                </div>
                                <div className="grid grid-cols-3 gap-2 sm:gap-3">
                                  <div className="bg-white/[0.03] rounded-lg p-2 sm:p-3">
                                    <p className="text-[8px] text-white/20 font-black uppercase tracking-widest">Last Paid</p>
                                    <p className="text-[10px] sm:text-xs font-bold text-white mt-1">
                                      {student.payment_status.last_paid ? new Date(student.payment_status.last_paid).toLocaleDateString() : 'Never'}
                                    </p>
                                  </div>
                                  <div className="bg-white/[0.03] rounded-lg p-2 sm:p-3">
                                    <p className="text-[8px] text-white/20 font-black uppercase tracking-widest">Amount</p>
                                    <p className="text-[10px] sm:text-xs font-bold text-white mt-1">
                                      {student.payment_status.amount_paid ? `$${student.payment_status.amount_paid}` : '-'}
                                    </p>
                                  </div>
                                  <div className="bg-white/[0.03] rounded-lg p-2 sm:p-3">
                                    <p className="text-[8px] text-white/20 font-black uppercase tracking-widest">Currency</p>
                                    <p className="text-[10px] sm:text-xs font-bold text-white mt-1">{student.payment_status.currency || 'USD'}</p>
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <p className="text-[10px] text-white/20 font-bold">No payment record found</p>
                            )}
                          </div>
                        </div>

                        {/* Pending Invoices / Mark as Paid */}
                        {student.pending_invoices.length > 0 && (
                          <div className="space-y-2 sm:space-y-3">
                            <p className="text-[10px] font-black text-white/30 uppercase tracking-[0.3em] flex items-center gap-2">
                              <CreditCard size={12} /> Pending Invoices
                            </p>
                            {student.pending_invoices.map(inv => (
                              <div key={inv.id} className="bg-dark/50 rounded-xl p-3 sm:p-4 border border-white/5 space-y-2 sm:space-y-3">
                                <div className="flex items-center justify-between gap-2">
                                  <div className="min-w-0">
                                    <p className="text-xs font-bold text-white truncate">{inv.invoice_id}</p>
                                    <p className="text-[10px] text-white/30 mt-0.5">{inv.subscription_plan} · ${inv.price_amount} {inv.price_currency}</p>
                                  </div>
                                  <span className={`shrink-0 px-2 py-1 rounded-md text-[8px] font-black uppercase tracking-wider border ${
                                    inv.payment_status === 'proof_submitted'
                                      ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                                      : 'bg-white/5 text-white/40 border-white/10'
                                  }`}>
                                    {inv.payment_status}
                                  </span>
                                </div>

                                {/* Proof of Payment */}
                                {inv.proof_of_payment_url && (
                                  <div className="bg-white/[0.03] rounded-lg p-3 flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                      <Eye size={14} className="text-white/30" />
                                      <span className="text-[10px] font-bold text-white/40">
                                        {inv.proof_of_payment_url.endsWith('.pdf') ? 'PDF Proof' : 'Image Proof'}
                                      </span>
                                    </div>
                                    <button
                                      onClick={() => setPreviewProof(inv)}
                                      className="px-3 py-1.5 bg-white/5 text-white/60 rounded-lg text-[10px] font-black uppercase tracking-wider hover:bg-white/10 transition-all"
                                    >
                                      View
                                    </button>
                                  </div>
                                )}

                                {/* Mark as Paid Button */}
                                <Button
                                  onClick={() => handleMarkAsPaid(student.id)}
                                  disabled={markingPaid === student.id}
                                  className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-700 text-white text-xs sm:text-sm"
                                >
                                  {markingPaid === student.id ? (
                                    <><Loader className="w-4 h-4 animate-spin mr-2" /> Processing...</>
                                  ) : (
                                    <><CheckCircle className="w-4 h-4 mr-2" /> Mark as Paid (+30 Days)</>
                                  )}
                                </Button>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Quick Mark as Paid for overdue / no pending invoices */}
                        {student.pending_invoices.length === 0 && (overdue || status === 'trial' || status === 'cancelled') && (
                          <div className="bg-dark/50 rounded-xl p-3 sm:p-4 border border-white/5">
                            <p className="text-[10px] text-white/30 font-black uppercase tracking-widest mb-2 sm:mb-3">Admin Override</p>
                            <Button
                              onClick={() => handleMarkAsPaid(student.id)}
                              disabled={markingPaid === student.id}
                              className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-700 text-white text-xs sm:text-sm"
                            >
                              {markingPaid === student.id ? (
                                <><Loader className="w-4 h-4 animate-spin mr-2" /> Processing...</>
                              ) : (
                                <><CheckCircle className="w-4 h-4 mr-2" /> Mark as Paid (+30 Days)</>
                              )}
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
};
