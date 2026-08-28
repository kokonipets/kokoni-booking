-- Marks an appointment as having come from the kiosk's "Walk In" flow (booked for
-- right now, no time slot). Used later to suppress customer-facing texts that don't
-- make sense for someone already standing in the store (e.g. the "ready for pickup"
-- SMS, since a walk-in customer is already there waiting).
alter table appointments add column if not exists is_walk_in boolean not null default false;
