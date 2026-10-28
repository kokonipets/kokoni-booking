-- Guard against sending the same appointment reminder twice
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ;
