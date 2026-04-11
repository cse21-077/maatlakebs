# Maatla Kebs — Full Feature List

> **Version:** 1.0 — Production-ready MVP  
> **Stack:** React 19 + TypeScript · Vite · Tailwind CSS (CDN) · PWA  
> **Developed by:** Topo Rapula

---

## 1. Progressive Web App (PWA) Infrastructure

| Feature | Detail |
|---|---|
| **Installable** | Full `manifest.json` with `display: standalone` — installs as a native-like app on Android & iOS |
| **Service Worker** | `sw.js` — cache-first strategy, pre-caches core assets on install, cleans up stale caches on activate |
| **Offline Support** | Falls back to cached `index.html` on navigation requests when offline |
| **Runtime Caching** | Dynamic resources fetched from CDN (Tailwind, Google Fonts, esm.sh) are cached at runtime |
| **Background Sync** | `sync` event handler scaffolded for `sync-trades` tag — ready for real trade queue syncing |
| **Push Notifications** | Full `push` + `notificationclick` handler with vibration pattern, action buttons ("View Dashboard", "Close") |
| **Auto-Update Prompt** | Detects `updatefound` in service worker; prompts user to reload when a new version is available |
| **App Shortcuts** | Manifest shortcut — "Dashboard" quick-launch from the home-screen long-press menu |
| **Icons** | 192×192 and 512×512 icons, both `any` and `maskable` purpose variants registered |
| **Theme Integration** | `theme-color` meta tags for Android status bar; Apple-specific meta tags for iOS status bar & splash |
| **iOS Add-to-Home** | Full `apple-mobile-web-app-*` meta tag suite; multiple `apple-touch-icon` sizes |
| **Viewport Lock** | `maximum-scale=1.0, user-scalable=no, viewport-fit=cover` — true native feel, safe-area aware |
| **PWA Detection** | App detects its own `display-mode: standalone` / `navigator.standalone` / Android referrer to skip the landing page when already installed |

---

## 2. App Flow & Routing

The app is a single-page state machine with five views, controlled by a top-level `view` state:

```
LANDING → (user installs / launches) → SPLASH → AUTH → ONBOARDING → APP
                                                           ↑ (if already onboarded, skip)
```

| View | Purpose |
|---|---|
| `LANDING` | Public marketing page shown in the browser before install |
| `SPLASH` | 2.5-second branded splash screen shown on every cold launch after install |
| `AUTH` | Login screen; after login routes to ONBOARDING or APP depending on `localStorage` |
| `ONBOARDING` | Two-step first-run wizard (Risk Disclaimer → MT5 setup) |
| `APP` | Main tabbed application shell | lest fix

---

## 3. Landing Page

- **Hero section** — Large gradient headline *"Master the Markets with Maatla Kebs"*, animated fade-in + slide-up
- **Ambient background blobs** — Animated blur blobs for depth
- **Platform-aware install CTA:**
  - **Desktop / Android (with `beforeinstallprompt`)** — "Launch App" / "Install App" button triggering native Chrome install prompt
  - **iOS (Safari)** — Step-by-step manual "Add to Home Screen" guide: Share → Add to Home Screen → Add
  - **Android (no prompt e.g. Samsung Browser)** — Step-by-step manual guide: ⋮ Menu → Add to Home Screen → Install
  - Warning badge reminding mobile users the app requires PWA installation
- **Feature highlight cards** — Zero Custody · Real-time Sync · Native App
- **Footer** — Copyright + developer credit

---

## 4. Splash Screen

- Full-screen dark overlay (`z-index: 100`)
- Animated pulsing logo inside a gradient-bordered rounded square
- Secondary glow behind the logo (blurred pulse)
- App name + "PREMIUM COPY TRADER" tagline with delayed fade-in
- Animated loading bar (CSS `@keyframes loading` sweep)
- "BY TOPO RAPULA" watermark at bottom
- Auto-dismisses after **2.5 seconds** via `setTimeout`

---

## 5. Authentication Screen

