-- SMS log: every outbound text (sent, suppressed, failed) for audit + debugging
create table if not exists sms_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  mode text not null,                 -- 'live' | 'test' | 'off'
  status text not null,               -- 'sent' | 'suppressed' | 'failed' | 'redirected'
  to_number text not null,            -- the original intended recipient
  actual_to text,                     -- the number SMS actually went to (when redirected)
  body text not null,
  template text,                      -- e.g. 'notifyClientConfirmed', 'reminder'
  twilio_sid text,
  error text,
  suppressed_reason text              -- 'mode=off', 'not-in-whitelist', etc.
);

create index if not exists sms_log_created_idx on sms_log (created_at desc);
create index if not exists sms_log_to_idx on sms_log (to_number);
