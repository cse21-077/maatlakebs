// ─────────────────────────────────────────────────────────────────────────────
// Maatla Kebs — Supabase Database Types
// GENERATED FROM THE REAL SCHEMA (10 TABLES)
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
      // ── users (public.users) ──────────────────────────────────────────────────
      users: {
        Row: {
          id: string;
          email: string;
          role: 'student' | 'trader' | 'super_admin';
          full_name: string | null;
          trader_id: string | null;
          onboarding_completed: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['users']['Row'], 'created_at' | 'updated_at'>;
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
          folder_path: string | null;
          is_active: boolean;
          is_ghost: boolean;
          ghost_owner: string | null;
          show_in_roster: boolean;
          trader_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['student_accounts']['Row'], 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['student_accounts']['Insert']>;
      };

      // ── payment_status ──────────────────────────────────────────────────────
      payment_status: {
        Row: {
          id: string;
          user_id: string;
          subscription_status: 'trial' | 'active' | 'overdue' | 'cancelled';
          last_paid: string | null;
          next_due: string | null;
          binance_order_id: string | null;
          amount_paid: number | null;
          currency: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['payment_status']['Row'], 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['payment_status']['Insert']>;
      };

      // ── connection_status ──────────────────────────────────────────────────
      connection_status: {
        Row: {
          id: string;
          user_id: string;
          mt5_status: 'CONNECTED' | 'DISCONNECTED' | 'ERROR' | 'UNKNOWN';
          last_checked: string | null;
          error_message: string | null;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['connection_status']['Row'], 'id' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['connection_status']['Insert']>;
      };

      // ── risk_profiles ───────────────────────────────────────────────────────
      risk_profiles: {
        Row: {
          id: string;
          user_id: string;
          aggressiveness: number;
          max_lot: number;
          max_drawdown: number;
          min_balance: number;
          pause_copy: boolean;
          advanced_options: Json;
          overleverage_max_lot: number;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['risk_profiles']['Row'], 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['risk_profiles']['Insert']>;
      };

      // ── mentor_heartbeat ────────────────────────────────────────────────────
      mentor_heartbeat: {
        Row: {
          id: string;
          trader_id: string;
          last_seen: string;
          status: 'ONLINE' | 'WARNING' | 'OFFLINE';
          consecutive_misses: number;
          total_pings_today: number;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['mentor_heartbeat']['Row'], 'id' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['mentor_heartbeat']['Insert']>;
      };

      // ── trade_logs ──────────────────────────────────────────────────────────
      trade_logs: {
        Row: {
          id: string;
          user_id: string;
          mentor_ticket: string;
          student_ticket: string | null;
          symbol: string;
          order_type: string;
          volume: number | null;
          entry_price: number | null;
          stop_loss: number | null;
          take_profit: number | null;
          status: 'success' | 'failed' | 'retried' | 'skipped' | 'skipped_scale_in_not_opted_in' | 'skipped_hedge_not_opted_in' | 'skipped_overleverage_not_opted_in';
          strategy_type: 'normal' | 'scale_in' | 'hedge' | 'overleverage';
          error_message: string | null;
          executed_at: string;
        };
        Insert: Omit<Database['public']['Tables']['trade_logs']['Row'], 'id' | 'executed_at'>;
        Update: Partial<Database['public']['Tables']['trade_logs']['Insert']>;
      };

      // ── system_events ──────────────────────────────────────────────────────
      system_events: {
        Row: {
          id: string;
          event_type: string;
          actor_id: string | null;
          payload: Json | null;
          severity: 'info' | 'warning' | 'error' | 'critical';
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['system_events']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['system_events']['Insert']>;
      };

      // ── system_flags ───────────────────────────────────────────────────────
      system_flags: {
        Row: {
          key: string;
          value: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: Omit<Database['public']['Tables']['system_flags']['Row'], 'updated_at'>;
        Update: Partial<Database['public']['Tables']['system_flags']['Insert']>;
      };

      // ── invoices ────────────────────────────────────────────────────────────
      invoices: {
        Row: {
          id: string;
          user_id: string;
          invoice_id: string;
          token_id: string | null;
          price_amount: string;
          price_currency: string;
          pay_currency: string | null;
          payment_status: string;
          subscription_plan: string;
          paid_for_month: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['invoices']['Row'], 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['invoices']['Insert']>;
      };

      // ── dead_letter_queue ────────────────────────────────────────────────────
      dead_letter_queue: {
        Row: {
          id: string;
          task_id: string;
          user_id: string | null;
          signal_payload: Json;
          error: string;
          retry_count: number;
          resolved: boolean;
          resolved_by: string | null;
          created_at: string;
          resolved_at: string | null;
        };
        Insert: Omit<Database['public']['Tables']['dead_letter_queue']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['dead_letter_queue']['Insert']>;
      };
    };

    Views: {
      v_last_signal_summary: {
        Row: {
          trader_id: string;
          mentor_ticket: string;
          total_accounts: number;
          successful: number;
          retried: number;
          failed: number;
          skipped: number;
          signal_time: string;
        };
      };
      v_revenue_overview: {
        Row: {
          total_students: number;
          active_subscriptions: number;
          overdue_subscriptions: number;
          trial_accounts: number;
          ghost_accounts: number;
          monthly_gross_revenue_usd: number;
        };
      };
      v_trader_roster: {
        Row: {
          user_id: string;
          full_name: string;
          email: string;
          mt5_login: string;
          mt5_server: string;
          is_active: boolean;
          trader_id: string;
          mt5_status: string;
          last_checked: string;
          connection_error: string;
          subscription_status: string;
          next_due: string;
          pause_copy: boolean;
          aggressiveness: number;
          last_trade_at: string;
        };
      };
    };
    Functions: {};
  };
};

export type UserRow = Database['public']['Tables']['users']['Row'];
export type StudentAccountRow = Database['public']['Tables']['student_accounts']['Row'];
export type PaymentStatusRow = Database['public']['Tables']['payment_status']['Row'];
export type ConnectionStatusRow = Database['public']['Tables']['connection_status']['Row'];
export type RiskProfileRow = Database['public']['Tables']['risk_profiles']['Row'];
export type MentorHeartbeatRow = Database['public']['Tables']['mentor_heartbeat']['Row'];
export type TradeLogRow = Database['public']['Tables']['trade_logs']['Row'];
export type InvoiceRow = Database['public']['Tables']['invoices']['Row'];

export type SubscriptionStatus = PaymentStatusRow['subscription_status'];
export type ConnectionState = ConnectionStatusRow['mt5_status'];
export type HeartbeatStatus = MentorHeartbeatRow['status'];

export const DEFAULT_TRADER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
