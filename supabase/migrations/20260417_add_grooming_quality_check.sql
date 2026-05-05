-- Add grooming quality check fields to appointments table
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS grooming_quality JSONB;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS grooming_quality_completed_at TIMESTAMPTZ;

-- Sample grooming_quality structure:
-- {
--   "nails_trimmed": true,
--   "ears_cleaned": true,
--   "coat_brushed": true,
--   "paw_pads_cleared": true,
--   "bath_completed": true,
--   "styling_finished": true,
--   "final_notes": "Dog was cooperative and calm. Coat looks great!"
-- }
