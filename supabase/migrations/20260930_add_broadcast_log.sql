-- History log for one-off client announcements sent from Admin Settings, plus
-- optional audience targeting by pet tag (e.g. send only to clients whose pet
-- has a given tag, instead of every SMS-opted-in client).

CREATE TABLE IF NOT EXISTS broadcast_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message       TEXT NOT NULL,
  tag_id        UUID REFERENCES tags(id) ON DELETE SET NULL,
  tag_name      TEXT,                 -- snapshot of the tag's name at send time, in case it's later renamed/deleted
  sent_count    INTEGER NOT NULL DEFAULT 0,
  failed_count  INTEGER NOT NULL DEFAULT 0,
  total_count   INTEGER NOT NULL DEFAULT 0,
  sent_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS broadcast_log_sent_at_idx ON broadcast_log(sent_at DESC);
