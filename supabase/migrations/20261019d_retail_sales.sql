-- Counter retail sales (店販). A sale is a cart of inventory items paid by cash/card/zelle/venmo.
-- Card sales are charged on the Square Terminal; the sale stays 'pending' until Square reports
-- the checkout COMPLETED, then it is finalized exactly once (status -> 'paid' + inventory 'out' rows).
CREATE TABLE IF NOT EXISTS retail_sales (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lines          JSONB NOT NULL,                 -- [{item_id, name, qty, unit_price}]
  total          NUMERIC(10,2) NOT NULL,         -- tax-inclusive
  payment_method TEXT NOT NULL,                  -- cash / card / zelle / venmo
  status         TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','cancelled')),
  checkout_id    TEXT,                           -- Square Terminal checkout id (card)
  note           TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paid_at        TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS retail_sales_created_idx ON retail_sales(created_at DESC);
ALTER TABLE retail_sales ENABLE ROW LEVEL SECURITY;
