-- AlterTable invoices to add discount and mentor payment fields
ALTER TABLE "public"."invoices" ADD COLUMN "original_price" NUMERIC,
ADD COLUMN "discount_amount" NUMERIC,
ADD COLUMN "payment_method" TEXT NOT NULL DEFAULT 'crypto',
ADD COLUMN "proof_of_payment_url" TEXT,
ADD COLUMN "mentor_id" UUID;

-- Create index for payment_method for faster queries
CREATE INDEX "invoices_payment_method_idx" ON "public"."invoices"("payment_method");

-- Update payment_status comment to include 'proof_submitted' state
COMMENT ON COLUMN "public"."invoices"."payment_status" IS 'pending, confirmed, failed, cancelled, proof_submitted';
