-- Add SMS opt-in consent fields to clients table
-- Required for A2P 10DLC compliance: track when and whether each client voluntarily
-- opted in to receive text messages. Consent is NOT a condition of booking.

alter table clients
  add column if not exists sms_consent boolean not null default false,
  add column if not exists sms_consent_at timestamptz;
