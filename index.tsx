import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import {
  ShieldCheck,
  TrendingUp,
  Settings,
  LayoutDashboard,
  ChevronRight,
  Activity,
  AlertCircle,
  Smartphone,
  CheckCircle2,
  Lock,
  User,
  Zap,
  RefreshCw,
  LogOut as LogOutIcon,
  ShieldAlert,
  Globe,
  CreditCard,
  UploadCloud,
  Clock,
  ExternalLink,
  CheckCircle
} from 'lucide-react';

// --- Types & Constants ---
type View = 'LANDING' | 'SPLASH' | 'AUTH' | 'ONBOARDING' | 'APP';
type AppTab = 'DASHBOARD' | 'SETTINGS' | 'PAYMENT';
type PaymentStatus = 'UNPAID' | 'PENDING' | 'CONFIRMED';

const PRIMARY_COLOR = '#2138bc';
const SECONDARY_COLOR = '#133284';

// --- Components ---

const Button = ({ children, onClick, variant = 'primary', className = '', loading = false, disabled = false }: any) => {
  const variants = {
    primary: `bg-gradient-to-r from-primary to-secondary text-white shadow-lg shadow-primary/20`,
    outline: `border border-white/20 text-white hover:bg-white/5`,
    ghost: `text-white/70 hover:text-white`,
    danger: `bg-red-500/10 text-red-500 border border-red-500/20`
  };

  const isDisabled = loading || disabled;

  return (
    <button
      onClick={onClick}
      disabled={isDisabled}
      className={`px-6 py-3 rounded-xl font-semibold transition-all active:scale-95 flex items-center justify-center gap-2 ${variants[variant as keyof typeof variants]} ${className} ${isDisabled ? 'opacity-50 cursor-not-allowed grayscale' : ''}`}
    >
      {loading ? (
        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
      ) : children}
    </button>
  );
};

const Card = ({ children, className = '' }: any) => (
  <div className={`glass rounded-2xl p-5 ${className}`}>
    {children}
  </div>
);

const LandingPage = ({ onLaunch }: { onLaunch: () => void }) => {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstallPrompt, setShowInstallPrompt] = useState(false);

  useEffect(() => {
    const handler = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowInstallPrompt(true);
    };

    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) {
      onLaunch();
      return;
    }

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;

    if (outcome === 'accepted') {
      console.log('PWA installed');
    }

    setDeferredPrompt(null);
    setShowInstallPrompt(false);
  };

  return (
    <div className="min-h-screen bg-dark flex flex-col animate-fade-in overflow-x-hidden">
      <nav className="p-6 flex justify-between items-center max-w-7xl mx-auto w-full">
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="Maatla Kebs Logo" className="w-12 h-12 object-contain" />
          <span className="text-xl font-bold tracking-tight">Maatla Kebs</span>
        </div>
        <Button onClick={handleInstallClick} variant="outline" className="hidden md:flex">
          {showInstallPrompt ? 'Install App' : 'Launch App'}
        </Button>
      </nav>

      <main className="flex-1 flex flex-col items-center justify-center px-6 text-center max-w-4xl mx-auto relative">
        <div className="absolute top-0 -left-20 w-72 h-72 bg-primary/20 blur-[120px] rounded-full -z-10 animate-pulse-slow" />
        <div className="absolute bottom-0 -right-20 w-72 h-72 bg-secondary/20 blur-[120px] rounded-full -z-10" />

        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass text-sm font-medium text-accent mb-8 animate-slide-up">
          <Zap size={16} /> Premium Copy Trading PWA
        </div>

        <h1 className="text-5xl md:text-7xl font-bold mb-6 gradient-text animate-slide-up leading-tight">
          Master the Markets with Maatla Kebs
        </h1>

        <p className="text-lg md:text-xl text-white/60 mb-10 max-w-2xl animate-slide-up [animation-delay:100ms]">
          Experience high-performance synthetic index trading with zero custody. Secure, elegant, and designed for your mobile lifestyle.
        </p>

        <div className="flex flex-col md:flex-row gap-4 w-full md:w-auto animate-slide-up [animation-delay:200ms]">
          <Button onClick={handleInstallClick} className="w-full md:w-auto text-lg px-10 py-4 relative overflow-hidden group">
            {showInstallPrompt ? (
              <>
                <Smartphone size={20} className="group-hover:scale-110 transition-transform" />
                Install PWA
                <div className="absolute inset-0 bg-white/10 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
              </>
            ) : (
              <>
                Launch Dashboard <ChevronRight size={20} />
              </>
            )}
          </Button>
          {showInstallPrompt && (
            <div className="flex items-center gap-2 px-4 py-2 bg-green-500/10 border border-green-500/20 rounded-xl text-green-400 text-sm animate-fade-in">
              <CheckCircle2 size={16} />
              <span className="font-medium">Ready to install!</span>
            </div>
          )}
        </div>

        <div className="mt-20 grid grid-cols-1 md:grid-cols-3 gap-6 w-full animate-slide-up [animation-delay:300ms]">
          {[
            { icon: ShieldCheck, title: "Zero Custody", desc: "You keep control. We only copy trades." },
            { icon: Zap, title: "Real-time Sync", desc: "Milliseconds latency on trade execution." },
            { icon: Smartphone, title: "PWA Native", desc: "Install once, trade anywhere, anytime." }
          ].map((feat, i) => (
            <Card key={i} className="text-left border-white/5 bg-white/5">
              <feat.icon className="text-primary mb-4" size={32} />
              <h3 className="text-lg font-bold mb-2">{feat.title}</h3>
              <p className="text-white/50 text-sm leading-relaxed">{feat.desc}</p>
            </Card>
          ))}
        </div>
      </main>

      <footer className="p-8 text-center text-white/30 text-sm">
        &copy; 2024 Maatla Kebs | Developed by Topo Rapula
      </footer>
    </div>
  );
};

