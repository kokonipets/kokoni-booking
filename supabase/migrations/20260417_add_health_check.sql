-- Add health check fields to appointments table
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS health_check JSONB;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS health_check_completed_at TIMESTAMPTZ;

-- Sample health_check structure:
-- {
--   "eyes": true,
--   "ears": true,
--   "nose": true,
--   "mouth": true,
--   "paws": true,
--   "skin": true,
--   "underside": true,
--   "groomer_notes": "Some notes about the dog's condition..."
-- }
