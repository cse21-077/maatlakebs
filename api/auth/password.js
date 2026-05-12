/**
 * POST /api/auth/password
 * Unified password management endpoint
 * 
 * Actions:
 * - "request-otp": Request OTP for password reset (body: { email })
 * - "verify-otp": Verify OTP and get reset token (body: { email, otp })
 * - "reset-password": Reset password with token (body: { email, resetToken, newPassword })
 * - "change-password": Change password while logged in (body: { currentPassword, newPassword }, requires Authorization header)
 */

import crypto from 'crypto';
import pg from 'pg';
import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'crypto';

const { Client } = pg;

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

function createDbClient() {
  return new Client({
    connectionString: process.env.DATABASE_URL,
  });
}

function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function hashOTP(otp) {
  return crypto.createHash('sha256').update(otp).digest('hex');
}

function generateResetToken() {
  return randomBytes(32).toString('hex');
}

async function sendOTPEmail(email, otp, userName = '') {
  try {
    console.log(`[OTP] Sending OTP ${otp} to ${email}`);
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[OTP] DEV MODE - OTP for ${email}: ${otp}`);
    }
    return true;
  } catch (error) {
    console.error('Failed to send OTP email:', error);
    return false;
  }
}

// ── Action: Request OTP ──
async function handleRequestOTP(email, client) {
  const normalizedEmail = email.toLowerCase().trim();

  const userResult = await client.query(
    'SELECT id FROM auth.users WHERE email = $1',
    [normalizedEmail]
  );

  if (userResult.rows.length === 0) {
    return { 
      success: true, 
      message: 'If an account exists with this email, you will receive a password reset OTP shortly.' 
    };
  }

  const userId = userResult.rows[0].id;
  const otp = generateOTP();
  const otpHash = hashOTP(otp);

  await client.query(
    `INSERT INTO public.password_reset_tokens (user_id, otp_hash)
     VALUES ($1, $2)
     ON CONFLICT (user_id) DO UPDATE 
     SET otp_hash = $2, otp_attempts = 0, expires_at = now() + interval '15 minutes', created_at = now()`,
    [userId, otpHash]
  );

  const emailSent = await sendOTPEmail(normalizedEmail, otp);
  if (!emailSent && process.env.NODE_ENV === 'production') {
    throw new Error('Failed to send OTP email');
  }

  return { 
    success: true, 
    message: 'If an account exists with this email, you will receive a password reset OTP shortly.' 
  };
}

// ── Action: Verify OTP ──
async function handleVerifyOTP(email, otp, client) {
  if (!otp || otp.length !== 6) {
    throw new Error('Please enter a valid 6-digit OTP');
  }

  const normalizedEmail = email.toLowerCase().trim();
  const otpHash = hashOTP(otp);

  const userResult = await client.query(
    'SELECT id FROM auth.users WHERE email = $1',
    [normalizedEmail]
  );

  if (userResult.rows.length === 0) {
    throw new Error('Invalid email or OTP');
  }

  const userId = userResult.rows[0].id;

  const tokenResult = await client.query(
    `SELECT otp_hash, otp_attempts, expires_at 
     FROM public.password_reset_tokens 
     WHERE user_id = $1 AND expires_at > now()`,
    [userId]
  );

  if (tokenResult.rows.length === 0) {
    throw new Error('OTP expired or not found');
  }

  const token = tokenResult.rows[0];
  const maxAttempts = 5;

  if (token.otp_attempts >= maxAttempts) {
    throw new Error('Too many failed attempts. Request a new OTP.');
  }

  if (token.otp_hash !== otpHash) {
    await client.query(
      'UPDATE public.password_reset_tokens SET otp_attempts = otp_attempts + 1 WHERE user_id = $1',
      [userId]
    );
    throw new Error('Invalid OTP');
  }

  const resetToken = generateResetToken();
  const resetTokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');

  await client.query(
    `UPDATE public.password_reset_tokens 
     SET otp_attempts = 0, otp_hash = $2 
     WHERE user_id = $1`,
    [userId, resetTokenHash]
  );

  return { 
    success: true, 
    resetToken,
    expiresIn: 900 // 15 minutes
  };
}

// ── Action: Reset Password ──
async function handleResetPassword(email, resetToken, newPassword, client) {
  if (newPassword.length < 8) {
    throw new Error('Password must be at least 8 characters');
  }

  const normalizedEmail = email.toLowerCase().trim();
  const resetTokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');

  const userResult = await client.query(
    'SELECT id FROM auth.users WHERE email = $1',
    [normalizedEmail]
  );

  if (userResult.rows.length === 0) {
    throw new Error('Invalid request');
  }

  const userId = userResult.rows[0].id;

  const tokenResult = await client.query(
    `SELECT expires_at FROM public.password_reset_tokens 
     WHERE user_id = $1 AND expires_at > now()`,
    [userId]
  );

  if (tokenResult.rows.length === 0) {
    throw new Error('Reset token expired');
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  
  const { error: updateError } = await supabase.auth.admin.updateUserById(
    userId,
    { password: newPassword }
  );

  if (updateError) {
    throw new Error('Failed to update password');
  }

  await client.query(
    'DELETE FROM public.password_reset_tokens WHERE user_id = $1',
    [userId]
  );

  return { 
    success: true, 
    message: 'Password reset successfully. Please login with your new password.' 
  };
}

// ── Action: Change Password ──
async function handleChangePassword(currentPassword, newPassword, token, client) {
  if (newPassword.length < 8) {
    throw new Error('New password must be at least 8 characters');
  }

  if (currentPassword === newPassword) {
    throw new Error('New password must be different from current password');
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { data: { user }, error: getUserError } = await supabase.auth.getUser(token);

  if (getUserError || !user) {
    throw new Error('Invalid or expired session');
  }

  const userId = user.id;
  const userEmail = user.email;

  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: userEmail,
    password: currentPassword
  });

  if (signInError) {
    throw new Error('Current password is incorrect');
  }

  const { error: updateError } = await supabase.auth.admin.updateUserById(
    userId,
    { password: newPassword }
  );

  if (updateError) {
    throw new Error('Failed to update password');
  }

  return { 
    success: true, 
    message: 'Password changed successfully.' 
  };
}

// ── Main Handler ──
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let client;
  try {
    const { action, email, otp, resetToken, newPassword, currentPassword } = req.body;

    if (!action) {
      return res.status(400).json({ error: 'Action is required' });
    }

    client = createDbClient();
    await client.connect();

    let result;

    switch (action) {
      case 'request-otp':
        if (!email) return res.status(400).json({ error: 'Email is required' });
        result = await handleRequestOTP(email, client);
        break;

      case 'verify-otp':
        if (!email || !otp) return res.status(400).json({ error: 'Email and OTP are required' });
        result = await handleVerifyOTP(email, otp, client);
        break;

      case 'reset-password':
        if (!email || !resetToken || !newPassword) {
          return res.status(400).json({ error: 'Email, reset token, and new password are required' });
        }
        result = await handleResetPassword(email, resetToken, newPassword, client);
        break;

      case 'change-password':
        if (!currentPassword || !newPassword) {
          return res.status(400).json({ error: 'Current and new passwords are required' });
        }
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          return res.status(401).json({ error: 'Unauthorized' });
        }
        const token = authHeader.slice(7);
        result = await handleChangePassword(currentPassword, newPassword, token, client);
        break;

      default:
        return res.status(400).json({ error: 'Invalid action' });
    }

    await client.end();
    return res.status(200).json(result);

  } catch (error) {
    console.error('[auth/password] Error:', error);
    if (client) await client.end();
    return res.status(error.message?.includes('not found') || error.message?.includes('Invalid') || error.message?.includes('incorrect') ? 400 : 500).json({ 
      error: error.message || 'Internal server error' 
    });
  }
}
