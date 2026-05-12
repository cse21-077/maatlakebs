import React, { useState } from 'react';
import { Key, AlertCircle, CheckCircle2, Eye, EyeOff, Lock } from 'lucide-react';
import { Button, Card } from './shared';

interface ChangePasswordProps {
  sessionToken: string;
  onClose?: () => void;
}

export const ChangePassword = ({ sessionToken, onClose }: ChangePasswordProps) => {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showForm, setShowForm] = useState(true);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    // Validation
    if (!currentPassword) {
      setError('Current password is required');
      return;
    }

    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('New passwords do not match');
      return;
    }

    if (currentPassword === newPassword) {
      setError('New password must be different from current password');
      return;
    }

    setLoading(true);

    try {
      const response = await fetch('/api/auth/password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({ 
          action: 'change-password',
          currentPassword,
          newPassword 
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Failed to change password');
        setLoading(false);
        return;
      }

      setSuccess('Password changed successfully!');
      setShowForm(false);
      
      // Reset form
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');

      // Auto-close after 3 seconds
      setTimeout(() => {
        if (onClose) onClose();
      }, 3000);
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (!showForm) {
    return (
      <Card className="text-center space-y-4">
        <div className="flex justify-center mb-4">
          <div className="w-16 h-16 bg-emerald-500/10 rounded-full flex items-center justify-center animate-pulse">
            <CheckCircle2 size={32} className="text-emerald-400" />
          </div>
        </div>
        <div className="space-y-2">
          <h3 className="text-white font-bold text-lg">Success!</h3>
          <p className="text-white/60 text-sm">{success}</p>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="text-xs font-bold text-white/40 uppercase tracking-widest hover:text-white transition-all"
          >
            Close
          </button>
        )}
      </Card>
    );
  }

  return (
    <Card className="space-y-5">
      <div className="flex items-center gap-3 pb-4 border-b border-white/10">
        <div className="w-10 h-10 bg-primary/20 rounded-lg flex items-center justify-center">
          <Lock size={20} className="text-primary" />
        </div>
        <h2 className="text-white font-bold">Change Password</h2>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-red-400 text-xs font-medium flex items-start gap-2">
          <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleChangePassword} className="space-y-4">
        {/* Current Password */}
        <div className="space-y-2">
          <label className="text-[10px] text-white/40 font-bold uppercase tracking-widest ml-1">
            Current Password
          </label>
          <div className="relative">
            <Key className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20" size={18} />
            <input
              type={showCurrent ? 'text' : 'password'}
              required
              placeholder="Enter your current password"
              value={currentPassword}
              onChange={e => setCurrentPassword(e.target.value)}
              className="w-full bg-[#161e31] border border-white/10 rounded-xl py-4 pl-12 pr-12 text-white font-medium focus:border-primary outline-none transition-all"
            />
            <button
              type="button"
              onClick={() => setShowCurrent(!showCurrent)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-all"
            >
              {showCurrent ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>

        {/* New Password */}
        <div className="space-y-2">
          <label className="text-[10px] text-white/40 font-bold uppercase tracking-widest ml-1">
            New Password
          </label>
          <div className="relative">
            <Key className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20" size={18} />
            <input
              type={showNew ? 'text' : 'password'}
              required
              placeholder="Min. 8 characters"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              className="w-full bg-[#161e31] border border-white/10 rounded-xl py-4 pl-12 pr-12 text-white font-medium focus:border-primary outline-none transition-all"
            />
            <button
              type="button"
              onClick={() => setShowNew(!showNew)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-all"
            >
              {showNew ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>

        {/* Confirm Password */}
        <div className="space-y-2">
          <label className="text-[10px] text-white/40 font-bold uppercase tracking-widest ml-1">
            Confirm New Password
          </label>
          <div className="relative">
            <Key className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20" size={18} />
            <input
              type={showConfirm ? 'text' : 'password'}
              required
              placeholder="Confirm new password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              className="w-full bg-[#161e31] border border-white/10 rounded-xl py-4 pl-12 pr-12 text-white font-medium focus:border-primary outline-none transition-all"
            />
            <button
              type="button"
              onClick={() => setShowConfirm(!showConfirm)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-all"
            >
              {showConfirm ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>

        {/* Buttons */}
        <div className="pt-2 flex gap-3">
          <Button
            loading={loading}
            type="submit"
            className="flex-1 py-4 text-base"
          >
            Change Password
          </Button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-[#161e31] border border-white/10 rounded-xl py-4 text-white font-semibold hover:bg-white/5 transition-all"
            >
              Cancel
            </button>
          )}
        </div>
      </form>

      <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 text-blue-400 text-xs">
        <p className="font-medium">Security Note:</p>
        <p className="text-blue-400/80 mt-1">Use a strong password with at least 8 characters, including uppercase, lowercase, numbers, and symbols.</p>
      </div>
    </Card>
  );
};
