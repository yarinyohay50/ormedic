CREATE SEQUENCE IF NOT EXISTS public.bookings_ref_seq START 1001;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS reference_number TEXT UNIQUE;
UPDATE public.bookings SET reference_number = 'NM-' || LPAD(nextval('public.bookings_ref_seq')::text, 5, '0') WHERE reference_number IS NULL;
ALTER TABLE public.bookings ALTER COLUMN reference_number SET DEFAULT 'NM-' || LPAD(nextval('public.bookings_ref_seq')::text, 5, '0');
ALTER TABLE public.bookings ALTER COLUMN reference_number SET NOT NULL;
CREATE POLICY "Anyone can lookup booking by reference"
  ON public.bookings FOR SELECT
  USING (true);
DROP POLICY IF EXISTS "Anyone can lookup booking by reference" ON public.bookings;
-- Don't allow public select. Instead use server function.