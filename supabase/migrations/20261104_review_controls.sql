-- Review request controls (same as Unicorn)
-- clients.review_opt_out: staff ticks "already reviewed / don't ask again"; the nightly job skips them.
-- review_settings.new_clients_only: true = only clients with no earlier completed visit get the request.
-- review_settings.min_days_between_requests: when sending to ALL clients, don't ask the same owner again within N days (NULL/0 = every visit).
ALTER TABLE clients ADD COLUMN IF NOT EXISTS review_opt_out BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE review_settings ADD COLUMN IF NOT EXISTS new_clients_only BOOLEAN DEFAULT FALSE;
ALTER TABLE review_settings ADD COLUMN IF NOT EXISTS min_days_between_requests INTEGER;
