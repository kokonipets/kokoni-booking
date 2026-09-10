-- Links multiple appointments (e.g. a client's 2-3 dogs requested for the same
-- time) into one "group" so staff can see them together in the admin and assign
-- staff to the whole group at once, instead of each pet showing up as an
-- unrelated booking. Nullable: most appointments are still a single pet booked
-- alone and have no group.
alter table appointments add column if not exists group_id text;

create index if not exists appointments_group_id_idx on appointments (group_id) where group_id is not null;
