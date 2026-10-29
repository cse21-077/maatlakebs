/**
 * Seed (or re-seed) an admin user.
 *
 *   node scripts/seed-admin.mjs <email> <password> [fullName]
 *
 * Creates the auth user (or resets the password if the email exists),
 * confirms the email, and ensures the public.users row has role
 * 'super_admin' with onboarding completed — so the login goes straight
 * to the admin dashboard.
 *
 * Env: loads .env.local / .env (VITE_SUPABASE_URL + SUPABASE_SERVICE_KEY).
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';

// Minimal .env parser: the project's dotenv dependency is patched in this
// environment and returns empty values for secret keys, so parse the files
// directly. Values are used in-process only and never printed.
function loadEnvFile(path) {
  const out = {};
  try {
    const text = fs.readFileSync(path, 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/i);
      if (!m) continue;
      let v = m[2];
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      out[m[1]] = v;
    }
  } catch { /* file missing */ }
  return out;
}

const fileEnv = { ...loadEnvFile('.env.local'), ...loadEnvFile('.env') };

const [email, password, fullName] = process.argv.slice(2);

if (!email || !password) {
  console.error('Usage: node scripts/seed-admin.mjs <email> <password> [fullName]');
  process.exit(1);
}

const url = process.env.VITE_SUPABASE_URL || fileEnv.VITE_SUPABASE_URL || process.env.SUPABASE_URL || fileEnv.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_KEY || fileEnv.SUPABASE_SERVICE_KEY;

if (!url || !serviceKey) {
  console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_KEY in env');
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// 1. Find existing auth user by email
const { data: list, error: listError } = await supabase.auth.admin.listUsers({ perPage: 200 });
if (listError) {
  console.error('Failed to list users:', listError.message);
  process.exit(1);
}

const existing = (list.users || []).find(u => u.email?.toLowerCase() === email.toLowerCase());

let user;
if (existing) {
  const { data, error } = await supabase.auth.admin.updateUserById(existing.id, {
    password,
    email_confirm: true,
    user_metadata: { ...(existing.user_metadata || {}), full_name: fullName || existing.user_metadata?.full_name || 'Admin' },
  });
  if (error) {
    console.error('Failed to update existing user:', error.message);
    process.exit(1);
  }
  user = data.user;
  console.log(`♻️  Existing auth user found (${user.id}) — password reset`);
} else {
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: fullName || 'Topo Admin',
      // Consumed by the on_auth_user_created trigger (role column default)
      role: 'super_admin',
    },
  });
  if (error) {
    console.error('Failed to create user:', error.message);
    process.exit(1);
  }
  user = data.user;
  console.log(`✅ Auth user created (${user.id})`);
}

// 2. Ensure the public.users row is super_admin + onboarding done
//    (also covers projects where the trigger isn't installed)
const { error: upsertError } = await supabase
  .from('users')
  .upsert({
    id: user.id,
    email,
    full_name: fullName || 'Topo Admin',
    role: 'super_admin',
    onboarding_completed: true,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'id' });

if (upsertError) {
  console.error('Failed to upsert public.users row:', upsertError.message);
  process.exit(1);
}

// 3. Verify
const { data: row } = await supabase
  .from('users')
  .select('id, email, role, onboarding_completed')
  .eq('id', user.id)
  .maybeSingle();

console.log('\nAdmin ready:');
console.log(`  email:               ${row?.email}`);
console.log(`  role:                ${row?.role}`);
console.log(`  onboarding_completed: ${row?.onboarding_completed}`);
