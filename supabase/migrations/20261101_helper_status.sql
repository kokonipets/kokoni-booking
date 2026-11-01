-- Assist must be confirmed by the assistant: 'pending' until they accept (no pay counted while pending). NULL = legacy / accepted.
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS helper_status TEXT;
