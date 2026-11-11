-- Who each announcement went to: [{ phone, name, pets, ok }] — so the History
-- list can show the recipients of every send, not just the count.
alter table broadcast_log add column if not exists recipients jsonb;
