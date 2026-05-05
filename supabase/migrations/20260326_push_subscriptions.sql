-- Push notification subscriptions for staff PWA
-- Each row = one device (a groomer can have multiple devices)
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_name  TEXT NOT NULL,
  endpoint    TEXT NOT NULL UNIQUE,
  p256dh      TEXT NOT NULL,
  auth        TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lookup by staff name
CREATE INDEX IF NOT EXISTS push_subscriptions_staff_name_idx ON push_subscriptions(staff_name);
