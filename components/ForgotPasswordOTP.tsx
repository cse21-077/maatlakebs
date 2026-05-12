import React, { useState } from 'react';
import { Mail, Key, AlertCircle, CheckCircle2, Eye, EyeOff, Clock } from 'lucide-react';
import { Button } from './shared';

interface ForgotPasswordOTPProps {
  onBack: () => void;
  onSuccess?: () => void;
}

type Step = 'email' | 'otp' | 'newpassword' | 'success';

export const ForgotPasswordOTP = ({ onBack, onSuccess }: ForgotPasswordOTPProps) => {
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [otpTimer, setOtpTimer] = useState(0);

  // Step 1: Request OTP
  const handleRequestOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await fetch('/api/auth/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          action: 'request-otp',
          email: email.toLowerCase().trim() 
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Failed to send OTP');
        setLoading(false);
        return;
      }

      setSuccess(data.message || 'OTP sent to your email');
      setStep('otp');
      setOtpTimer(300); // 5 minutes
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Step 2: Verify OTP
  const handleVerifyOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (!otp || otp.length !== 6) {
      setError('Please enter a valid 6-digit OTP');
      setLoading(false);
      return;
    }

    try {
      const response = await fetch('/api/auth/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          action: 'verify-otp',
          email: email.toLowerCase().trim(),
          otp 
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Invalid OTP');
        setLoading(false);
        return;
      }

      setResetToken(data.resetToken);
      setSuccess('OTP verified successfully');
      setStep('newpassword');
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Step 3: Reset Password
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);

    try {
      const response = await fetch('/api/auth/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          action: 'reset-password',
          email: email.toLowerCase().trim(),
          resetToken,
          newPassword 
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Failed to reset password');
        setLoading(false);
        return;
      }

      setSuccess('Password reset successfully');
      setStep('success');
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Timer effect
  React.useEffect(() => {
    if (otpTimer <= 0) return;
    const interval = setInterval(() => setOtpTimer(t => t - 1), 1000);
    return () => clearInterval(interval);
  }, [otpTimer]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="space-y-5 animate-fade-in">
      {error && <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-red-400 text-xs font-medium flex items-start gap-2">
        <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
        <span>{error}</span>
      </div>}
      {success && <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 text-emerald-400 text-xs font-medium flex items-start gap-2">
        <CheckCircle2 size={16} className="flex-shrink-0 mt-0.5" />
        <span>{success}</span>
      </div>}

      {/* Step 1: Email */}
      {step === 'email' && (
        <form onSubmit={handleRequestOTP} className="space-y-4">
          <div className="space-y-2">
            <label className="text-[10px] text-white/40 font-bold uppercase tracking-widest ml-1">Email Address</label>
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20" size={18} />
              <input 
                type="email" 
                required 
                placeholder="name@example.com" 
                value={email} 
                onChange={e => setEmail(e.target.value)}
                className="w-full bg-[#161e31] border border-white/10 rounded-xl py-4 pl-12 pr-5 text-white font-medium focus:border-primary outline-none transition-all" 
              />
            </div>
          </div>
          <div className="pt-2 flex flex-col gap-3">
            <Button loading={loading} type="submit" className="w-full py-4 text-base">
              Send OTP
            </Button>
            <button 
              type="button" 
              onClick={onBack} 
              className="text-[10px] font-bold text-white/40 uppercase tracking-widest hover:text-white transition-all"
            >
              Back to Sign In
            </button>
          </div>
        </form>
      )}

      {/* Step 2: OTP */}
      {step === 'otp' && (
        <form onSubmit={handleVerifyOTP} className="space-y-4">
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 text-blue-400 text-xs font-medium flex items-start gap-2">
            <Clock size={16} className="flex-shrink-0 mt-0.5" />
            <span>OTP expires in {formatTime(otpTimer)}</span>
          </div>
          
          <div className="space-y-2">
            <label className="text-[10px] text-white/40 font-bold uppercase tracking-widest ml-1">Enter 6-Digit OTP</label>
            <input 
              type="text" 
              required 
              placeholder="000000" 
              maxLength={6}
              value={otp} 
              onChange={e => setOtp(e.target.value.replace(/\D/g, ''))}
              className="w-full bg-[#161e31] border border-white/10 rounded-xl py-4 px-5 text-white font-medium text-center text-2xl tracking-widest focus:border-primary outline-none transition-all" 
            />
          </div>

          <div className="text-center text-xs text-white/40">
            Check your email for the OTP code
          </div>

          <div className="pt-2 flex flex-col gap-3">
            <Button loading={loading} type="submit" className="w-full py-4 text-base">
              Verify OTP
            </Button>
            <button 
              type="button" 
              onClick={() => {
                setStep('email');
                setOtp('');
                setError('');
              }} 
              className="text-[10px] font-bold text-white/40 uppercase tracking-widest hover:text-white transition-all"
            >
              Back
            </button>
          </div>
        </form>
      )}

      {/* Step 3: New Password */}
      {step === 'newpassword' && (
        <form onSubmit={handleResetPassword} className="space-y-4">
          <div className="space-y-2">
            <label className="text-[10px] text-white/40 font-bold uppercase tracking-widest ml-1">New Password</label>
            <div className="relative">
              <Key className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20" size={18} />
              <input 
                type={showPassword ? 'text' : 'password'} 
                required 
                placeholder="Min. 8 characters" 
                value={newPassword} 
                onChange={e => setNewPassword(e.target.value)}
                className="w-full bg-[#161e31] border border-white/10 rounded-xl py-4 pl-12 pr-12 text-white font-medium focus:border-primary outline-none transition-all" 
              />
              <button 
                type="button" 
                onClick={() => setShowPassword(!showPassword)} 
                className="absolute right-4 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-all"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] text-white/40 font-bold uppercase tracking-widest ml-1">Confirm Password</label>
            <div className="relative">
              <Key className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20" size={18} />
              <input 
                type={showConfirm ? 'text' : 'password'} 
                required 
                placeholder="Confirm password" 
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

          <div className="pt-2 flex flex-col gap-3">
            <Button loading={loading} type="submit" className="w-full py-4 text-base">
              Reset Password
            </Button>
            <button 
              type="button" 
              onClick={() => {
                setStep('otp');
                setNewPassword('');
                setConfirmPassword('');
                setError('');
              }} 
              className="text-[10px] font-bold text-white/40 uppercase tracking-widest hover:text-white transition-all"
            >
              Back
            </button>
          </div>
        </form>
      )}

      {/* Step 4: Success */}
      {step === 'success' && (
        <div className="space-y-4 text-center">
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 bg-emerald-500/10 rounded-full flex items-center justify-center animate-pulse">
              <CheckCircle2 size={32} className="text-emerald-400" />
            </div>
          </div>
          <div className="space-y-2">
            <h3 className="text-white font-bold text-lg">Password Reset Successful!</h3>
            <p className="text-white/60 text-sm">Your password has been changed. Please login with your new password.</p>
          </div>
          <button 
            onClick={onBack}
            className="text-[10px] font-bold text-primary uppercase tracking-widest hover:text-primary/80 transition-all"
          >
            Back to Sign In
          </button>
        </div>
      )}
    </div>
  );
};
