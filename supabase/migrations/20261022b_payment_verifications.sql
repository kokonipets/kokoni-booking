-- Per-payment "verified" tick for Zelle / Venmo in the daily close (checked against the bank / app).
-- appointment_id is TEXT (no FK) so counter retail sales (id 'r:<uuid>') can be ticked too.
CREATE TABLE IF NOT EXISTS payment_verifications (
  appointment_id TEXT NOT NULL,
  method         TEXT NOT NULL,           -- 'zelle' | 'venmo'
  verified_by    TEXT,
  verified_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (appointment_id, method)
);
ALTER TABLE payment_verifications ENABLE ROW LEVEL SECURITY;
