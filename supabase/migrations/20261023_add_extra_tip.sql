-- Extra tip paid a different way than the main tip (e.g. tip on the card + extra cash handed over).
-- appointments.tip_amount stays the TOTAL tip (payroll / reports keep working); these columns record
-- how much of that total was the extra part and which method it came in (default cash).
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS extra_tip_amount NUMERIC(10,2);
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS extra_tip_method TEXT
  CHECK (extra_tip_method IS NULL OR extra_tip_method IN ('card','cash','venmo','zelle'));