const SplashScreen = ({ onFinish }: { onFinish: () => void }) => {
  useEffect(() => {
    const timer = setTimeout(onFinish, 2500);
    return () => clearTimeout(timer);
  }, [onFinish]);

  return (
    <div className="fixed inset-0 bg-dark z-[100] flex flex-col items-center justify-center p-8 overflow-hidden">
      <div className="relative">
        <div className="w-32 h-32 rounded-3xl flex items-center justify-center animate-pulse relative z-10 bg-gradient-to-br from-primary to-secondary p-2">
          <img src="/logo.png" alt="Maatla Kebs" className="w-full h-full object-contain" />
        </div>
        <div className="absolute inset-0 bg-primary/40 blur-2xl animate-pulse scale-150" />
      </div>

      <div className="mt-8 text-center animate-fade-in [animation-delay:500ms]">
        <h2 className="text-2xl font-bold tracking-widest uppercase">Maatla Kebs</h2>
        <p className="text-white/40 text-sm mt-2 tracking-widest">PREMIUM COPY TRADER</p>
      </div>

      <div className="mt-24 space-y-4 w-48 text-center animate-fade-in [animation-delay:1000ms]">
        <div className="h-1 bg-white/10 rounded-full overflow-hidden">
          <div className="h-full bg-primary w-full animate-[loading_2s_ease-in-out_infinite]" />
        </div>
      </div>

      <div className="absolute bottom-12 text-white/40 text-xs font-medium tracking-widest animate-fade-in [animation-delay:1500ms]">
        BY TOPO RAPULA
      </div>

      <style>{`
        @keyframes loading {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
      `}</style>
    </div>
  );
};

const AuthScreen = ({ onLogin }: { onLogin: () => void }) => {
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      onLogin();
    }, 1500);
  };

  return (
    <div className="min-h-screen bg-dark p-6 flex flex-col justify-center animate-fade-in">
      <div className="max-w-md mx-auto w-full">
        <h2 className="text-3xl font-bold mb-2 text-white">Welcome Back</h2>
        <p className="text-white/50 mb-8">Login to manage your trading preferences.</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm text-white/60 ml-1 font-medium">Email Address</label>
            <div className="relative">
              <User className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30" size={20} />
              <input
                type="email"
                required
                className="w-full bg-white/5 border border-white/10 rounded-xl py-4 pl-12 pr-4 text-white focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
                placeholder="name@example.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm text-white/60 ml-1 font-medium">Password</label>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30" size={20} />
              <input
                type="password"
                required
                className="w-full bg-white/5 border border-white/10 rounded-xl py-4 pl-12 pr-4 text-white focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
              />
            </div>
          </div>

          <button type="button" className="text-primary text-sm font-medium hover:underline block ml-auto">
            Forgot password?
          </button>

          <Button loading={loading} className="w-full py-4 text-lg mt-4">
            Sign In
          </Button>
        </form>

        <div className="mt-12 text-center">
          <p className="text-white/40 text-sm">Don't have an account?</p>
          <button className="text-white font-medium mt-2 hover:underline">Contact your mentor to join</button>
        </div>
      </div>
    </div>
  );
};

