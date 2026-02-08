-- Migration to add family management columns to profiles table
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS family_name TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS family_code TEXT UNIQUE;

-- Enable RLS is already handled by previous migrations, but ensuring columns are accessible
-- The existing policies on 'profiles' will automatically cover these new columns.