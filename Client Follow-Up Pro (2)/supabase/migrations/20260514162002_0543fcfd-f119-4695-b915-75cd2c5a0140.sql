
-- Make customers table usable without authentication (personal management app)
ALTER TABLE public.customers ALTER COLUMN user_id DROP NOT NULL;

-- Drop existing user-scoped policies
DROP POLICY IF EXISTS "Users can view their own customers" ON public.customers;
DROP POLICY IF EXISTS "Users can create their own customers" ON public.customers;
DROP POLICY IF EXISTS "Users can update their own customers" ON public.customers;
DROP POLICY IF EXISTS "Users can delete their own customers" ON public.customers;

-- Allow public access (no auth required)
CREATE POLICY "Public can view customers"
ON public.customers FOR SELECT USING (true);

CREATE POLICY "Public can insert customers"
ON public.customers FOR INSERT WITH CHECK (true);

CREATE POLICY "Public can update customers"
ON public.customers FOR UPDATE USING (true);

CREATE POLICY "Public can delete customers"
ON public.customers FOR DELETE USING (true);
