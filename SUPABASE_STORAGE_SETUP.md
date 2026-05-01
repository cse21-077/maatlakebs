# Supabase Storage Setup for Payment Proofs

## Overview
To enable file uploads for mentor payment proofs, you need to configure Supabase Storage with proper RLS (Row Level Security) policies.

## Step 1: Create Storage Bucket

1. Go to your **Supabase Dashboard** > **Storage**
2. Click **Create a new bucket**
3. Name it: `proofofpay`
4. Set visibility: **Public** (since we want to serve the proof files)
5. Click **Create bucket**

## Step 2: Configure RLS Policies

After creating the bucket, set up the following RLS policies:

### Policy 1: Users can upload files to their own folder

Go to **Storage** > **proofofpay** > **Policies** > **New Policy**

**For INSERT:**
```
auth.uid()::text = (storage.foldername(name))[1]
```

This allows authenticated users to upload files to a folder named with their user ID.

### Policy 2: Public Read Access

Go to **Storage** > **proofofpay** > **Policies** > **New Policy**

**For SELECT:**
```
true
```

This allows anyone to read/download the uploaded files.

## Step 3: Set up Automatic Cleanup (Optional)

To automatically delete unverified payment proofs after 30 days:

1. Go to **Database** > **Webhooks**
2. Create a webhook that triggers a cleanup function
3. Or use a cron job via **Supabase Functions**

## Step 4: Verify Configuration

Test the setup by:

1. Upload a test file through the app
2. Verify the file appears in the Supabase Storage console under `proofofpay`
3. Check that the public URL is accessible
4. Confirm the database record is created with `proof_of_payment_url`

## File Upload Flow

1. User selects a file (image/PDF)
2. Client validates file size (max 5MB)
3. File is uploaded to `proofofpay/{userId}/{planId}_{timestamp}_{filename}`
4. Public URL is generated and stored in `invoices.proof_of_payment_url`
5. Invoice status set to `proof_submitted`
6. Admin reviews the proof and updates payment_status to `confirmed` or `rejected`

## Database Fields

The `invoices` table now includes:
- `payment_method`: 'crypto' | 'mentor'
- `proof_of_payment_url`: Public URL to uploaded proof file
- `original_price`: Price before discount
- `discount_amount`: Discount amount
- `payment_status`: now includes `proof_submitted` state

## Admin Dashboard Updates Needed

You'll need to add admin functionality to:
1. View all `proof_submitted` invoices
2. Review uploaded proofs
3. Mark as `confirmed` (update payment_status to trigger subscription activation)
4. Mark as `rejected` (optionally delete the proof file)

## Example SQL for Manual Verification

```sql
-- View all pending mentor payments
SELECT id, user_id, price_amount, proof_of_payment_url, created_at
FROM invoices
WHERE payment_method = 'mentor' AND payment_status = 'proof_submitted'
ORDER BY created_at DESC;

-- Update to confirmed (admin action)
UPDATE invoices
SET payment_status = 'confirmed', updated_at = now()
WHERE id = 'invoice_id_here';
```

## Security Considerations

1. **File Validation**: Currently validates extension (image/PDF). Consider adding file type verification on server.
2. **File Size Limit**: Enforced on client (5MB) but should also validate on server.
3. **Virus Scanning**: For production, consider integrating with ClamAV or similar for file scanning.
4. **User Isolation**: Users can only upload to their own folder via RLS policy.
5. **Proof Retention**: Consider automatic deletion of old/rejected proofs for privacy.

## Troubleshooting

**Q: Upload fails with "bucket not found"**
- A: Ensure bucket name is exactly `proofofpay`
- Ensure RLS is enabled but policies are correct

**Q: File uploads but URL is inaccessible**
- A: Check the **SELECT** RLS policy is set to `true` for public access
- Or ensure your app is authenticated when accessing

**Q: "Failed to upload" error in app**
- A: Check browser console for detailed error
- Verify Supabase URL and anon key in environment variables
