-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Allow users to upload proof files" ON storage.objects;
DROP POLICY IF EXISTS "Allow public read access to proof files" ON storage.objects;
DROP POLICY IF EXISTS "Allow users to delete own proof files" ON storage.objects;

-- Policy 1: Allow authenticated users to upload to their own folder
CREATE POLICY "Allow users to upload proof files"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'proofofpay' AND (select auth.uid()::text) = (storage.foldername(name))[1]);

-- Policy 2: Allow public read access
CREATE POLICY "Allow public read access to proof files"
ON storage.objects
FOR SELECT
USING (bucket_id = 'proofofpay');

-- Policy 3: Allow authenticated users to delete their own files
CREATE POLICY "Allow users to delete own proof files"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'proofofpay' AND (select auth.uid()::text) = (storage.foldername(name))[1]);
