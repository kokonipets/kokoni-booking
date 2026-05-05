-- Remove the hard-coded service CHECK constraint so any service name/id from settings is allowed.
-- The original constraint only permitted 'simply_cute', 'bath_brush', 'asian_fusion' which
-- blocked any new services added via the admin Settings page.

ALTER TABLE appointments DROP CONSTRAINT IF EXISTS appointments_service_check;