- Email + Password form fields with icon adornments (Lucide `User`, `Lock`)
- Required field validation (HTML5 `required`)
- "Forgot password?" link (placeholder)
- **Sign In button** with animated loading spinner during fake async (1.5 s simulated latency)
- "Contact your mentor to join" call-to-action — no self-registration (invite-only model)
- Routing: if `localStorage.onboarded` exists → go straight to APP, else → ONBOARDING

---

## 6. Onboarding Wizard (2 Steps)

### Step 0 — Risk Disclaimer
- Yellow warning banner with `AlertCircle`
- Three checkbox-style acknowledgement bullets:
  1. The PWA only copies trades (no custody)
  2. User responsible for risk management
  3. Maatla Kebs is not a financial advisor
- "Accept & Continue" CTA

### Step 1 — MT5 Account Setup
- **Weltrade-exclusive enforcement** — only Weltrade-Live and Weltrade-Demo servers accepted (dropdown)
- Weltrade logo + broker info banner
- Fields: Login ID (numeric), Server (dropdown), Trading Password
- Inline server confirmation tick (green `CheckCircle` + message) when a valid server is selected
- "🔒 Credentials encrypted end-to-end" trust badge
- Validates all fields are filled before proceeding
- Saves `mt5_login` & `mt5_server` to `localStorage`
- Progress bar (2 steps) showing current position
- "Activate Trading" CTA

---

## 7. Main Application Shell

### 7.1 Header (Sticky)
- Maatla Kebs logo + app name
- **Live / Standby status pill** — animated green dot when subscription is CONFIRMED, yellow when not
- **Refresh button** — reloads the page

### 7.2 Bottom Navigation Bar
Three tabs with icon + label badge on the active tab:

| Tab ID | Icon | Label |
|---|---|---|
| `DASHBOARD` | LayoutDashboard | Control |
| `SETTINGS` | Settings | Risk |
| `PAYMENT` | CreditCard | Payment |

- Safe-area bottom padding (`env(safe-area-inset-bottom)`) for iPhone notch/home-bar
- Frosted-glass background (`backdrop-blur-xl`)
- Active tab icon scales up and gets a coloured highlight background

---

## 8. Dashboard Tab (`DASHBOARD`)

### System Protocol Card
- Context-sensitive: blue gradient when `CONFIRMED`, amber gradient when `UNPAID`/`PENDING`
- Animated Maatla Kebs logo (pulses when active)
- Status dot indicator (green pulse / yellow)
- Status text: **SYSTEM ACTIVE** or **PENDING ACTIVATION**
- Sub-status badge: "Trading Node Verified & Synced" or "Waiting for Mentor Activation"

### Call-to-Action Hint Card *(only when not CONFIRMED)*
- Alert card redirecting user to the Payment tab
- "Go to Payment" inline button

### Terminal Connection Card
- MT5 Login ID display (read from `localStorage`)
- Weltrade server name
- Connection status copy: "Active & Copying" or "Awaiting Subscription"
- **Disconnect & Swap Account** button (danger variant) with confirmation dialog — clears all `localStorage` and resets to ONBOARDING

### Account Oversight / Health Meter
- Animated cyan progress bar — 100% fill when CONFIRMED, 20% when standby
- Status label: "Optimal" or "Standby"

---

## 9. Risk Parameters Tab (`SETTINGS`)

Three interactive sliders with live value readouts:

| Slider | Range | Step | Colour |
|---|---|---|---|
| Aggressiveness | 0.1× – 2.0× | 0.1 | Blue/Primary |
| Max Allocation (Lot) | 0.1 – 5.0 | 0.1 | White |
| Hard Drawdown Limit | 5% – 50% | 5% | Red |

- Conservative / Hyper labels on aggressiveness slider
- "Emergency circuit-break" description for drawdown
- **Save Changes** button (fires `alert` — backend integration point)
- Risk Warning banner (changes to risk settings only affect new positions)

---

## 10. Subscription / Payment Tab (`PAYMENT`)

### Status Timeline
Three-step visual timeline with vertical connector line:

1. **Submit Proof of Payment** — active immediately (CreditCard icon)
2. **System Auto-Confirmation** — animates (pulse) when PENDING (Zap icon)
3. **Mentor Activation** — glows green when CONFIRMED (ShieldCheck icon)

