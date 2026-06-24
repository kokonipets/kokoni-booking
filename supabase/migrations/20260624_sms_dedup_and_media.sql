-- 1) Prevent duplicate message logging: a message (twilio_sid) can only exist once.
--    Partial index so the many legacy rows with empty/null sid are unaffected.
create unique index if not exists sms_messages_twilio_sid_key
  on sms_messages (twilio_sid)
  where twilio_sid is not null and twilio_sid <> '';

-- 2) Track how many photos (MMS media) an incoming message has, so the chat
--    can render them.
alter table sms_messages
  add column if not exists media_count int not null default 0;
