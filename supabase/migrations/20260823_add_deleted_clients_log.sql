-- Deleted Clients Log: a full snapshot of a client (plus their pets, appointments,
-- and authorized pickups) taken right before an admin deletes them. The delete
-- itself is still permanent — this just keeps a record of what existed, since
-- there was previously no way to recover or even confirm what was removed.
create table if not exists deleted_clients_log (
  id uuid primary key default gen_random_uuid(),
  deleted_at timestamptz not null default now(),
  phone text not null,
  client jsonb not null default '{}'::jsonb,
  pets jsonb not null default '[]'::jsonb,
  appointments jsonb not null default '[]'::jsonb,
  authorized_pickups jsonb not null default '[]'::jsonb
);

create index if not exists deleted_clients_log_phone_idx on deleted_clients_log (phone);
create index if not exists deleted_clients_log_deleted_at_idx on deleted_clients_log (deleted_at desc);
