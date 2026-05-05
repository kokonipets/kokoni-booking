-- Allow 'rescheduled' and 'in_progress' as appointment statuses
-- Previously the check constraint only had: pending, confirmed, cancelled, completed, no_show

ALTER TABLE appointments DROP CONSTRAINT IF EXISTS appointments_status_check;

ALTER TABLE appointments
  ADD CONSTRAINT appointments_status_check
  CHECK (status IN ('pending','confirmed','cancelled','completed','no_show','rescheduled','in_progress'));
