
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  phone text default '',
  id_number text default '',
  purchase_date date,
  item text default '',
  amount numeric,
  customer_follow_up date,
  device_follow_up date,
  address text default '',
  notes text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index customers_user_id_idx on public.customers(user_id);
create index customers_follow_up_idx on public.customers(user_id, customer_follow_up);

alter table public.customers enable row level security;

create policy "Users can view own customers"
  on public.customers for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can insert own customers"
  on public.customers for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can update own customers"
  on public.customers for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own customers"
  on public.customers for delete
  to authenticated
  using (auth.uid() = user_id);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end; $$;

create trigger customers_set_updated_at
  before update on public.customers
  for each row execute function public.set_updated_at();
