// ─────────────────────────────────────────────────────────────────────────────
// Maatla Kebs — Supabase Database Types
// Run `npx supabase gen types typescript --project-id YOUR_PROJECT_ID > lib/database.types.ts`
// to regenerate from your live schema.
// ─────────────────────────────────────────────────────────────────────────────

export type Json =
    | string
    | number
    | boolean
    | null
    | { [key: string]: Json | undefined }
    | Json[];

export type Database = {
    public: {
        Tables: {
            // ── users ──────────────────────────────────────────────────────────────
            users: {
                Row: {
                    id: string;
                    full_name: string | null;
                    email: string;
                    role: 'student' | 'trader' | 'super_admin';
                    trader_id: string | null;
                    referral_code: string | null;
                    created_at: string;
                };
                Insert: Omit<Database['public']['Tables']['users']['Row'], 'created_at'>;
                Update: Partial<Database['public']['Tables']['users']['Insert']>;
            };

            // ── student_accounts ───────────────────────────────────────────────────
            student_accounts: {
                Row: {
                    id: string;
                    user_id: string;
                    mt5_login: string;
                    mt5_server: string;
                    encrypted_password: string;
                    is_active: boolean;
                    trader_id: string | null;
                    created_at: string;
                };
                Insert: Omit<Database['public']['Tables']['student_accounts']['Row'], 'id' | 'created_at'>;
                Update: Partial<Database['public']['Tables']['student_accounts']['Insert']>;
            };

            // ── payment_status ─────────────────────────────────────────────────────
            payment_status: {
                Row: {
                    id: string;
                    user_id: string;
                    subscription_status: 'active' | 'trial' | 'overdue' | 'cancelled';
                    next_due: string | null;
                    updated_at: string;
                };
                Insert: Omit<Database['public']['Tables']['payment_status']['Row'], 'id' | 'updated_at'>;
                Update: Partial<Database['public']['Tables']['payment_status']['Insert']>;
            };

            // ── connection_status ──────────────────────────────────────────────────
            connection_status: {
                Row: {
                    id: string;
                    user_id: string;
                    status: 'CONNECTED' | 'DISCONNECTED' | 'ERROR';
                    last_ping: string | null;
                    error_message: string | null;
                };
                Insert: Omit<Database['public']['Tables']['connection_status']['Row'], 'id'>;
                Update: Partial<Database['public']['Tables']['connection_status']['Insert']>;
            };

            // ── risk_profiles ──────────────────────────────────────────────────────
            risk_profiles: {
                Row: {
                    id: string;
                    user_id: string;
                    aggressiveness: number;
                    max_lot: number;
                    max_drawdown: number;
                    pause_copy: boolean;
                    updated_at: string;
                };
                Insert: Omit<Database['public']['Tables']['risk_profiles']['Row'], 'id' | 'updated_at'>;
                Update: Partial<Database['public']['Tables']['risk_profiles']['Insert']>;
            };
        };

        Functions: {
            // Edge function responses — typed for convenience
        };
    };
};

// ── Convenience row types ────────────────────────────────────────────────────
export type UserRow = Database['public']['Tables']['users']['Row'];
export type StudentAccountRow = Database['public']['Tables']['student_accounts']['Row'];
export type PaymentStatusRow = Database['public']['Tables']['payment_status']['Row'];
export type ConnectionStatusRow = Database['public']['Tables']['connection_status']['Row'];
export type RiskProfileRow = Database['public']['Tables']['risk_profiles']['Row'];

export type SubscriptionStatus = PaymentStatusRow['subscription_status'];
export type ConnectionState = ConnectionStatusRow['status'];
