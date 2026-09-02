-- Tracks each time a staff member logs into the standalone Cashier screen
-- (app/cashier), so Admin/Desk can show who's been acting as cashier and
-- when they signed in. Separate from the staff table's own login (which
-- only gates Admin/Desk and the Groomer dashboard) — logging into Cashier
-- is tracked as its own event, one row per sign-in.
create table if not exists cashier_logins (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid references staff(id) on delete set null,
  staff_name text not null,
  logged_in_at timestamptz not null default now()
);
create index if not exists cashier_logins_logged_in_at_idx on cashier_logins (logged_in_at desc);
