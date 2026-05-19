CREATE TABLE IF NOT EXISTS public.app_settings (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can read settings" ON public.app_settings FOR SELECT USING (true);
CREATE POLICY "Public can insert settings" ON public.app_settings FOR INSERT WITH CHECK (true);
CREATE POLICY "Public can update settings" ON public.app_settings FOR UPDATE USING (true);
INSERT INTO public.app_settings (key, value) VALUES ('login_password', '1512') ON CONFLICT (key) DO NOTHING;