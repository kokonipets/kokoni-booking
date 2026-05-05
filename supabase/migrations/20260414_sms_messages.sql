-- Two-way SMS chat: stores both inbound customer texts and outbound replies
-- No FK to clients(phone) so we can keep inbound messages even if the sender
-- isn't yet a client in our system.
create table if not exists sms_messages (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  direction text not null check (direction in ('inbound', 'outbound')),
  from_number text not null,
  to_number text not null,
  body text not null,
  twilio_sid text,
  client_phone text,
  read_at timestamptz
);

create index if not exists sms_messages_created_idx on sms_messages (created_at desc);
create index if not exists sms_messages_client_idx on sms_messages (client_phone, created_at desc);
create index if not exists sms_messages_from_idx on sms_messages (from_number);
create index if not exists sms_messages_unread_idx on sms_messages (direction, read_at) where direction = 'inbound' and read_at is null;
