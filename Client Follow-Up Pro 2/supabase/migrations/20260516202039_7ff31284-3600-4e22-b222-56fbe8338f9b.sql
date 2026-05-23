UPDATE customers
SET customer_follow_up = NULL
WHERE customer_follow_up IS NOT NULL
  AND purchase_date IS NOT NULL
  AND customer_follow_up = (date_trunc('month', purchase_date) + interval '1 month')::date;