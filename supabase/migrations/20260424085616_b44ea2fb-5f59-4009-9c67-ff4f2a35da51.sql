-- Switch reference_number default to digits-only (5-digit zero-padded)
ALTER TABLE public.bookings
  ALTER COLUMN reference_number
  SET DEFAULT lpad((nextval('bookings_ref_seq'::regclass))::text, 5, '0');

-- Normalize existing values: strip "NM-" prefix if present
UPDATE public.bookings
SET reference_number = regexp_replace(reference_number, '^NM-', '')
WHERE reference_number LIKE 'NM-%';