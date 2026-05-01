# Payment Feature Implementation - Complete Guide

## 📋 What Has Been Built

### 1. **Database Schema Updates** ✅
**File:** `prisma/schema.prisma`
**Migration:** `prisma/migrations/add_invoice_discount_mentor_fields/migration.sql`

New fields added to `invoices` table:
- `original_price` - Original price before discount (e.g., $150)
- `discount_amount` - Discount amount (e.g., $50)
- `payment_method` - 'crypto' or 'mentor'
- `proof_of_payment_url` - URL to uploaded proof file in Supabase Storage
- `mentor_id` - ID of mentor who facilitated payment (optional)

### 2. **Frontend - Payment Widget** ✅
**File:** `components/PaymentWidget.tsx`

Features:
- **Discount Display:** Shows "was $150, now $100" with % OFF badge
- **Payment Method Selection:** Two tabs - "Crypto Payment" or "Paid via Mentor"
- **Mentor Payment Flow:**
  - File upload for proof of payment (images/PDF, max 5MB)
  - Automatic upload to Supabase Storage
  - Sets invoice status to `proof_submitted` for admin review

### 3. **Admin Dashboard Component** ✅
**File:** `components/AdminPaymentReview.tsx`

Features:
- Lists all pending mentor payment proofs
- Shows user info, plan, amount, discount, and submission date
- Preview modal to view proof of payment (images or PDFs)
- **Approve Button:** Activates subscription for 30 days immediately
- **Reject Button:** Rejects payment and removes proof from storage
- Automatic refresh after each action
- Toast notifications for success/error

### 4. **Admin API Endpoints** ✅

#### Get Pending Payments
**File:** `api/admin/pending-payments.js`
**Route:** `GET /api/admin/pending-payments?admin_id={uuid}`

Returns all invoices with:
- `payment_status = 'proof_submitted'`
- `payment_method = 'mentor'`
- Enriched with user information

#### Approve/Reject Payment
**File:** `api/admin/approve-payment.js`
**Route:** `POST /api/admin/approve-payment`

Request body:
```json
{
  "invoice_id": "uuid",
  "action": "approve" | "reject",
  "admin_id": "uuid"
}
```

Actions:
- **Approve:**
  - Updates invoice `payment_status` to `confirmed`
  - Creates/updates `payment_status` record
  - Activates subscription for 30 days
  - Sets `next_due` date to +30 days from now
  
- **Reject:**
  - Updates invoice `payment_status` to `rejected`
  - Deletes proof file from Supabase Storage

### 5. **Webhook Updates** ✅
**File:** `api/webhooks/nowpayments.js`

Changes:
- Updated payment status to lowercase `'confirmed'` (consistency)
- Changed billing period from 1 month to 30 days
- Now properly stores `payment_method: 'crypto'`

---

## 🚀 Next Steps to Deploy

### Step 1: Apply Database Migration

Run Prisma migration to add new columns:
```bash
npx prisma migrate deploy
```

Generate updated Prisma types:
```bash
npx prisma generate
```

Commit changes:
```bash
git add prisma/
git commit -m "feat: add mentor payment and discount fields to invoices"
```

### Step 2: Create Supabase Storage Bucket

1. Go to **Supabase Dashboard** → **Storage**
2. Click **Create a new bucket**
3. Name: `proofofpay`
4. Visibility: **Public**
5. Click **Create bucket**

#### Configure RLS Policies

**For public read access (SELECT):**
```sql
true
```

**For user uploads (INSERT):**
```sql
auth.uid()::text = (storage.foldername(name))[1]
```

### Step 3: Add Admin Flag to Users (if not exists)

Check if your `public_users` table has `is_admin` field:
```sql
SELECT column_name FROM information_schema.columns 
WHERE table_name='public_users' AND column_name='is_admin';
```

If missing, add it:
```sql
ALTER TABLE "public"."public_users" 
ADD COLUMN "is_admin" BOOLEAN NOT NULL DEFAULT false;
```

