UPDATE public.customers
SET last_contacted_at = NULL,
    customer_follow_up = NULL
WHERE last_contacted_at::date = CURRENT_DATE;