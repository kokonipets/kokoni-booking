-- Migration: Add address and special_hours columns to staff table
-- Created: 2026-03-24
-- Purpose: Support staff profile contact information and custom scheduling

ALTER TABLE staff
ADD COLUMN IF NOT EXISTS address TEXT,
ADD COLUMN IF NOT EXISTS special_hours JSONB DEFAULT '{}';

-- Create index on address for potential filtering
CREATE INDEX IF NOT EXISTS idx_staff_address ON staff(address);

-- Add comment for special_hours column
COMMENT ON COLUMN staff.special_hours IS 'Custom work hours for specific dates. Format: {"YYYY-MM-DD": {"start": "HH:MM", "end": "HH:MM"}}';
