-- Daily close (每日核帳): one sign-off row per business day.
-- Stores who signed, what cash was counted, whether Zelle/Venmo were verified, and a snapshot of
-- the system totals at sign-off time (so later changes to that day's payments can be flagged).
CREATE TABLE IF NOT EXISTS daily_closings (
  close_date     DATE PRIMARY KEY,
  signed_by      TEXT NOT NULL,
  signed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  cash_counted   NUMERIC(10,2),
  zelle_verified BOOLEAN NOT NULL DEFAULT FALSE,
  venmo_verified BOOLEAN NOT NULL DEFAULT FALSE,
  square_total   NUMERIC(10,2),
  snapshot       JSONB,           -- {card, cash, zelle, venmo} system totals at sign-off
  notes          TEXT
);
ALTER TABLE daily_closings ENABLE ROW LEVEL SECURITY;
