-- Accounts payable to vendors: payments made + per-item consignment flag.
-- Owed to a vendor = (consignment items: units SOLD x cost) + (normal items: units PURCHASED x cost) - payments.
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS consignment BOOLEAN NOT NULL DEFAULT FALSE;
UPDATE inventory_items SET consignment = TRUE WHERE vendor = 'PAWUP';

CREATE TABLE IF NOT EXISTS vendor_payments (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor     TEXT NOT NULL,
  amount     NUMERIC(10,2) NOT NULL,
  paid_on    DATE NOT NULL DEFAULT CURRENT_DATE,
  method     TEXT,
  note       TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS vendor_payments_vendor_idx ON vendor_payments(vendor);
ALTER TABLE vendor_payments ENABLE ROW LEVEL SECURITY;
