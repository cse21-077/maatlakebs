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
const LandingPage = ({ onLaunch, isPWA, hasAuthParams }: { onLaunch: () => void; isPWA: boolean; hasAuthParams?: boolean }) => {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

  useEffect(() => {
    const handler = (e: any) => { e.preventDefault(); setDeferredPrompt(e); };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstallClick = async () => {
    if (!isPWA) {
      // Not in PWA mode - trigger install prompt
      if (deferredPrompt) {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') {
          // Wait a moment for app to potentially install
          setTimeout(() => {
            if (window.matchMedia('(display-mode: standalone)').matches) {
              onLaunch();
            }
          }, 1000);
        }
        setDeferredPrompt(null);
      }
      return;
    }
    // Already in PWA mode - proceed
    onLaunch();
  };

  const Nav = () => (
    <nav className="fixed top-6 left-1/2 -translate-x-1/2 z-[100] w-[95%] max-w-5xl lg:glass-nav rounded-full px-6 py-3 flex items-center justify-between lg:shadow-xl shadow-primary/5 lg:shadow-primary/5 lg:bg-[#bfc5c4]">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 bg-primary lg:bg-primary rounded-xl flex items-center justify-center shadow-lg shadow-primary/20">
          <img src="/MK Logo.png" alt="Logo" className="w-5 h-5 object-contain" />
        </div>
        <span className="font-extrabold text-sm tracking-tight text-white lg:text-black">Maatla Kebs</span>
      </div>
      <div className="flex items-center gap-8">
        <a href="#about" className="text-[13px] font-semibold text-white/70 lg:text-black hover:text-primary transition-colors hidden sm:block">About</a>
        <a href="#install" className="text-[13px] font-semibold text-white/70 lg:text-black hover:text-primary transition-colors hidden sm:block">Installation</a>
        <button onClick={handleInstallClick} className="px-5 py-2.5 bg-secondary text-white lg:bg-primary lg:text-white rounded-full text-[13px] font-bold shadow-lg shadow-secondary/10 hover:bg-secondary/90 lg:hover:bg-primary/90 transition-all hover:scale-105 active:scale-95">
          {isPWA ? 'Launch Terminal' : 'Get App'}
        </button>
      </div>
    </nav>
  );

  return (
    <div className="bg-charcoal min-h-screen text-white selection:bg-primary/20 scroll-smooth selection:text-white">
      <Nav />

      {/* Hero Section */}
      <header className="relative pt-20 lg:pt-48 pb-16 lg:pb-32 px-4 lg:px-6 flex flex-col items-center justify-center overflow-hidden min-h-[120vh] lg:min-h-auto" style={{ backgroundColor: '#0a0e1a' }}>
        {/* Mobile Background Image */}
        <div className="absolute inset-0 z-0 lg:hidden">
          <img 
            src="/mkb.jpg" 
            alt="Background" 
            className="w-full h-full object-cover opacity-40"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-[#0a0e1a] via-transparent to-[#0a0e1a]"></div>
        </div>
        
        {/* Animated Background Mesh (Hidden on mobile to not overlay image) */}
        <div className="absolute inset-0 z-0 hidden lg:block">
          <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-primary/20 blur-[120px] rounded-full animate-pulse-slow" />
          <div className="absolute bottom-0 right-1/4 w-[600px] h-[600px] bg-secondary/10 blur-[150px] rounded-full" />
          <div className="absolute inset-0 hero-pattern opacity-10" />
        </div>

        <div className="relative z-10 max-w-7xl mx-auto w-full grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-16 items-center">
          {/* Left: Content */}
          <div className="space-y-6 lg:space-y-10 text-left animate-slide-up lg:mg-0 mt-96 lg:mt-0">
            <h1 className="text-[clamp(2.8rem,9vw,6rem)] font-[900] tracking-[-0.04em] leading-[0.9] text-white">

              Master the <br />
              <span className="text-primary italic">Precision</span> of <br />
              Digital Wealth.
            </h1>

            {/* Conditionally hide this paragraph on mobile */}
            <p className="text-xl font-medium text-white/50 max-w-xl leading-relaxed hidden lg:block">
              Join Botswana's premier trading community. Experience elite, automated wealth creation with Maatla Kebs—your trusted partner in safe, simple, and powerful financial freedom.
            </p>

            {hasAuthParams ? (
              <div className="bg-primary/10 border border-primary/20 rounded-3xl p-8 space-y-4 animate-scale-in">
                <div className="flex items-center gap-3 text-primary">
                  <CheckCircle2 size={24} />
                  <span className="font-black uppercase tracking-widest text-sm">Protocol Handshake Successful</span>
                </div>
                <h2 className="text-3xl font-black text-white leading-tight">Your Identity is Verified.</h2>
                <p className="text-white/60 text-sm font-medium leading-relaxed">
                  Confirmation complete. To maintain security and app-integrity, the terminal is strictly accessible via the PWA. 
                  <br /><br />
                  <span className="text-white font-bold">Please close this browser and launch Maatla Kebs from your Home Screen.</span>
                </p>
                <div className="pt-2">
                  <a href="#install" className="text-primary text-[10px] font-black uppercase tracking-widest underline underline-offset-4">Need help finding the app?</a>
                </div>
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row items-center justify-start gap-4 pt-4">
                <button
                  onClick={handleInstallClick}
                  className="w-full sm:w-auto px-10 py-5 bg-primary text-white font-black rounded-2xl shadow-2xl shadow-primary/20 flex items-center justify-center gap-3 hover:bg-primary-hover hover:scale-105 active:scale-95 transition-all group"
                >
                  <Smartphone size={22} className="group-hover:rotate-12 transition-transform" />
                  {isMobile ? (isPWA ? 'Enter Terminal' : 'Install App') : 'Start Trading'}
                </button>
              </div>
            )}

            <div className="pt-8 flex flex-wrap gap-10 opacity-30 grayscale items-center hidden lg:flex">
              <img src="/metatrader.png" className="h-6 object-contain" alt="MT5" />
              <img src="/weltrade.png" className="h-6 object-contain" alt="Weltrade" />
              <img src="/binace.png" className="h-6 object-contain" alt="Binance" />
            </div>
          </div>

          {/* Right: Dual Device Showcase */}
          <div className="relative group lg:block hidden h-[600px] w-full">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-[500px] bg-primary/20 blur-[120px] rounded-full opacity-40 animate-pulse-slow" />

            <div className="relative h-full flex items-center justify-center">
              {/* Android Mockup (Behind) */}
              <div className="absolute left-[5%] top-[10%] w-[380px] z-10 animate-float delay-1000 opacity-80 group-hover:opacity-100 transition-opacity">
                <img
                  src="/android.png"
                  alt="Android Terminal"
                  className="w-full h-auto object-contain drop-shadow-[0_20px_50px_rgba(0,0,0,0.5)] -rotate-6 group-hover:-rotate-3 transition-transform duration-1000"
                />
              </div>

              {/* iPhone Mockup (Front) */}
              <div className="absolute right-[5%] bottom-[5%] w-[420px] z-20 animate-float">
                <img
                  src="/trans.png"
                  alt="iOS Terminal"
                  className="w-full h-auto object-contain drop-shadow-[0_40px_60px_rgba(33,56,188,0.4)] rotate-3 group-hover:rotate-0 transition-transform duration-1000"
                />
              </div>

              {/* Decorative Asset: Glow behind iPhone */}
              <div className="absolute z-15 bottom-1/4 right-1/4 w-64 h-64 bg-primary/40 blur-[100px] rounded-full pointer-events-none" />
            </div>
          </div>


        </div>
      </header>


      {/* Stats Section */}
      <section className="py-24 px-6 bg-white/5 border-y border-white/5">
        <div className="max-w-7xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-12 text-center">
          {[
            { label: 'Uptime Sync', val: '99.9%', col: 'text-primary' },
            { label: 'Latency', val: '< 2ms', col: 'text-white' },
            { label: 'Execution', val: 'Instant', col: 'text-white' },
            { label: 'Security', val: '256-bit', col: 'text-white' },
          ].map((stat, i) => (
            <div key={i} className="space-y-2">
              <p className={`text-[clamp(1.5rem,3vw,2.5rem)] font-black tracking-tighter ${stat.col}`}>{stat.val}</p>
              <p className="text-[10px] font-extrabold uppercase tracking-widest text-white/30">{stat.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Feature Grid with Videos */}
      <section className="py-32 px-6 max-w-7xl mx-auto">
        <div className="text-left mb-20 space-y-4">
          <span className="text-primary font-black text-[11px] uppercase tracking-[0.2em]">Real-World Execution</span>
          <h2 className="text-4xl sm:text-6xl font-black tracking-tight text-white leading-tight">The Architecture <br /> of Success.</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {[
            {
              video: 'https://zo1zv0g4tz.ufs.sh/f/lfByGtJ28C7IdPb6jia6UI0HGSiqWL4foPpawBbN5D3jc1Yv',
              title: 'Precise Entry Nodes',
              tag: 'Profit Sync',
              col: 'text-primary'
            },
            {
              video: 'https://zo1zv0g4tz.ufs.sh/f/lfByGtJ28C7IyCbKgp7BHYFJUpjnvqw9QkeGL1af7mxVrsig',
              title: 'Lifestyle Manifestation',
              tag: 'Milestone',
              col: 'text-blue-500'
            },
            {
              video: 'https://zo1zv0g4tz.ufs.sh/f/lfByGtJ28C7Ij0OQsAlNsLbmeX5oyKwFnf8zWQpBZ67Mj1Dq',
              title: 'Institutional Yields',
              tag: 'Momentum',
              col: 'text-primary'
            },
          ].map((item, i) => (
            <div key={i} className="bg-white/[0.03] border border-white/10 rounded-[2.5rem] p-4 group transition-all hover:bg-white/[0.05] hover:border-primary/30">
              <div className="aspect-[4/5] rounded-[2rem] overflow-hidden mb-8 relative bg-black/40 shadow-inner">
                <video
                  autoPlay
                  loop
                  muted
                  playsInline
                  className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105 opacity-80 group-hover:opacity-100"
                >
                  <source src={item.video} type="video/mp4" />
                </video>
                <div className="absolute top-6 left-6 flex items-center gap-2 px-3 py-1 rounded-full bg-charcoal/80 backdrop-blur-sm border border-white/10 shadow-sm">
                  <div className={`w-1.5 h-1.5 rounded-full bg-current ${item.col}`} />
                  <span className={`text-[10px] font-black uppercase tracking-widest ${item.col}`}>{item.tag}</span>
                </div>
              </div>
              <div className="px-4 pb-4">
                <h3 className="text-2xl font-black text-white">{item.title}</h3>
                <p className="text-white/40 text-sm mt-3 font-medium leading-relaxed">Experience live verification of algorithmic trading results and the manifestation of financial freedom.</p>
              </div>
            </div>
          ))}
        </div>
      </section>


      {/* About Section (Visionary) */}
      <section id="about" className="py-32 px-6 overflow-hidden relative" style={{ backgroundColor: '#bfc5c4' }}>
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center gap-20 relative z-10">
          <div className="w-full md:w-1/2">
            <div className="relative rounded-[3rem] overflow-hidden shadow-2xl border-4 border-black/5 group">
              <img src="/mentor.jpg" className="w-full aspect-[4/5] object-cover transition-transform duration-1000 group-hover:scale-105 opacity-90 group-hover:opacity-100" alt="Architect" />
              <div className="absolute inset-x-0 bottom-0 p-8 bg-gradient-to-t from-black/60 to-transparent">
                <p className="text-white/80 text-xs font-bold uppercase tracking-widest mb-1">Founder & Lead Architect</p>
                <h4 className="text-white text-3xl font-black">Maatla Kebs</h4>
              </div>
            </div>
          </div>

          <div className="w-full md:w-1/2 space-y-10">
            <div className="space-y-4">
              <span className="text-primary font-black text-[11px] uppercase tracking-[0.2em]">The Visionary</span>
              <h2 className="text-4xl sm:text-6xl font-black tracking-tight text-charcoal leading-tight">Bridging Reality <br /> and Profit.</h2>
            </div>
            <p className="text-xl text-charcoal/70 leading-relaxed font-medium">
              Copy By Kebs isn't just a platform—it's a digital legacy. We simplify the complexity of modern financial markets into a sleek, automated experience that works for you.
            </p>
          </div>
        </div>
      </section>


      {/* Integration Guide */}
      {/* Integration Guide */}
<section id="install" className="py-32 px-6 max-w-7xl mx-auto">
  <div className="text-center mb-20 space-y-4">
    <span className="text-primary font-black text-[11px] uppercase tracking-[0.2em]">Getting Started</span>
    <h2 className="text-4xl sm:text-6xl font-black tracking-tight text-white">Install the Terminal.</h2>
    <p className="text-white/40 text-lg max-w-2xl mx-auto">Install Maatla Kebs as a native app on your device for the best trading experience.</p>
  </div>

  <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-5xl mx-auto">
    {/* iOS Installation */}
    <div className="bg-white/[0.03] border border-white/10 rounded-[3rem] p-8 transition-all hover:bg-white/[0.05] hover:border-primary/30 group">
      <div className="flex items-center gap-4 mb-8">
        <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center group-hover:bg-white/10 transition-all">
          <Smartphone size={32} className="text-primary" />
        </div>
        <div>
          <h3 className="text-2xl font-black text-white">iOS Installation</h3>
          <p className="text-white/40 text-sm">iPhone • iPad • Safari</p>
        </div>
      </div>
      
      <div className="space-y-6">
        <div className="bg-black/30 rounded-2xl p-6 space-y-4">
          <div className="flex items-start gap-4">
            <div className="w-8 h-8 rounded-full bg-primary/20 text-primary flex items-center justify-center font-black shrink-0">1</div>
            <div>
              <p className="font-bold text-white">Open in Safari</p>
              <p className="text-white/40 text-sm">Tap the Share button <span className="inline-block bg-white/10 px-2 py-1 rounded-lg text-xs">⎔</span> at the bottom of the screen</p>
            </div>
          </div>
          <div className="flex items-start gap-4">
            <div className="w-8 h-8 rounded-full bg-primary/20 text-primary flex items-center justify-center font-black shrink-0">2</div>
            <div>
              <p className="font-bold text-white">Add to Home Screen</p>
              <p className="text-white/40 text-sm">Scroll down and tap <span className="text-primary font-bold">"Add to Home Screen"</span></p>
            </div>
          </div>
          <div className="flex items-start gap-4">
            <div className="w-8 h-8 rounded-full bg-primary/20 text-primary flex items-center justify-center font-black shrink-0">3</div>
            <div>
              <p className="font-bold text-white">Confirm Installation</p>
              <p className="text-white/40 text-sm">Tap <span className="text-primary font-bold">"Add"</span> in the top right corner</p>
            </div>
          </div>
        </div>
        
        <div className="pt-4 border-t border-white/10">
          <div className="flex items-center justify-between text-sm">
            <span className="text-white/40">✓ Full screen mode</span>
            <span className="text-white/40">✓ Offline capable</span>
            <span className="text-white/40">✓ Push notifications</span>
          </div>
        </div>
      </div>
    </div>

    {/* Android Installation */}
    <div className="bg-primary border border-primary/30 rounded-[3rem] p-8 transition-all hover:scale-[1.02] shadow-2xl shadow-primary/20 group">
      <div className="flex items-center gap-4 mb-8">
        <div className="w-16 h-16 rounded-2xl bg-white/20 flex items-center justify-center">
          <Zap size={32} className="text-white" />
        </div>
        <div>
          <h3 className="text-2xl font-black text-white">Android Installation</h3>
          <p className="text-white/60 text-sm">All Android Devices • Chrome</p>
        </div>
      </div>
      
      <div className="space-y-6">
        <div className="bg-black/20 rounded-2xl p-6 space-y-4">
          <div className="flex items-start gap-4">
            <div className="w-8 h-8 rounded-full bg-white/20 text-white flex items-center justify-center font-black shrink-0">1</div>
            <div>
              <p className="font-bold text-white">Open in Chrome</p>
              <p className="text-white/70 text-sm">Tap the menu button <span className="inline-block bg-white/20 px-2 py-1 rounded-lg text-xs">⋮</span> in the top right corner</p>
            </div>
          </div>
          <div className="flex items-start gap-4">
            <div className="w-8 h-8 rounded-full bg-white/20 text-white flex items-center justify-center font-black shrink-0">2</div>
            <div>
              <p className="font-bold text-white">Install App</p>
              <p className="text-white/70 text-sm">Select <span className="text-white font-bold">"Install App"</span> or <span className="text-white font-bold">"Add to Home screen"</span></p>
            </div>
          </div>
          <div className="flex items-start gap-4">
            <div className="w-8 h-8 rounded-full bg-white/20 text-white flex items-center justify-center font-black shrink-0">3</div>
            <div>
              <p className="font-bold text-white">Launch Terminal</p>
              <p className="text-white/70 text-sm">Tap <span className="text-white font-bold">"Install"</span> and open from your home screen</p>
            </div>
          </div>
        </div>
        
        <div className="pt-4 border-t border-white/20">
          <div className="flex items-center justify-between text-sm">
            <span className="text-white/80">✓ Native app experience</span>
            <span className="text-white/80">✓ Automatic updates</span>
            <span className="text-white/80">✓ Background sync</span>
          </div>
        </div>
      </div>
    </div>
  </div>

  {/* Additional Tips */}
  <div className="mt-16 max-w-3xl mx-auto text-center">
    <div className="bg-white/[0.02] border border-white/10 rounded-2xl p-6">
      <div className="flex items-center justify-center gap-2 mb-4">
        <AlertCircle size={18} className="text-primary" />
        <span className="text-sm font-bold text-white/60 uppercase tracking-wider">Pro Tips</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
        <div>
          <p className="text-white font-semibold mb-1">After Installation</p>
          <p className="text-white/40">Launch from home screen for full-screen PWA experience</p>
        </div>
        <div>
          <p className="text-white font-semibold mb-1">Updates</p>
          <p className="text-white/40">The app updates automatically when you open it</p>
        </div>
        <div>
          <p className="text-white font-semibold mb-1">Notifications</p>
          <p className="text-white/40">Enable notifications for real-time trade alerts</p>
        </div>
      </div>
    </div>
  </div>
</section>
       

      {/* Final Call to Action */}
      <section className="py-24 px-6">
        <div className="max-w-7xl mx-auto rounded-[4rem] bg-primary p-12 sm:p-24 relative overflow-hidden text-center text-white space-y-12 shadow-2xl shadow-primary/20">
          <div className="absolute inset-0 opacity-20 hero-pattern" />
          <div className="absolute top-0 left-1/4 w-1/2 h-full bg-white/10 blur-[100px] rounded-full -translate-y-1/2" />

          <div className="relative z-10 space-y-8 max-w-3xl mx-auto">
            <h2 className="text-4xl sm:text-7xl font-[900] tracking-tighter leading-tight italic uppercase">
              Ready to automate <br /> your <span className="text-charcoal italic">Freedom?</span>
            </h2>
            <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-6">
              <button onClick={handleInstallClick} className="w-full sm:w-auto px-12 py-6 bg-white text-primary text-xl font-black rounded-3xl shadow-2xl hover:scale-105 active:scale-95 transition-all">
                INITIALIZE NOW
              </button>
            </div>
            <p className="text-white/40 text-[10px] font-black uppercase tracking-[1em]">24/7 Global Nodes Active</p>
          </div>
        </div>
      </section>

<footer className="py-20 px-6 border-t border-white/5 text-center space-y-10">
  <div className="w-16 h-16 bg-white/5 border border-white/10 text-white rounded-[1.5rem] flex items-center justify-center mx-auto shadow-2xl">
    <img src="/MK Logo.png" alt="Logo" className="w-10 h-10 object-contain" />
  </div>
  <div className="text-[10px] font-black text-white/20 uppercase tracking-[1.2em]">
    &copy; 2026 MAATLA KEBS |{' '}
    <a 
      href="https://toporapula.vercel.app/" 
      target="_blank" 
      rel="noopener noreferrer"
      className="hover:text-primary transition-colors duration-300 hover:tracking-[1.4em] inline-block"
      onClick={(e) => {
        e.stopPropagation();
      }}
    >
      BY TOPO RAPULA
    </a>
  </div>
</footer>
    </div>
  );
};

// ── Splash Screen ─────────────────────────────────────────────────────────────

const SplashScreen = ({ onFinish, duration = 3000 }: { onFinish: () => void; duration?: number | null }) => {
  useEffect(() => {
    // Technical Pre-load Node: Ensures all assets are cached before terminal handshake
    const assets = ['/kebs.jpg', '/support.jpg', '/MK Logo.png', '/weltrade.png', '/metatrader.png'];
    assets.forEach(src => { const img = new Image(); img.src = src; });

    if (duration === null) return;
    const t = setTimeout(onFinish, duration);
    return () => clearTimeout(t);
  }, [onFinish, duration]);

  return (
    <div className="fixed inset-0 bg-[#0d0f14] z-[99999] flex flex-col items-center justify-center overflow-hidden animate-fade-in text-center h-[100vh] w-full pt-safe pb-safe">
      {/* Immersive Depth Gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#0d0f14] via-[#0d0f14]/95 to-[#0d0f14]/90" />

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

  // Dev bypass for admin testing on desktop web
  const isDev = new URLSearchParams(window.location.search).get('dev') === '1' ||
    localStorage.getItem('mk_dev') === '1';

  const hasAuthParams = window.location.hash.includes('access_token=') || 
                        window.location.search.includes('code=') ||
                        window.location.search.includes('type=recovery');

  const [view, setView] = useState<View>(isPWA ? 'SPLASH' : 'LANDING');
  const [session, setSession] = useState<Session | null>(null);
  const [booting, setBooting] = useState(true);

  // ── Session management ──
  useEffect(() => {
    const checkOnboarding = async (s: Session) => {
      try {
        // Check if user has completed onboarding
        const { data: rawData, error } = await supabase
          .from('users')
          .select('onboarding_completed')
          .eq('id', s.user.id)
          .maybeSingle();
        
        const data = rawData as any;
        
        if (error && error.code !== 'PGRST116') {
          console.error('Onboarding Check Error:', error);
        }
        
        setView(data ? (data.onboarding_completed ? 'APP' : 'ONBOARDING') : 'ONBOARDING');
      } catch (e) {
        console.error('CheckOnboarding Catch:', e);
        // Fallback to onboarding if we can't confirm app state
        setView('ONBOARDING');
      }
    };

    const initialize = async () => {
      const { data: { session: s } } = await supabase.auth.getSession();
      if (s) { 
        setSession(s); 
        await checkOnboarding(s); 
      } else {
        setView(isPWA ? 'SPLASH' : 'LANDING');
      }
      setBooting(false);
    };

    initialize();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'SIGNED_OUT') { 
        setSession(null); 
        setView('AUTH'); 
      }
      if (event === 'SIGNED_IN' && s) { 
        setSession(s); 
        checkOnboarding(s); 
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  if (booting) return <SplashScreen onFinish={() => {}} duration={null} />;

  return (
    <div className="antialiased text-white selection:bg-primary/30">
      {/* Strict PWA Enforcement: block all non-PWA access (desktop + mobile).
          Only dev bypass (?dev=1 or localStorage mk_dev=1) can access on web. */}
      {(!isPWA && !isDev) ? (
        <LandingPage isPWA={false} hasAuthParams={hasAuthParams} onLaunch={() => {}} />
      ) : (
        <>
          {view === 'LANDING' && <LandingPage isPWA={isPWA} hasAuthParams={hasAuthParams} onLaunch={() => setView('SPLASH')} />}
          {view === 'SPLASH' && <SplashScreen onFinish={() => setView('AUTH')} />}
          {view === 'AUTH' && <AuthScreen onLogin={(s?: Session) => {
            if (s) { setSession(s); setView('ONBOARDING'); return; }
            supabase.auth.getSession().then(({ data: { session: s } }) => { if (s) { setSession(s); setView('ONBOARDING'); } });
          }} />}
          {view === 'ONBOARDING' && session && <OnboardingScreen session={session} onComplete={() => setView('APP')} />}
          {view === 'APP' && session && <MainApp session={session} onDisconnect={() => { setSession(null); setView('AUTH'); }} />}
        </>
      )}
    </div>
  );
};

const container = document.getElementById('root');
if (container) createRoot(container).render(<App />);