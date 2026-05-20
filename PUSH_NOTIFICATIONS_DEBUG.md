# Push Notification Debugging Guide

## What Was Fixed

1. **`/api/send-push.js`** - Rewrote with:
   - Fallback: tries simple `text/plain` push first (more reliable)
   - Fallback: tries VAPID-signed push if simple fails
   - **Detailed logging** at every step to see what's happening
   - Proper error messages instead of silent failures

2. **`TechSupportDashboard.tsx`** - Added:
   - Console logging when push is triggered
   - Error handling & logging for push response
   - Push failures won't block message sending (non-blocking)

3. **`SupportProtocol.tsx`** - Already has:
   - Detailed `subscribeToPush()` logging
   - Service worker push event logging in `public/sw.js`

## How to Debug

### Step 1: Check Browser Console (User/Client Side)
When a user opens the Support chat, watch the browser console for:

```
[Push] Permission status: granted
[Push] Service worker ready
[Push] Successfully subscribed: {...}
[Push] Subscription saved to Supabase
```

**Issue:** If you see permission denied or errors, the subscription failed.
**Fix:** Check browser notification permissions for your domain.

### Step 2: Check Vercel Logs (Admin Side)
When admin sends a message, check Vercel function logs for:

```
[Push] Request received
[Push] Payload: { user_id: "...", title: "Support Reply", bodyLen: 42 }
[Push] Fetching subscription for user: ...
[Push] Subscription found, endpoint: https://...
[Push] Attempting simple text/plain push...
[Push] Response status: 201
[Push] ✅ Notification sent successfully (simple)
```

**To view logs:**
1. Go to https://vercel.com/dashboard
2. Select your project
3. Click "Functions" tab
4. Click `/api/send-push`
5. Look for recent requests

**Status codes:**
- `201` = Success ✅
- `400` = Bad request (check payload)
- `401` = Unauthorized (VAPID issue)
- `404` = Subscription expired/not found
- `410` = Subscription permanently invalid

### Step 3: Check Admin Console (TechSupportDashboard)
When admin sends a reply, the admin's browser console shows:

```
[Admin] Sending push notification to user: ...
[Admin] ✅ Push notification sent successfully: {success: true, method: "simple"}
```

OR

```
[Admin] ❌ Push notification error: Network error
```

### Step 4: Check Environment Variables
Make sure `VAPID_PRIVATE_KEY` is set in Vercel (optional but helps as fallback):

1. Go to https://vercel.com/dashboard
2. Select project → Settings → Environment Variables
3. Look for `VAPID_PRIVATE_KEY`

If not set, the endpoint will try simple push (which often works anyway).

## Common Issues & Fixes

### Issue: "No push subscription for this user"
**Problem:** User never subscribed to notifications
**Fix:** 
- User must open Support chat
- Grant notification permission when prompted
- Check browser console for `[Push] Successfully subscribed`

### Issue: User subscribed but push still fails
**Problem:** Subscription endpoint is invalid/expired
**Fix:**
- The subscription is automatically cleaned up after 410/404 errors
- User must re-open Support chat to re-subscribe
- Check "Application" tab in browser DevTools → Service Workers

### Issue: Push fails with VAPID errors
**Problem:** `VAPID_PRIVATE_KEY` is misconfigured or missing
**Fix:**
- Set `VAPID_PRIVATE_KEY` in Vercel environment variables
- Or remove it entirely (simple push method will be used)

### Issue: Notifications appear but don't focus app
**Problem:** Service worker not properly installed
**Fix:**
- Hard refresh browser (Ctrl+Shift+R or Cmd+Shift+R)
- Clear service workers: DevTools → Application → Service Workers → Unregister
- Clear cache: DevTools → Application → Cache Storage → Delete all
- Reload page

## Testing Push Notifications

1. **Open 2 windows:**
   - Window A: User logged in (on Support chat - to enable push)
   - Window B: Admin logged in (TechSupportDashboard)

2. **In Window A (User):**
   - Open Support chat
   - Check browser console for `[Push] Successfully subscribed`
   - Minimize or switch away from window

3. **In Window B (Admin):**
   - Find user in support tickets
   - Send a test message
   - Check console for `[Admin] ✅ Push notification sent`
   - Check Vercel function logs

4. **Expected result:**
   - Notification appears on user's device (even if tab not focused)
   - Clicking notification focuses/opens the Support chat

## Additional Notes

- Push notifications work on HTTPS only (not localhost)
- Must be a real domain (not IP address)
- Service Worker must be properly registered
- User must grant browser notification permission
- Some browsers/networks may block push (corporate firewalls, etc.)

If none of this works, check:
- Browser DevTools → Application → Service Workers (registered?)
- Browser DevTools → Application → Manifest (properly configured?)
- Network tab → see if fetch to `/api/send-push` succeeds
- Vercel function logs for detailed error messages
