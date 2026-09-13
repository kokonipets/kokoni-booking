-- Deleted Appointments Log: a full snapshot of an appointment (including its
-- client/pet details) taken right before an admin deletes it. The delete
-- itself is still permanent — this just keeps a record of what existed, since
-- there was previously no way to see or recover an appointment once removed.
create table if not exists deleted_appointments_log (
  id uuid primary key default gen_random_uuid(),
  deleted_at timestamptz not null default now(),
  appointment_id uuid,
  client_phone text,
  appointment jsonb not null default '{}'::jsonb
);

create index if not exists deleted_appointments_log_deleted_at_idx on deleted_appointments_log (deleted_at desc);
create index if not exists deleted_appointments_log_phone_idx on deleted_appointments_log (client_phone);
