-- Add pay_type and hourly_rate columns to staff table
-- pay_type: 'hourly' or 'salary' (defaults to 'hourly')
-- hourly_rate: numeric rate ($/hr for hourly, $/yr for salary)

ALTER TABLE staff ADD COLUMN IF NOT EXISTS pay_type TEXT DEFAULT 'hourly';
ALTER TABLE staff ADD COLUMN IF NOT EXISTS hourly_rate NUMERIC DEFAULT NULL;
