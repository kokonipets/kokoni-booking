-- Effective-dated payroll rates: a change to a groomer's commission % / tip % only applies from its
-- effective date forward; earlier appointments keep the rate that was in force then.
-- (No FK on staff_id so this works whatever type staff.id is.)
CREATE TABLE IF NOT EXISTS staff_rate_history (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id           TEXT NOT NULL,
  effective_from     DATE NOT NULL,
  commission_percent NUMERIC(6,2) NOT NULL DEFAULT 0,
  tip_percent        NUMERIC(6,2) NOT NULL DEFAULT 0,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (staff_id, effective_from)
);
ALTER TABLE staff_rate_history ENABLE ROW LEVEL SECURITY;
