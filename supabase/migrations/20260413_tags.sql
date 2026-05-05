-- Tags system for researching/filtering pets
-- Admins create tags (name + color), then tag individual pets.

CREATE TABLE IF NOT EXISTS tags (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  color       TEXT NOT NULL DEFAULT 'sky',   -- e.g. 'sky','rose','amber','violet','emerald','teal','pink','gray'
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  is_active   BOOLEAN DEFAULT TRUE,
  UNIQUE (name)
);

-- Junction table: a pet can have many tags, a tag can be on many pets.
CREATE TABLE IF NOT EXISTS pet_tags (
  pet_id      UUID NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  tag_id      UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (pet_id, tag_id)
);

CREATE INDEX IF NOT EXISTS pet_tags_pet_id_idx ON pet_tags(pet_id);
CREATE INDEX IF NOT EXISTS pet_tags_tag_id_idx ON pet_tags(tag_id);
