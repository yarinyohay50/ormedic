CREATE TABLE IF NOT EXISTS public.admin_settings (
  id INT PRIMARY KEY DEFAULT 1,
  password_hash TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT admin_settings_singleton CHECK (id = 1)
);

ALTER TABLE public.admin_settings ENABLE ROW LEVEL SECURITY;

-- No public policies — only service role (server) can read/write.

INSERT INTO public.admin_settings (id, password_hash)
VALUES (1, NULL)
ON CONFLICT (id) DO NOTHING;