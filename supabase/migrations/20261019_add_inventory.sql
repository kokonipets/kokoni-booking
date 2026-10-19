-- Simple retail inventory for Kokoni: products + a movement ledger (stock in / sale / adjustment).
-- Stock on hand = SUM(qty) over movements, where purchases are +qty, sales are -qty and
-- manual adjustments are +/-qty. Independent from appointments/payroll.

CREATE TABLE IF NOT EXISTS inventory_items (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                TEXT NOT NULL,
  unit_cost           NUMERIC(10,2),            -- default purchase cost per unit
  sale_price          NUMERIC(10,2),            -- default selling price per unit
  low_stock_threshold INTEGER NOT NULL DEFAULT 0,
  active              BOOLEAN NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inventory_movements (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id        UUID NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  type           TEXT NOT NULL CHECK (type IN ('in','out','adjust')),
  qty            INTEGER NOT NULL,              -- signed: in = +, out = -, adjust = +/-
  unit_price     NUMERIC(10,2),                 -- cost per unit for 'in', price per unit for 'out'
  payment_method TEXT,                          -- for 'out': cash / card / venmo / zelle / other
  supplier       TEXT,                          -- for 'in'
  note           TEXT,
  occurred_on    DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS inventory_movements_item_idx ON inventory_movements(item_id);
CREATE INDEX IF NOT EXISTS inventory_movements_date_idx ON inventory_movements(occurred_on DESC);
