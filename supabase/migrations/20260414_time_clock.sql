-- ============================================================
-- Time Clock (TimeStation-style kiosk) migration
-- Adds a per-staff clock PIN and a time_punches log table.
-- Supports: clock in, clock out, break start, break end.
-- Run in: Supabase Dashboard → SQL Editor → New Query
-- Safe to run multiple times.
-- ============================================================

-- ── Staff: clock-in PIN (4-6 digits) ─────────────────────────
ALTER TABLE staff ADD COLUMN IF NOT EXISTS clock_pin TEXT;
-- Unique among active PINs (NULLs allowed; uniqueness only where set)
CREATE UNIQUE INDEX IF NOT EXISTS staff_clock_pin_unique
  ON staff (clock_pin) WHERE clock_pin IS NOT NULL;

-- ── Time Punches Log ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS time_punches (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id     UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  action       TEXT NOT NULL CHECK (action IN ('clock_in', 'clock_out', 'break_start', 'break_end')),
  punched_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source       TEXT DEFAULT 'kiosk',    -- 'kiosk' | 'admin_edit' | 'auto'
  note         TEXT,
  edited_by    TEXT,                     -- admin username if manually inserted/edited
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS time_punches_staff_idx
  ON time_punches (staff_id, punched_at DESC);
CREATE INDEX IF NOT EXISTS time_punches_day_idx
  ON time_punches (punched_at DESC);

-- ── RLS ──────────────────────────────────────────────────────
ALTER TABLE time_punches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "time_punches_all" ON time_punches;
CREATE POLICY "time_punches_all" ON time_punches FOR ALL USING (true) WITH CHECK (true);
