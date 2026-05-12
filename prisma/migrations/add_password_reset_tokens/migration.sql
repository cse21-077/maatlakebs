-- Migration: Create password_reset_tokens table
-- This table stores temporary OTP tokens for password resets

CREATE TABLE IF NOT EXISTS auth.password_reset_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  otp_hash VARCHAR(255) NOT NULL,
  otp_attempts INT DEFAULT 0,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '15 minutes'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  CONSTRAINT otp_attempts_check CHECK (otp_attempts >= 0 AND otp_attempts <= 5)
);

CREATE INDEX idx_password_reset_tokens_expires_at ON auth.password_reset_tokens(expires_at);
CREATE INDEX idx_password_reset_tokens_user_id ON auth.password_reset_tokens(user_id);