const OnboardingScreen = ({ onComplete }: { onComplete: () => void }) => {
  const [step, setStep] = useState(0);
  const [mt5, setMt5] = useState({ login: '', server: '', password: '' });
  const [serverError, setServerError] = useState('');

  const validateWeltrade = (server: string) => {
    const weltradeServers = [
      'Weltrade-Live',
      'Weltrade-Demo',
      'WeltradeLive',
      'WeltradeDemo',
      'Weltrade-Server',
      'WeltradeServer'
    ];
    
    const isValid = weltradeServers.some(s => 
      server.toLowerCase().includes(s.toLowerCase())
    );
    
    if (server && !isValid) {
      setServerError('⚠️ Only Weltrade broker accounts are supported');
      return false;
    }
    setServerError('');
    return true;
  };

  const steps = [
    {
      title: "Risk Disclaimer",
      content: (
        <div className="space-y-4">
          <div className="bg-yellow-500/10 border border-yellow-500/20 p-4 rounded-xl flex gap-3">
            <AlertCircle className="text-yellow-500 shrink-0" />
            <p className="text-sm text-yellow-200/80">
              Trading synthetic indices involves significant risk of loss and is not suitable for all investors. Past performance is not indicative of future results.
            </p>
          </div>
          <div className="space-y-4 pt-4">
            <p className="text-white/70 font-medium">I understand that:</p>
            {[
              "The PWA only copies trades to my Weltrade MT5 account.",
              "I am responsible for my own risk management settings.",
              "Maatla Kebs is not a financial advisor."
            ].map((text, i) => (
              <div key={i} className="flex gap-3 items-center">
                <CheckCircle2 className="text-primary shrink-0" size={20} />
                <span className="text-sm text-white/80">{text}</span>
              </div>
            ))}
          </div>
        </div>
      )
    },
    {
      title: "Weltrade MT5 Account",
      content: (
        <div className="space-y-4">
          <div className="bg-primary/10 border border-primary/20 rounded-xl p-4 mb-4">
            <div className="flex items-start gap-3">
              <ShieldCheck className="text-primary shrink-0 mt-0.5" size={20} />
              <div>
                <p className="text-sm font-bold text-white mb-1">Weltrade Accounts Only</p>
                <p className="text-xs text-white/60">Our copy trading service exclusively supports Weltrade broker accounts for optimal performance and reliability.</p>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm text-white/60 ml-1 font-medium">MT5 Login ID</label>
            <input 
              className="w-full bg-white/5 border border-white/10 rounded-xl py-4 px-4 text-white focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all" 
              placeholder="e.g., 12345678" 
              type="number"
              value={mt5.login}
              onChange={e => setMt5({...mt5, login: e.target.value})}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm text-white/60 ml-1 font-medium">MT5 Server</label>
            <input 
              className={`w-full bg-white/5 border ${serverError ? 'border-red-500/50 focus:border-red-500' : 'border-white/10 focus:border-primary'} rounded-xl py-4 px-4 text-white focus:ring-2 focus:ring-primary/20 outline-none transition-all`}
              placeholder="Weltrade-Live or Weltrade-Demo" 
              value={mt5.server}
              onChange={e => {
                setMt5({...mt5, server: e.target.value});
                validateWeltrade(e.target.value);
              }}
              onBlur={e => validateWeltrade(e.target.value)}
            />
            {serverError && (
              <p className="text-xs text-red-400 ml-1 flex items-center gap-1 animate-fade-in">
                <AlertCircle size={12} />
                {serverError}
              </p>
            )}
            {mt5.server && !serverError && (
              <p className="text-xs text-green-400 ml-1 flex items-center gap-1 animate-fade-in">
                <CheckCircle size={12} />
                ✓ Weltrade server verified
              </p>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-sm text-white/60 ml-1 font-medium">Investor / Trading Password</label>
            <input 
              type="password"
              className="w-full bg-white/5 border border-white/10 rounded-xl py-4 px-4 text-white focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all" 
              placeholder="••••••••" 
              value={mt5.password}
              onChange={e => setMt5({...mt5, password: e.target.value})}
            />
          </div>
          
          <div className="bg-white/5 rounded-xl p-3 mt-4">
            <p className="text-xs text-white/40 text-center">
              🔒 Credentials are encrypted end-to-end and stored securely
            </p>
          </div>
        </div>
      )
    }
  ];

  const handleNext = () => {
    if (step === 0) {
      setStep(1);
    } else {
      if (!validateWeltrade(mt5.server)) {
        return;
      }
      if (!mt5.login || !mt5.server || !mt5.password) {
        alert('Please fill in all fields');
        return;
      }
      localStorage.setItem('mt5_login', mt5.login);
      localStorage.setItem('mt5_server', mt5.server);
      onComplete();
    }
  };

  return (
    <div className="min-h-screen bg-dark p-6 flex flex-col justify-center animate-fade-in">
      <div className="max-w-md mx-auto w-full">
        <div className="flex gap-2 mb-8">
          {[0, 1].map(i => (
            <div key={i} className={`h-1 flex-1 rounded-full transition-all duration-500 ${i <= step ? 'bg-primary' : 'bg-white/10'}`} />
          ))}
        </div>

        <h2 className="text-3xl font-bold mb-6 text-white">{steps[step].title}</h2>
        <div className="mb-10">{steps[step].content}</div>

        <Button
          className="w-full"
          onClick={handleNext}
          disabled={step === 1 && !!serverError}
        >
          {step === 0 ? 'Accept & Continue' : 'Activate Trading'}
        </Button>
      </div>
    </div>
  );
};

const MainApp = ({ onDisconnect }: { onDisconnect: () => void }) => {
  const [activeTab, setActiveTab] = useState<AppTab>('DASHBOARD');
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>(
    (localStorage.getItem('payment_status') as PaymentStatus) || 'UNPAID'
  );
  const [isUploading, setIsUploading] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string>('');
  const [aggressiveness, setAggressiveness] = useState(1.0);
  const [maxLot, setMaxLot] = useState(0.5);
  const [maxDD, setMaxDD] = useState(20);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const mt5Login = localStorage.getItem('mt5_login') || '8372641';
  const mt5Server = localStorage.getItem('mt5_server') || 'Weltrade-Live';

  const handleDisconnect = () => {
    if (confirm("Are you sure you want to disconnect? This will pause all copy trading immediately.")) {
      localStorage.removeItem('onboarded');
      localStorage.removeItem('mt5_login');
      localStorage.removeItem('mt5_server');
      localStorage.removeItem('payment_status');
      localStorage.removeItem('uploaded_file');
      onDisconnect();
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf'];
    if (!validTypes.includes(file.type)) {
      alert('Please upload a valid image (JPG, PNG, WEBP) or PDF file');
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      alert('File size must be less than 5MB');
      return;
    }

    setUploadedFile(file);

    // Create preview for images
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setFilePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    } else {
      setFilePreview(''); // PDF doesn't need preview
    }
  };

  const handlePopUpload = () => {
    if (!uploadedFile) {
      fileInputRef.current?.click();
      return;
    }

    setIsUploading(true);
    // Simulate upload with realistic delay
    setTimeout(() => {
      setIsUploading(false);
      setPaymentStatus('PENDING');
      localStorage.setItem('payment_status', 'PENDING');
      localStorage.setItem('uploaded_file', uploadedFile.name);
      
      // Show success message
      const fileType = uploadedFile.type.startsWith('image/') ? 'Image' : 'PDF';
      alert(`✅ ${fileType} uploaded successfully!\n\nFile: ${uploadedFile.name}\nSize: ${(uploadedFile.size / 1024).toFixed(2)} KB\n\nSystem auto-confirmation in progress. Final mentor activation usually takes 1-2 hours.`);
    }, 2000);
  };

  // Mock a confirm from mentor after some time (for demo)
  useEffect(() => {
    if (paymentStatus === 'PENDING') {
      const timer = setTimeout(() => {
        setPaymentStatus('CONFIRMED');
        localStorage.setItem('payment_status', 'CONFIRMED');
      }, 15000); // 15 seconds for demo activation
      return () => clearTimeout(timer);
    }
  }, [paymentStatus]);

  return (
    <div className="min-h-screen bg-dark flex flex-col pb-24">
      {/* Header */}
      <header className="p-6 sticky top-0 z-50 bg-dark/80 backdrop-blur-md flex justify-between items-center border-b border-white/5">
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="Maatla Kebs" className="w-10 h-10 object-contain" />
          <span className="font-bold text-white">Maatla Kebs</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-green-500/10 px-3 py-1 rounded-full border border-green-500/20">
            <div className={`w-1.5 h-1.5 rounded-full ${paymentStatus === 'CONFIRMED' ? 'bg-green-500 animate-pulse' : 'bg-yellow-500'}`} />
            <span className={`text-[10px] font-bold ${paymentStatus === 'CONFIRMED' ? 'text-green-500' : 'text-yellow-500'} uppercase tracking-widest`}>
              {paymentStatus === 'CONFIRMED' ? 'Live' : 'Standby'}
            </span>
          </div>
          <button onClick={() => location.reload()} className="text-white/40 hover:text-white transition-colors">
            <RefreshCw size={18} />
          </button>
        </div>
      </header>

      {/* Content Area */}
      <main className="flex-1 overflow-y-auto hide-scrollbar p-5 space-y-6">
        {activeTab === 'DASHBOARD' && (
          <div className="animate-slide-up space-y-6">
            {/* Status Card - Context Sensitive */}
            <Card className={`bg-gradient-to-br border-primary/20 p-8 ${paymentStatus === 'CONFIRMED' ? 'from-primary/30 to-secondary/30' : 'from-yellow-500/10 to-orange-500/10'}`}>
              <div className="flex flex-col items-center text-center space-y-4">
                <div className="w-20 h-20 bg-primary/20 rounded-full flex items-center justify-center border border-primary/30 relative p-3">
                  <img src="/logo.png" alt="Maatla Kebs" className={`w-full h-full object-contain ${paymentStatus === 'CONFIRMED' ? 'animate-pulse' : ''}`} />
                  <div className={`absolute top-0 right-0 w-5 h-5 rounded-full border-4 border-dark ${paymentStatus === 'CONFIRMED' ? 'bg-green-500 animate-pulse' : 'bg-yellow-500'}`} />
                </div>
                <div>
                  <p className="text-white/40 text-xs uppercase tracking-[0.2em] font-black">System Protocol</p>
                  <h3 className="text-3xl font-black text-white mt-1">
                    {paymentStatus === 'CONFIRMED' ? 'SYSTEM ACTIVE' : 'PENDING ACTIVATION'}
                  </h3>
                  <div className="flex items-center justify-center gap-2 mt-2 bg-white/5 px-4 py-1.5 rounded-full">
                    {paymentStatus === 'CONFIRMED' ? (
                      <>
                        <ShieldCheck size={14} className="text-green-500" />
                        <span className="text-[10px] font-bold text-white/60 tracking-wider">Trading Node Verified & Synced</span>
                      </>
                    ) : (
                      <>
                        <Clock size={14} className="text-yellow-500" />
                        <span className="text-[10px] font-bold text-white/60 tracking-wider">Waiting for Mentor Activation</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </Card>

            {paymentStatus !== 'CONFIRMED' && (
              <Card className="bg-primary/5 border-primary/10">
                <div className="flex gap-4 items-start">
                  <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary shrink-0">
                    <AlertCircle size={20} />
                  </div>
                  <div className="space-y-2">
                    <h4 className="font-bold text-white text-sm">Next Step: Payment</h4>
                    <p className="text-xs text-white/50 leading-relaxed">
                      To activate copy trading, please visit the Payment tab and upload your Proof of Payment.
                    </p>
                    <Button variant="outline" className="text-xs py-2 px-4 h-auto" onClick={() => setActiveTab('PAYMENT')}>
                      Go to Payment
                    </Button>
                  </div>
                </div>
              </Card>
            )}

            {/* Connection Info */}
            <div className="space-y-4">
              <h4 className="text-sm font-bold text-white/40 uppercase tracking-widest ml-1">Terminal Connection</h4>
              <Card className="border-primary/20">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                      <Smartphone size={24} />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-white">Infrastructure Linked</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <div className={`w-1.5 h-1.5 rounded-full ${paymentStatus === 'CONFIRMED' ? 'bg-green-500' : 'bg-yellow-500'}`} />
                        <span className="text-[10px] text-white/40 uppercase tracking-widest font-bold">
                          {paymentStatus === 'CONFIRMED' ? 'Trading Terminal Connected' : 'Connection Standby'}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-white/40 uppercase font-bold">MT5 ID</p>
                    <p className="font-bold text-white tracking-wider">{mt5Login}</p>
                  </div>
                </div>

                <div className="space-y-3 pt-4 border-t border-white/5">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-white/40">Remote Host</span>
                    <span className="text-white font-medium">{mt5Server}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-white/40">Status</span>
                    <span className={`${paymentStatus === 'CONFIRMED' ? 'text-green-500' : 'text-yellow-500'} font-bold`}>
                      {paymentStatus === 'CONFIRMED' ? 'Active & Copying' : 'Awaiting Subscription'}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 mt-6">
                  <Button
                    variant="danger"
                    className="w-full text-sm font-bold"
                    onClick={handleDisconnect}
                  >
                    <LogOutIcon size={18} /> Disconnect & Swap Account
                  </Button>
                </div>
              </Card>
            </div>

            {/* Account Health Meter */}
            <div className="grid grid-cols-1 gap-4">
              <h4 className="text-sm font-bold text-white/40 uppercase tracking-widest ml-1">Account Oversight</h4>
              <Card className="flex items-center gap-4 border-white/5">
                <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center text-accent">
                  <Activity />
                </div>
                <div className="flex-1">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-sm font-medium text-white">System Integrity</span>
                    <span className="text-xs text-accent font-bold">{paymentStatus === 'CONFIRMED' ? 'Optimal' : 'Standby'}</span>
                  </div>
                  <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
                    <div className={`h-full bg-accent rounded-full shadow-[0_0_8px_rgba(79,172,254,0.5)] transition-all duration-1000`} style={{ width: paymentStatus === 'CONFIRMED' ? '100%' : '20%' }} />
                  </div>
                </div>
              </Card>
            </div>
          </div>
        )}

        {activeTab === 'SETTINGS' && (
          <div className="animate-slide-up space-y-6">
            <h2 className="text-2xl font-bold px-1 text-white">Risk Parameters</h2>

            <Card className="space-y-6 border-primary/20">
              <div className="space-y-3">
                <div className="flex justify-between">
                  <label className="text-sm font-medium text-white">Aggressiveness</label>
                  <span className="text-primary font-bold">{aggressiveness}x</span>
                </div>
                <input
                  type="range"
                  min="0.1"
                  max="2.0"
                  step="0.1"
                  value={aggressiveness}
                  onChange={(e) => setAggressiveness(parseFloat(e.target.value))}
                  className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-primary"
                />
                <div className="flex justify-between text-[10px] text-white/40 uppercase tracking-widest font-bold">
                  <span>Conservative</span>
                  <span>Hyper</span>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex justify-between">
                  <label className="text-sm font-medium text-white">Max Allocation (Lot)</label>
                  <span className="text-white font-bold">{maxLot}</span>
                </div>
                <input
                  type="range"
                  min="0.1"
                  max="5.0"
                  step="0.1"
                  value={maxLot}
                  onChange={(e) => setMaxLot(parseFloat(e.target.value))}
                  className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-primary"
                />
              </div>

              <div className="space-y-3">
                <div className="flex justify-between">
                  <label className="text-sm font-medium text-white">Hard Drawdown Limit</label>
                  <span className="text-red-400 font-bold">{maxDD}%</span>
                </div>
                <input
                  type="range"
                  min="5"
                  max="50"
                  step="5"
                  value={maxDD}
                  onChange={(e) => setMaxDD(parseInt(e.target.value))}
                  className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-primary"
                />
                <p className="text-[10px] text-white/30 italic">Emergency circuit-break will trigger at this percentage.</p>
              </div>

              <Button className="w-full" onClick={() => alert('Risk Configuration Updated')}>Save Changes</Button>
            </Card>

            <div className="bg-red-500/5 border border-red-500/10 rounded-2xl p-6 flex gap-4 items-start">
              <ShieldAlert className="text-red-500 shrink-0" size={24} />
              <div>
                <h4 className="font-bold text-white mb-1">Risk Warning</h4>
                <p className="text-xs text-white/40 leading-relaxed">
                  Modifying risk parameters during active sessions will only affect subsequent trade entries. Active positions remain under initial risk protocols.
                </p>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'PAYMENT' && (
          <div className="animate-slide-up space-y-6">
            <h2 className="text-2xl font-bold px-1 text-white">Subscription</h2>

            {/* Status Timeline */}
            <Card className="border-white/5 space-y-8">
              <div className="relative">
                <div className="absolute left-[19px] top-0 bottom-0 w-0.5 bg-white/5" />

                <div className="space-y-10 relative">
                  <div className="flex gap-4 items-center">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center z-10 ${paymentStatus !== 'UNPAID' ? 'bg-green-500 text-white' : 'bg-primary text-white'}`}>
                      {paymentStatus !== 'UNPAID' ? <CheckCircle size={20} /> : <CreditCard size={20} />}
                    </div>
                    <div>
                      <p className={`font-bold text-sm ${paymentStatus !== 'UNPAID' ? 'text-green-500' : 'text-white'}`}>Submit Proof of Payment</p>
                      <p className="text-xs text-white/40">Upload your receipt for verification</p>
                    </div>
                  </div>

                  <div className="flex gap-4 items-center">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center z-10 ${paymentStatus === 'CONFIRMED' ? 'bg-green-500 text-white' : (paymentStatus === 'PENDING' ? 'bg-primary text-white animate-pulse' : 'bg-white/5 text-white/20')}`}>
                      {paymentStatus === 'CONFIRMED' ? <CheckCircle size={20} /> : <Zap size={20} />}
                    </div>
                    <div>
                      <p className={`font-bold text-sm ${paymentStatus === 'CONFIRMED' ? 'text-green-500' : (paymentStatus === 'PENDING' ? 'text-primary' : 'text-white/20')}`}>System Auto-Confirmation</p>
                      <p className="text-xs text-white/40">AI-powered receipt validation</p>
                    </div>
                  </div>

                  <div className="flex gap-4 items-center">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center z-10 ${paymentStatus === 'CONFIRMED' ? 'bg-green-500 text-white shadow-[0_0_15px_rgba(34,197,94,0.4)]' : 'bg-white/5 text-white/20'}`}>
                      {paymentStatus === 'CONFIRMED' ? <CheckCircle size={20} /> : <ShieldCheck size={20} />}
                    </div>
                    <div>
                      <p className={`font-bold text-sm ${paymentStatus === 'CONFIRMED' ? 'text-green-500' : 'text-white/20'}`}>Mentor Activation</p>
                      <p className="text-xs text-white/40">Manual audit & live trading sync</p>
                    </div>
                  </div>
                </div>
              </div>

              {paymentStatus === 'UNPAID' && (
                <div className="pt-4 space-y-4">
                  <div className="bg-white/5 rounded-xl p-4 border border-white/5">
                    <p className="text-xs text-white/40 font-bold uppercase tracking-widest mb-3">Payment Instructions</p>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-white/60">Subscription Fee</span>
                        <span className="text-white font-bold">$150 / Monthly</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-white/60">Reference</span>
                        <span className="text-primary font-bold">KEBS-{mt5Login}</span>
                      </div>
                    </div>
                    <Button variant="ghost" className="w-full mt-4 text-xs">
                      View Payment Details <ExternalLink size={14} className="ml-1" />
                    </Button>
                  </div>

                  {/* Hidden file input */}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/jpg,image/png,image/webp,application/pdf"
                    onChange={handleFileSelect}
                    className="hidden"
                  />

                  {/* File Upload Area */}
                  <div 
                    className={`border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center gap-4 transition-all ${
                      uploadedFile 
                        ? 'border-green-500/30 bg-green-500/5' 
                        : 'border-white/10 bg-white/5 hover:border-primary/30 hover:bg-primary/5 cursor-pointer'
                    }`}
                    onClick={() => !uploadedFile && fileInputRef.current?.click()}
                  >
                    {uploadedFile ? (
                      <>
                        {filePreview ? (
                          <div className="w-full max-w-xs">
                            <img 
                              src={filePreview} 
                              alt="Payment proof preview" 
                              className="w-full h-48 object-contain rounded-lg border border-white/10"
                            />
                          </div>
                        ) : (
                          <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center text-green-500">
                            <CheckCircle2 size={32} />
                          </div>
                        )}
                        <div className="text-center">
                          <p className="text-sm font-bold text-green-400">✓ File Selected</p>
                          <p className="text-xs text-white/60 mt-1">{uploadedFile.name}</p>
                          <p className="text-[10px] text-white/40 mt-1">
                            {(uploadedFile.size / 1024).toFixed(2)} KB • {uploadedFile.type.split('/')[1].toUpperCase()}
                          </p>
                        </div>
                        <div className="flex gap-2 w-full">
                          <Button
                            variant="outline"
                            className="flex-1 text-xs py-2"
                            onClick={(e) => {
                              e.stopPropagation();
                              setUploadedFile(null);
                              setFilePreview('');
                              if (fileInputRef.current) fileInputRef.current.value = '';
                            }}
                          >
                            Change File
                          </Button>
                          <Button
                            loading={isUploading}
                            className="flex-1 text-xs py-2"
                            onClick={(e) => {
                              e.stopPropagation();
                              handlePopUpload();
                            }}
                          >
                            {isUploading ? 'Uploading...' : 'Submit'}
                          </Button>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center text-primary">
                          <UploadCloud size={32} />
                        </div>
                        <div className="text-center">
                          <p className="text-sm font-bold">Upload Proof of Payment</p>
                          <p className="text-[10px] text-white/40 mt-1 uppercase tracking-widest font-bold">
                            PNG, JPG, WEBP or PDF • Max 5MB
                          </p>
                        </div>
                        <Button className="w-full mt-2">
                          Browse Files
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              )}

              {paymentStatus === 'PENDING' && (
                <div className="bg-primary/10 border border-primary/20 rounded-xl p-6 text-center space-y-4">
                  <div className="flex justify-center">
                    <div className="w-12 h-12 bg-primary/20 rounded-full flex items-center justify-center text-primary animate-bounce">
                      <Clock />
                    </div>
                  </div>
                  <div>
                    <h4 className="font-bold text-white">Verification in Progress</h4>
                    <p className="text-xs text-white/60 mt-2 leading-relaxed">
                      Our systems are currently verifying your proof of payment. Once confirmed, your mentor will manually activate your connection.
                    </p>
                  </div>
                  <div className="text-[10px] text-white/30 italic uppercase font-bold tracking-widest">
                    Estimated wait: 45 minutes
                  </div>
                </div>
              )}

              {paymentStatus === 'CONFIRMED' && (
                <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-6 text-center space-y-4">
                  <div className="flex justify-center">
                    <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center text-white shadow-[0_0_20px_rgba(34,197,94,0.4)]">
                      <CheckCircle2 size={32} />
                    </div>
                  </div>
                  <div>
                    <h4 className="font-bold text-white text-lg">Subscription Active</h4>
                    <p className="text-xs text-white/60 mt-2 leading-relaxed">
                      Your account is fully verified and trading protocols are active. Enjoy high-performance automated trading.
                    </p>
                  </div>
                  <Button variant="outline" className="w-full text-xs" onClick={() => setActiveTab('DASHBOARD')}>
                    Go to Dashboard
                  </Button>
                </div>
              )}
            </Card>

            <p className="text-[10px] text-center text-white/20 uppercase tracking-[0.2em] font-bold">
              Secure Cloud Infrastructure Powered by Maatla Kebs
            </p>
          </div>
        )}
      </main>

      {/* Navigation Bar */}
      <nav className="fixed bottom-0 left-0 right-0 bg-dark/80 backdrop-blur-xl border-t border-white/10 safe-bottom z-50">
        <div className="flex justify-around items-center h-20 max-w-md mx-auto px-4">
          {[
            { id: 'DASHBOARD', icon: LayoutDashboard, label: 'Control' },
            { id: 'SETTINGS', icon: Settings, label: 'Risk' },
            { id: 'PAYMENT', icon: CreditCard, label: 'Payment' }
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id as AppTab)}
              className={`flex flex-col items-center justify-center gap-1 transition-all flex-1 ${activeTab === item.id ? 'text-primary' : 'text-white/30'}`}
            >
              <div className={`p-2 rounded-xl transition-all ${activeTab === item.id ? 'bg-primary/10' : ''}`}>
                <item.icon size={activeTab === item.id ? 24 : 22} strokeWidth={activeTab === item.id ? 2.5 : 2} />
              </div>
              <span className={`text-[10px] font-bold uppercase tracking-widest ${activeTab === item.id ? 'opacity-100' : 'opacity-0'}`}>
                {item.label}
              </span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
};

const App = () => {
  const [view, setView] = useState<View>('SPLASH'); // Start directly with splash for native app feel

  const handleLaunch = () => {
    setView('SPLASH');
  };

  const handleSplashFinish = () => {
    setView('AUTH');
  };

  const handleLogin = () => {
    const hasOnboarded = localStorage.getItem('onboarded');
    if (hasOnboarded) {
      setView('APP');
    } else {
      setView('ONBOARDING');
    }
  };

  const handleOnboardingComplete = () => {
    localStorage.setItem('onboarded', 'true');
    setView('APP');
  };

  const handleDisconnect = () => {
    setView('ONBOARDING');
  };

  return (
    <div className="antialiased text-white selection:bg-primary/30">
      {view === 'LANDING' && <LandingPage onLaunch={handleLaunch} />}
      {view === 'SPLASH' && <SplashScreen onFinish={handleSplashFinish} />}
      {view === 'AUTH' && <AuthScreen onLogin={handleLogin} />}
      {view === 'ONBOARDING' && <OnboardingScreen onComplete={handleOnboardingComplete} />}
      {view === 'APP' && <MainApp onDisconnect={handleDisconnect} />}
    </div>
  );
};

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<App />);
}
