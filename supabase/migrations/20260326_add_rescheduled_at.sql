-- Track when an appointment was last rescheduled
-- Used to show "🔄 Rescheduled" badge on groomer pending cards
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS rescheduled_at TIMESTAMPTZ DEFAULT NULL;
