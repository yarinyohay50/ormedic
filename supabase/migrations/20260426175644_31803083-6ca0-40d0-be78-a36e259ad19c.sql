ALTER TABLE public.admin_settings
ADD COLUMN IF NOT EXISTS google_sheet_id text,
ADD COLUMN IF NOT EXISTS google_sheet_tab text DEFAULT 'הזמנות';