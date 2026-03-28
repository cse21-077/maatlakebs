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
  const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);

  useEffect(() => {
    const handler = (e: any) => { e.preventDefault(); setDeferredPrompt(e); };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      setDeferredPrompt(null); return;
    }
    if (!isMobile) onLaunch();
  };

  const InstallStep = ({ n, title, desc }: { n: number; title: string; desc: React.ReactNode }) => (
    <div className="flex gap-4 items-start bg-white/5 p-5 rounded-2xl border border-white/5">
      <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0 mt-0.5">
        <span className="text-xs font-bold text-primary">{n}</span>
      </div>
      <div>
        <p className="text-[10px] font-black text-white/40 uppercase tracking-widest">{title}</p>
        <p className="text-sm font-bold text-white mt-0.5 leading-tight">{desc}</p>
      </div>
    </div>
  );

  return (
    <div className="h-[100dvh] bg-dark flex flex-col animate-fade-in relative overflow-hidden">
      {/* Immersive Background */}
      <div className="absolute inset-0 z-0">
        <img src="/kebs.jpg" alt="Institutional" className="w-full h-full object-cover object-top scale-105 opacity-60" />
        <div className="absolute inset-0 bg-gradient-to-t from-dark via-dark/40 to-transparent" />
      </div>

      <nav className="p-8 flex justify-between items-center w-full relative z-10 h-24">
        <div className="w-12 h-12 bg-[#1a1c22] rounded-2xl border border-white/10 flex items-center justify-center backdrop-blur-xl shadow-2xl">
          <img src="/MK Logo.png" alt="Logo" className="w-8 h-8 object-contain" />
        </div>
        <button onClick={handleInstallClick} className="text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-white transition-colors">
           Cloud Terminal Access →
        </button>
      </nav>

      <main className="flex-1 flex flex-col justify-between p-10 pb-20 relative z-10 max-w-sm mr-auto ml-0">
        <div className="animate-fade-in pt-[4dvh] space-y-4">
           <h1 className="text-5xl font-black leading-[1.0] text-white tracking-tighter">
              Master the <br /> <span className="text-primary italic">Markets</span>
           </h1>
           <div className="w-16 h-1 bg-primary rounded-full transition-all" />
        </div>

        <div className="animate-slide-up space-y-10 flex flex-col items-start">
          <p className="text-lg font-medium text-white shadow-black/40 pr-8 leading-relaxed opacity-90">
            Professional synthetic index trading with zero custody. Secure, elegant, and native.
          </p>
          
          <div className="w-full">
            {(!isMobile || deferredPrompt) ? (
              <button onClick={handleInstallClick}
                className="w-full py-5 text-lg font-bold text-white bg-[#323434] border border-white/10 rounded-2xl shadow-xl active:scale-95 transition-all flex items-center justify-center gap-3 group">
                <Smartphone size={22} className="opacity-40 group-hover:scale-110 transition-transform" />
                {isMobile ? 'Install Platform' : 'Launch Terminal'}
              </button>
            ) : (
              <div className="w-full space-y-4">
                 {isIOS ? (
                    <div className="space-y-3">
                       <InstallStep n={1} title="Share Protocol" desc="Tap the Share icon in Safari" />
                       <InstallStep n={2} title="Link Node" desc="Add to Home Screen" />
                    </div>
                 ) : (
                    <div className="space-y-3">
                      <InstallStep n={1} title="Menu Protocol" desc="Tap the three dots (⋮)" />
                      <InstallStep n={2} title="Link Node" desc="Select 'Install app'" />
                    </div>
                 )}
              </div>
            )}
          </div>
        </div>
      </main>

      <footer className="p-10 text-center text-white/20 text-[8px] tracking-[0.5em] font-black relative z-10 safe-bottom">
        &copy; 2026 MAATLA KEBS | BY TOPO RAPULA
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