Set yourself as admin:
```sql
UPDATE "public"."public_users" 
SET "is_admin" = true 
WHERE email = 'your-admin-email@example.com';
```

### Step 4: Integrate Admin Dashboard Component

Add to your admin/dashboard page:

```typescript
import { AdminPaymentReview } from '../components/AdminPaymentReview';

export const AdminDashboard = () => {
  const { user } = useAuth(); // Your auth hook
  
  return (
    <div>
      {/* Other admin sections */}
      <AdminPaymentReview adminId={user?.id} />
    </div>
  );
};
```

### Step 5: Update Environment Variables

Ensure Vercel/hosting has these env vars:
```
VITE_SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_KEY=your_service_role_key
NOW_PAYMENTS_IPN_SECRET=your_secret
VITE_APP_URL=your_app_url
```

---

## 📊 User Flow

### Mentor Payment Flow
```
1. User selects plan → Sees discount pricing
2. User chooses "Paid via Mentor" payment method
3. User uploads proof of payment file
4. System uploads to Supabase Storage
5. Invoice created with status: proof_submitted
6. Admin receives notification to review
7. Admin views proof and clicks "Approve"
8. Subscription activated for 30 days
9. User can now access full features
```

### Crypto Payment Flow (unchanged)
```
1. User selects plan → Sees discount pricing
2. User chooses "Crypto Payment" method
3. System creates NowPayments invoice
4. User completes payment in popup window
5. NowPayments webhook confirms payment
6. Subscription activated for 30 days
```

---

## 🔒 Security Notes

1. **Admin Verification:** All admin endpoints check `public_users.is_admin` flag
2. **File Uploads:** 
   - Only images and PDFs allowed
   - Max 5MB file size
   - Stored in user-specific folders
   - RLS policies restrict access
3. **Subscription Activation:** 
   - Both payment methods follow same logic
   - Uses 30-day billing cycle
   - Updates `payment_status` table atomically

---

## 📝 Database Queries - Admin Use

View pending approvals:
```sql
SELECT id, user_id, price_amount, subscription_plan, created_at
FROM invoices
WHERE payment_status = 'proof_submitted' AND payment_method = 'mentor'
ORDER BY created_at DESC;
```

View approved mentor payments:
```sql
SELECT id, user_id, price_amount, subscription_plan, created_at
FROM invoices
WHERE payment_status = 'confirmed' AND payment_method = 'mentor'
ORDER BY created_at DESC;
```

View user subscription status:
```sql
SELECT user_id, subscription_status, last_paid, next_due
FROM payment_status
WHERE user_id = 'user_uuid_here';
```

---

## 🐛 Troubleshooting

| Issue | Solution |
|-------|----------|
| "Upload failed: bucket not found" | Verify bucket name is exactly `proofofpay` |
| "Not authorized as admin" | Ensure user has `is_admin = true` in `public_users` |
| "File uploads but URL inaccessible" | Check SELECT RLS policy is set to `true` |
| "Subscription not activated" | Verify `payment_status` record exists for user |
| "Approval endpoint returns 500" | Check SUPABASE_SERVICE_KEY is valid in env vars |

---

## 📱 Testing

### Test Mentor Payment Approval
1. Create a test user account
2. Upload a payment proof (test image)
3. Note the invoice ID from DB
4. Call approve endpoint with test admin ID
5. Verify subscription activated (check payment_status table)

### Test Discount Display
1. Open payment widget
2. Verify plans show: ~~$150~~ $100 with badge
3. Calculate discount correctly

### Test File Upload
1. Try uploading different file types
2. Try files > 5MB (should fail)
3. Verify files appear in Supabase Storage

---

## 🔄 Next Features to Consider

1. **Payment Proof Cleanup:** Auto-delete unverified proofs after 30 days
2. **Email Notifications:** Notify user when payment is approved
3. **Payment History:** Show users their payment history with discounts
4. **Bulk Approval:** Admin bulk approve multiple payments
5. **Custom Discount Rules:** Set different discounts per plan/period
6. **Automated Mentor Verification:** Auto-approve from trusted mentors

---

Generated: May 1, 2026
