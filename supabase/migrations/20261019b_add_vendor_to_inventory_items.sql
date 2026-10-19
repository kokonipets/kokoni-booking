-- Default vendor/supplier per inventory item (used to prefill stock-in, filter stock, group the report).
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS vendor TEXT;
UPDATE inventory_items SET vendor = 'PAWUP' WHERE vendor IS NULL AND name ~ '\((DGACDH|YRDG|XXYPJ|GZJRQS|NPBJRBBT|ZBJRBBT)';
