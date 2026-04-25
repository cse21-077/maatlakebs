# Google Authentication Setup Checklist

## ✅ What's Already Implemented

### 1. Frontend Code is Ready
- **AuthScreen.tsx** has the Google button
- **handleSocialLogin()** function calls `supabase.auth.signInWithOAuth()`
- **Session management** in index.tsx handles OAuth flow correctly
- **Supabase client** configured with `detectSessionInUrl: true`

### 2. Environment Variables Set
- `VITE_SUPABASE_URL` ✅
- `VITE_SUPABASE_ANON_KEY` ✅

---

## ❌ What's Missing (Need to Verify)

### 1. **Supabase Console - Google Provider Configuration**

You need to enable Google OAuth in your Supabase project:

**Steps:**
1. Go to [Supabase Dashboard](https://app.supabase.com)
2. Select your project: `yrnjemftbqwvbvknlxol`
3. Navigate to: **Authentication → Providers → Google**
4. Click **Enable Google Provider**
5. You'll need:
   - **Google Client ID** (from Google Cloud Console)
   - **Google Client Secret** (from Google Cloud Console)

### 2. **Google Cloud Console Setup**

**Steps to get Google credentials:**

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create or select a project
3. Go to **APIs & Services → OAuth consent screen**
   - Configure the consent screen (app name, user data, etc.)
   - Add scopes: `email`, `profile`, `openid`
4. Go to **APIs & Services → Credentials**
   - Click **Create Credentials → OAuth client ID**
   - Choose **Web application**
   - Add authorized redirect URIs:
     ```
     https://yrnjemftbqwvbvknlxol.supabase.co/auth/v1/callback
     https://localhost:5173/auth/v1/callback (for local testing)
     ```
   - Copy the **Client ID** and **Client Secret**

### 3. **Add Credentials to Supabase**

Back in Supabase:
1. In the **Google Provider** settings, paste:
   - `Client ID`
   - `Client Secret`
2. Click **Save**

### 4. **Authorized Redirect URLs**

Make sure these are in your Supabase project settings:

**Authentication → URL Configuration:**
- Site URL: `https://yourdomain.com`
- Redirect URLs:
  ```
  https://yourdomain.com/
  https://yourdomain.com/auth/v1/callback
  https://localhost:5173/ (local dev)
  https://localhost:5173/auth/v1/callback (local dev)
  ```

---

## 🧪 Testing the Google Login

### Local Testing:
1. Run your dev server: `npm run dev`
2. You should see it at: `http://localhost:5173`
3. Click "Continue with Google"
4. You'll be redirected to Google sign-in
5. After signing in, you'll redirect back to the app

### Production Testing:
Once deployed, the redirect URL will be your live domain.

---

## 🔍 Debugging Tips

If Google login doesn't work:

**1. Check browser console for errors:**
```
Look for: OAuth, redirect, session, authentication errors
```

**2. Check Supabase logs:**
- Supabase Dashboard → Authentication → Logs
- Look for error messages

**3. Verify redirect URL matches exactly:**
- Google must redirect to: `https://yourdomain.com/auth/v1/callback`
- This is handled automatically by `detectSessionInUrl: true`

**4. Check if cookies are enabled**
- Browser cookies must be enabled for session persistence

**5. Test with incognito/private mode**
- Helps rule out cache issues

---

## ✨ Current Frontend Flow (Already Working)

```
User clicks "Continue with Google"
    ↓
handleSocialLogin('google') triggers
    ↓
supabase.auth.signInWithOAuth({
    provider: 'google',
    redirectTo: window.location.origin
})
    ↓
Browser redirects to Google login
    ↓
User authenticates with Google
    ↓
Google redirects back to: https://yourdomain.com/#...session...
    ↓
supabase client detects session in URL (detectSessionInUrl: true)
    ↓
onAuthStateChange fires with SIGNED_IN event
    ↓
setSession(s) updates state
    ↓
App navigates to ONBOARDING
```

---

## 📋 Verification Checklist

- [ ] Google provider enabled in Supabase
- [ ] Google Client ID added to Supabase
- [ ] Google Client Secret added to Supabase
- [ ] Authorized redirect URL in Google Cloud: `https://yrnjemftbqwvbvknlxol.supabase.co/auth/v1/callback`
- [ ] Site URL in Supabase matches your domain
- [ ] Redirect URLs added to Supabase URL Configuration
- [ ] Testing on http://localhost:5173 (local)
- [ ] Testing on your live domain
- [ ] Cookies enabled in browser
- [ ] No CORS errors in console

---

## 🚀 Next Steps

1. **Get Google credentials** from Google Cloud Console
2. **Add them to Supabase** console
3. **Test locally** with `npm run dev`
4. **Deploy and test** on production

All the frontend code is already ready—you just need to configure the OAuth providers!
