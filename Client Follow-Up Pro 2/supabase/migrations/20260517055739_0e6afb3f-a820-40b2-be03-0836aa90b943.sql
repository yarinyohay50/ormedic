ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS home_phone text DEFAULT '',
  ADD COLUMN IF NOT EXISTS device_type text DEFAULT '',
  ADD COLUMN IF NOT EXISTS mask_type text DEFAULT '';