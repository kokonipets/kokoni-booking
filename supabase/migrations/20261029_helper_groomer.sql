-- Partner / helper groomer on an appointment. The assigned groomer stays the owner; the helper's pay comes out of the owner's share.
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS helper_groomer TEXT;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS helper_pay_type TEXT;            -- 'flat' | 'percent'
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS helper_flat_amount NUMERIC;       -- one-time $ when flat
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS helper_commission_percent NUMERIC; -- % of the owner's commission on this appt
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS helper_tip_percent NUMERIC;        -- % of the owner's tip share on this appt