### Payment Instructions *(when UNPAID)*
- Subscription fee: **$150 / Monthly**
- Personalised reference: `KEBS-{mt5Login}`
- "View Payment Details" external-link button

### File Upload System *(when UNPAID)*
Accepts: **JPG, PNG, WEBP, PDF** · Max **5 MB**

- Click-to-browse drag-styled upload zone
- File type + size validation with user alerts
- **Live image preview** rendered via `FileReader` API for image types
- File name, size (KB), and type badge displayed after selection
- **Change File** button to replace selected file
- **Submit** button with upload spinner (2 s simulated)
- Post-upload confirmation `alert` with file name, size, and ETA message
- Transitions state to `PENDING` and saves to `localStorage`

### Pending State
- Bouncing clock icon
- "Verification in Progress" message
- Estimated wait: **45 minutes**

### Confirmed State
- Large green glowing `CheckCircle2` icon
- "Subscription Active" confirmation
- "Go to Dashboard" navigation button

### Demo Auto-Activation
- After 15 seconds in PENDING state, status auto-transitions to CONFIRMED (demo/preview behaviour)

---

## 11. Design System & UI

| Token | Value |
|---|---|
| Primary | `#2138bc` |
| Secondary | `#133284` |
| Accent | `#4facfe` |
| Dark (background) | `#0a0e1a` |
| Card | `#161e31` |
| Font | Inter (300–700 via Google Fonts) |

### Reusable Components
- **`Button`** — 4 variants: `primary` (gradient), `outline`, `ghost`, `danger`; loading spinner state; disabled + greyscale state
- **`Card`** — Glassmorphism card (`bg-white/5 backdrop-blur border-white/10 rounded-2xl`)

### Animations

| Animation | Usage |
|---|---|
| `animate-fade-in` | Page-level transitions |
| `animate-slide-up` | Content block entrances (with `[animation-delay]`) |
| `animate-pulse` | Logo pulse, status dots |
| `animate-pulse-slow` (3 s) | Background ambient blobs |
| `animate-bounce` | Pending clock icon |
| `animate-spin` | Button loading spinner |
| Loading sweep | Splash screen progress bar |

### Accessibility & UX Polish
- `-webkit-tap-highlight-color: transparent` — no tap flash on mobile
- `selection:bg-primary/30` — branded text selection colour
- `hide-scrollbar` utility — clean scroll on inner panels
- `active:scale-95` on buttons — tactile press feedback
- `safe-bottom` padding via `env(safe-area-inset-bottom)` — iPhone-safe nav bar

---

## 12. Data Persistence (localStorage)

| Key | Value | When set |
|---|---|---|
| `onboarded` | `"true"` | On ONBOARDING completion |
| `mt5_login` | MT5 account number | ONBOARDING step 1 |
| `mt5_server` | Server name | ONBOARDING step 1 |
| `payment_status` | `UNPAID` / `PENDING` / `CONFIRMED` | On upload / auto-confirm |
| `uploaded_file` | File name | After successful upload |

All keys cleared on "Disconnect & Swap Account".

---

## 13. Tech Stack

| Layer | Technology |
|---|---|
| Framework | React 19 (with `createRoot`) |
| Language | TypeScript 5.8 |
| Build Tool | Vite 6 |
| Styling | Tailwind CSS (CDN) with custom theme config |
| Icons | Lucide React 0.563 |
| AI SDK | `@google/genai` (installed, not yet wired to UI) |
| Package Manager | pnpm |
| PWA | Custom `sw.js` + `manifest.json` |
| Hosting target | Any static HTTPS host (Vercel / Netlify recommended) |

---

## 14. What's Scaffolded but Not Yet Wired

| Item | Status |
|---|---|
| `@google/genai` SDK | Installed as dependency — no UI integration yet |
| Background Sync (`sync-trades`) | Handler registered — `syncTrades()` is a placeholder |
| Push Notifications | Full SW handler present — no backend subscription logic |
| "View Payment Details" button | Renders without a destination URL |
| "Forgot Password" button | Renders without action |
| Backend API | No live API calls — all state is local/simulated |

---

*Generated from full codebase analysis of `index.tsx`, `sw.js`, `manifest.json`, `index.html`, and project documentation — March 2026.*
