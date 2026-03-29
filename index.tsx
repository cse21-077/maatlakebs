import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import {
  ShieldCheck, Zap, Smartphone, AlertCircle, CheckCircle2
} from 'lucide-react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './lib/supabase';
import { AuthScreen } from './components/AuthScreen';
import { OnboardingScreen } from './components/OnboardingScreen';
import { MainApp } from './components/MainApp';
import { Button, Card } from './components/shared';

// ── Types ─────────────────────────────────────────────────────────────────────
type View = 'LANDING' | 'SPLASH' | 'AUTH' | 'ONBOARDING' | 'APP';

// ── Landing Page ──────────────────────────────────────────────────────────────
const LandingPage = ({ onLaunch }: { onLaunch: () => void }) => {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

  useEffect(() => {
    const handler = (e: any) => { e.preventDefault(); setDeferredPrompt(e); };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      setDeferredPrompt(null);
      return;
    }
    onLaunch();
  };

  const Nav = () => (
    <nav className="fixed top-6 left-1/2 -translate-x-1/2 z-[100] w-[95%] max-w-5xl glass-nav rounded-full px-6 py-3 flex items-center justify-between shadow-xl shadow-primary/5">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 bg-primary rounded-xl flex items-center justify-center shadow-lg shadow-primary/20">
          <img src="/MK Logo.png" alt="Logo" className="w-5 h-5 object-contain" />
        </div>
        <span className="font-extrabold text-sm tracking-tight text-secondary">Maatla Kebs</span>
      </div>
      <div className="flex items-center gap-8">
        <a href="#about" className="text-[13px] font-semibold text-secondary/60 hover:text-primary transition-colors hidden sm:block">About</a>
        <a href="#install" className="text-[13px] font-semibold text-secondary/60 hover:text-primary transition-colors hidden sm:block">Installation</a>
        <button onClick={onLaunch} className="px-5 py-2.5 bg-secondary text-white rounded-full text-[13px] font-bold shadow-lg shadow-secondary/10 hover:bg-secondary/90 transition-all hover:scale-105 active:scale-95">
          Open App
        </button>
      </div>
    </nav>
  );

  return (
    <div className="bg-surface min-h-screen text-secondary selection:bg-primary/20 scroll-smooth">
      <Nav />
      
      {/* Hero Section */}
      <header className="relative pt-40 pb-24 px-6 min-h-[95vh] flex flex-col items-center justify-center text-center overflow-hidden mesh-gradient">
        <div className="absolute inset-0 hero-pattern" />
        
        <div className="relative z-10 max-w-5xl mx-auto space-y-10 animate-slide-up">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/5 border border-primary/10 mb-2">
            <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
            <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-primary">v2.0 Performance Node Active</span>
          </div>
          
          <h1 className="text-[clamp(2.5rem,8vw,5.5rem)] font-[900] tracking-[-0.03em] leading-[0.95] text-secondary">
            Master the <span className="gradient-text uppercase">Algorithms</span><br />
            of Wealth Creation.
          </h1>
          
          <p className="text-lg sm:text-xl font-medium text-secondary/60 max-w-2xl mx-auto leading-relaxed">
            A premium, zero-custody trading ecosystem designed for high-performance synthetic index execution. Secure, elegant, and native.
          </p>
          
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-6">
            <button onClick={handleInstallClick} className="w-full sm:w-auto px-10 py-5 bg-primary text-white font-bold rounded-2xl shadow-xl shadow-primary/20 flex items-center justify-center gap-3 hover:bg-primary-hover hover:scale-105 active:scale-95 transition-all">
              <Smartphone size={20} />
              {isMobile ? 'Install Dashboard' : 'Get The App'}
            </button>
            <button onClick={onLaunch} className="w-full sm:w-auto px-10 py-5 bg-white border border-slate-200 text-secondary font-bold rounded-2xl shadow-sm flex items-center justify-center gap-3 hover:bg-slate-50 active:scale-95 transition-all">
              <Zap size={20} className="text-primary" />
              Launch Cloud Terminal
            </button>
          </div>

          <div className="pt-16 flex flex-wrap justify-center gap-12 sm:gap-16 opacity-30 grayscale transition-all hover:opacity-50 hover:grayscale-0">
             <img src="/metatrader.png" className="h-7 object-contain" alt="MT5" />
             <img src="/weltrade.png" className="h-7 object-contain" alt="Weltrade" />
             <img src="/binace.png" className="h-7 object-contain" alt="Binance" />
          </div>
        </div>
      </header>

      {/* Stats Section */}
      <section className="py-24 px-6 bg-white border-y border-slate-100">
        <div className="max-w-7xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-12 text-center">
          {[
            { label: 'Uptime Sync', val: '99.9%' },
            { label: 'Latency', val: '< 2ms' },
            { label: 'Execution', val: 'Instant' },
            { label: 'Security', val: '256-bit' },
          ].map((stat, i) => (
            <div key={i} className="space-y-2">
              <p className="text-[clamp(1.5rem,3vw,2.5rem)] font-black text-secondary tracking-tighter">{stat.val}</p>
              <p className="text-[10px] font-extrabold uppercase tracking-widest text-secondary/40">{stat.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Feature Grid */}
      <section className="py-32 px-6 max-w-7xl mx-auto overflow-hidden">
        <div className="text-center mb-20 space-y-4">
          <span className="text-primary font-black text-[11px] uppercase tracking-[0.2em]">Institutional Edge</span>
          <h2 className="text-4xl sm:text-6xl font-black tracking-tight text-secondary leading-tight">Built for Professionals.</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {[
            { img: '/tradeentry.jpg', title: 'Precise Entry Nodes', tag: 'Strategy', col: 'text-primary' },
            { img: '/tradeinprofit.jpg', title: 'Real-Time Execution', tag: 'Momentum', col: 'text-emerald-500' },
            { img: '/tradeprofit.jpg', title: 'Automated Yields', tag: 'Payout', col: 'text-pink-500' },
          ].map((item, i) => (
            <div key={i} className="glass-card rounded-5xl p-4 group">
              <div className="aspect-[4/5] rounded-[2.5rem] overflow-hidden mb-8 relative">
                <img src={item.img} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" alt={item.title} />
                <div className="absolute top-6 left-6 flex items-center gap-2 px-3 py-1 rounded-full bg-white/90 backdrop-blur-sm border border-white/50 shadow-sm">
                   <div className={`w-1.5 h-1.5 rounded-full bg-current ${item.col}`} />
                   <span className={`text-[10px] font-black uppercase tracking-widest ${item.col}`}>{item.tag}</span>
                </div>
              </div>
              <div className="px-4 pb-4">
                <h3 className="text-2xl font-black text-secondary">{item.title}</h3>
                <p className="text-secondary/50 text-sm mt-2 font-medium">Advanced algorithmic processing ensures every node is executed with micro-second precision.</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* About Section */}
      <section id="about" className="py-32 px-6 bg-slate-50 border-y border-slate-200 overflow-hidden relative">
        <div className="absolute top-0 right-0 w-1/2 h-full bg-primary/5 blur-[120px] rounded-full -translate-y-1/2 translate-x-1/2" />
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center gap-20 relative z-10">
          <div className="w-full md:w-1/2">
             <div className="relative rounded-[3rem] overflow-hidden shadow-2xl shadow-primary/10 border-8 border-white group">
                <img src="/mentoprinhallway.jpg" className="w-full aspect-[4/5] object-cover transition-transform duration-1000 group-hover:scale-105" alt="Architect" />
                <div className="absolute inset-x-0 bottom-0 p-8 bg-gradient-to-t from-black/80 to-transparent">
                  <p className="text-white/60 text-xs font-bold uppercase tracking-widest mb-1">Founder & Lead Architect</p>
                  <h4 className="text-white text-3xl font-black">Topo Rapula</h4>
                </div>
             </div>
          </div>
          <div className="w-full md:w-1/2 space-y-10">
            <div className="space-y-4">
              <span className="text-primary font-black text-[11px] uppercase tracking-[0.2em]">The Visionary</span>
              <h2 className="text-4xl sm:text-6xl font-black tracking-tight text-secondary leading-tight">Bridging Reality and Profit.</h2>
            </div>
            <p className="text-xl text-secondary/70 leading-relaxed font-medium">
              Maatla Kebs isn't just a platform—it's a digital legacy. We simplify the complexity of modern financial markets into a sleek, automated experience that works for you, not the other way around.
            </p>
            <button onClick={onLaunch} className="flex items-center gap-6 group">
               <div className="w-16 h-16 rounded-3xl bg-secondary text-white flex items-center justify-center shadow-xl group-hover:scale-110 group-hover:rotate-6 transition-all">
                  <ShieldCheck size={28} />
               </div>
               <div className="text-left">
                  <span className="block font-black text-xl text-secondary group-hover:text-primary transition-colors">Start Your Journey</span>
                  <p className="text-xs font-bold text-secondary/40 uppercase tracking-widest">Connect to nodes →</p>
               </div>
            </button>
          </div>
        </div>
      </section>

      {/* Integration Guide */}
      <section id="install" className="py-32 px-6 max-w-7xl mx-auto">
        <div className="text-center mb-20 space-y-4">
          <span className="text-primary font-black text-[11px] uppercase tracking-[0.2em]">Getting Started</span>
          <h2 className="text-4xl sm:text-6xl font-black tracking-tight text-secondary">Deploy the Ecosystem.</h2>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {[
            { title: 'iOS implementation', icon: Smartphone, bg: 'bg-white' },
            { title: 'Android Activation', icon: Zap, bg: 'bg-primary text-white shadow-2xl shadow-primary/20 md:scale-105' },
            { title: 'Desktop Access', icon: ShieldCheck, bg: 'bg-white' },
          ].map((item, i) => (
            <div key={i} className={`p-10 rounded-5xl border border-slate-200 transition-all ${item.bg}`}>
              <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mb-8 text-secondary">
                 <item.icon size={28} />
              </div>
              <h3 className="text-2xl font-black mb-6">{item.title}</h3>
              <div className="aspect-[9/16] bg-slate-100/50 rounded-3xl mb-8 overflow-hidden relative group">
                 <div className="absolute inset-0 flex items-center justify-center text-center p-8 opacity-40">
                    <p className="text-[10px] font-black uppercase tracking-widest leading-loose">Deployment Guide <br/> Uploading...</p>
                 </div>
              </div>
              <ul className="space-y-4 text-sm font-semibold opacity-70">
                <li className="flex items-center gap-3">
                  <CheckCircle2 size={18} />
                  <span>Secure handshake protocol</span>
                </li>
                <li className="flex items-center gap-3">
                  <CheckCircle2 size={18} />
                  <span>Native system integration</span>
                </li>
                <li className="flex items-center gap-3">
                  <CheckCircle2 size={18} />
                  <span>Real-time data sync</span>
                </li>
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* Final Call to Action */}
      <section className="py-24 px-6">
        <div className="max-w-7xl mx-auto rounded-5xl bg-secondary p-12 sm:p-24 relative overflow-hidden text-center text-white space-y-12">
          <div className="absolute inset-0 opacity-10 hero-pattern" />
          <div className="absolute top-0 left-1/4 w-1/2 h-full bg-primary/20 blur-[100px] rounded-full -translate-y-1/2" />
          
          <div className="relative z-10 space-y-8 max-w-3xl mx-auto">
            <h2 className="text-4xl sm:text-7xl font-[900] tracking-tighter leading-tight italic uppercase">
              Ready to automate <br /> your <span className="gradient-text">Freedom?</span>
            </h2>
            <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-6">
              <button onClick={onLaunch} className="w-full sm:w-auto px-12 py-6 bg-white text-secondary text-lg font-black rounded-3xl shadow-2xl hover:scale-105 active:scale-95 transition-all">
                INITIALIZE NOW
              </button>
            </div>
            <p className="text-white/30 text-[10px] font-black uppercase tracking-[0.6em]">24/7 Global Trading Nodes Active</p>
          </div>
        </div>
      </section>

      <footer className="py-20 px-6 border-t border-slate-100 text-center space-y-8 bg-white">
          <div className="w-14 h-14 bg-secondary text-white rounded-2xl flex items-center justify-center mx-auto shadow-2xl">
            <img src="/MK Logo.png" alt="Logo" className="w-8 h-8 object-contain" />
          </div>
          <div className="text-[10px] font-black text-secondary/30 uppercase tracking-[0.8em]">
            &copy; 2026 MAATLA KEBS | BY TOPO RAPULA
          </div>
      </footer>
    </div>
  );
};

// ── Splash Screen ─────────────────────────────────────────────────────────────
const SplashScreen = ({ onFinish }: { onFinish: () => void }) => {
  useEffect(() => {
    // Technical Pre-load Node: Ensures all assets are cached before terminal handshake
    const assets = ['/kebs.jpg', '/support.jpg', '/MK Logo.png', '/weltrade.png', '/metatrader.png'];
    assets.forEach(src => { const img = new Image(); img.src = src; });

    const t = setTimeout(onFinish, 3000); 
    return () => clearTimeout(t); 
  }, [onFinish]);

  return (
    <div className="fixed inset-0 bg-[#0d0f14] z-[100] flex flex-col items-center justify-center overflow-hidden animate-fade-in text-center h-full w-full">
      {/* Immersive Depth Gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-dark via-dark/95 to-dark/90" />
      
      {/* Central Identity Section - Perfectly Vertical Center */}
      <div className="relative z-20 flex flex-col items-center justify-center space-y-12 animate-fade-in scale-110">
        <div className="w-32 h-32 bg-[#1a1c22] border-2 border-white/10 rounded-[2.5rem] flex items-center justify-center shadow-2xl animate-pulse-slow">
          <img src="/MK Logo.png" alt="Logo" className="w-20 h-20 object-contain" />
        </div>
        
        <div className="space-y-6">
          <div className="w-40 h-[2px] bg-white/5 mx-auto relative overflow-hidden rounded-full">
            <div className="absolute inset-0 bg-primary w-1/2 animate-[splash-load_1.5s_infinite]" />
          </div>
          <p className="text-[11px] font-black text-white/40 uppercase tracking-[0.6em] animate-pulse">
            INITIALIZING TERMINAL
          </p>
        </div>
      </div>
      
      {/* Foundation Signature at Base */}
      <div className="absolute bottom-16 left-0 right-0 z-20 animate-fade-in delay-700">
        <p className="text-[10px] font-black text-white uppercase tracking-[0.6em]">
          BY TOPO RAPULA
        </p>
      </div>

      <style>{`
        @keyframes splash-load { 
          0% { transform: translateX(-100%); } 
          100% { transform: translateX(200%); } 
        } 
        @keyframes pulse-slow { 
          0%, 100% { transform: scale(1); opacity: 1; } 
          50% { transform: scale(0.96); opacity: 0.8; } 
        }
      `}</style>
    </div>
  );
};

// ── App root ──────────────────────────────────────────────────────────────────
const App = () => {
  const isPWA = window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone || document.referrer.includes('android-app://');

  const [view, setView] = useState<View>(isPWA ? 'SPLASH' : 'LANDING');
  const [session, setSession] = useState<Session | null>(null);
  const [booting, setBooting] = useState(true);

  // ── Session management ──
  useEffect(() => {
    const checkOnboarding = async (s: Session) => {
      // We check for risk_profiles as a proxy for 'has accepted legal disclosure'
      const { data } = await supabase
        .from('risk_profiles').select('id').eq('user_id', s.user.id).single();
      setView(data ? 'APP' : 'ONBOARDING');
    };

    supabase.auth.getSession().then(({ data: { session: s } }) => {
      if (s) { setSession(s); checkOnboarding(s); }
      else setView(isPWA ? 'SPLASH' : 'LANDING');
      setBooting(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'SIGNED_OUT') { setSession(null); setView('AUTH'); }
      if (event === 'SIGNED_IN' && s) { setSession(s); checkOnboarding(s); }
    });

    return () => subscription.unsubscribe();
  }, []);

  if (booting) return (
    <div className="min-h-screen bg-dark flex items-center justify-center">
      <div className="w-10 h-10 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="antialiased text-white selection:bg-primary/30">
      {view === 'LANDING' && <LandingPage onLaunch={() => setView('SPLASH')} />}
      {view === 'SPLASH' && <SplashScreen onFinish={() => setView('AUTH')} />}
      {view === 'AUTH' && <AuthScreen onLogin={(s?: Session) => {
        if (s) { setSession(s); setView('ONBOARDING'); return; }
        supabase.auth.getSession().then(({ data: { session: s } }) => { if (s) { setSession(s); setView('ONBOARDING'); } });
      }} />}
      {view === 'ONBOARDING' && session && <OnboardingScreen session={session} onComplete={() => setView('APP')} />}
      {view === 'APP' && session && <MainApp session={session} onDisconnect={() => { setSession(null); setView('AUTH'); }} />}
    </div>
  );
};

const container = document.getElementById('root');
if (container) createRoot(container).render(<App />);
