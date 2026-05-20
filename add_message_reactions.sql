-- Add is_read and reactions fields to support_messages table

ALTER TABLE public.support_messages
ADD COLUMN IF NOT EXISTS is_read BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS reactions JSONB DEFAULT '{}'; -- { "👍": ["user_id1", "user_id2"], "❤️": ["user_id3"] }

-- Create index for faster unread queries
CREATE INDEX IF NOT EXISTS idx_support_messages_user_unread 
ON public.support_messages(user_id) 
WHERE is_read = false;

-- Update updated_at timestamp when marking as read
ALTER TABLE public.support_messages
ALTER COLUMN updated_at SET DEFAULT now();
