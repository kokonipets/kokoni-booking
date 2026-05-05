-- ============================================================
-- Staff & Users Complete Schema Migration
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- Safe to run multiple times (uses IF NOT EXISTS / IF EXISTS)
-- ============================================================

-- ── Staff Table ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS staff (
  id                 UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name               TEXT NOT NULL,
  role               TEXT NOT NULL DEFAULT 'groomer',
  is_active          BOOLEAN DEFAULT TRUE,
  commission_percent NUMERIC DEFAULT 0,
  tip_percent        NUMERIC DEFAULT 0,
  work_hours         JSONB DEFAULT '{}',
  days_off           JSONB DEFAULT '[]',
  special_hours      JSONB DEFAULT '{}',
  permissions        JSONB DEFAULT '{}',
  phone              TEXT,
  address            TEXT,
  created_at         TIMESTAMPTZ DEFAULT NOW()
);

-- Add any missing columns if table already exists
ALTER TABLE staff ADD COLUMN IF NOT EXISTS is_active          BOOLEAN DEFAULT TRUE;
ALTER TABLE staff ADD COLUMN IF NOT EXISTS commission_percent NUMERIC DEFAULT 0;
ALTER TABLE staff ADD COLUMN IF NOT EXISTS tip_percent        NUMERIC DEFAULT 0;
ALTER TABLE staff ADD COLUMN IF NOT EXISTS work_hours         JSONB DEFAULT '{}';
ALTER TABLE staff ADD COLUMN IF NOT EXISTS days_off           JSONB DEFAULT '[]';
ALTER TABLE staff ADD COLUMN IF NOT EXISTS special_hours      JSONB DEFAULT '{}';
ALTER TABLE staff ADD COLUMN IF NOT EXISTS permissions        JSONB DEFAULT '{}';
ALTER TABLE staff ADD COLUMN IF NOT EXISTS phone              TEXT;
ALTER TABLE staff ADD COLUMN IF NOT EXISTS address            TEXT;

-- ── Users Table (staff login credentials) ────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  staff_id      UUID REFERENCES staff(id) ON DELETE CASCADE,
  username      TEXT UNIQUE NOT NULL,
  email         TEXT,
  password_hash TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Add any missing columns if table already exists
ALTER TABLE users ADD COLUMN IF NOT EXISTS staff_id      UUID REFERENCES staff(id) ON DELETE CASCADE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS username      TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;

-- ── Row Level Security ───────────────────────────────────────
ALTER TABLE staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff_select" ON staff;
CREATE POLICY "staff_select" ON staff FOR SELECT USING (true);

DROP POLICY IF EXISTS "staff_insert" ON staff;
CREATE POLICY "staff_insert" ON staff FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "staff_update" ON staff;
CREATE POLICY "staff_update" ON staff FOR UPDATE USING (true);

DROP POLICY IF EXISTS "staff_delete" ON staff;
CREATE POLICY "staff_delete" ON staff FOR DELETE USING (true);

DROP POLICY IF EXISTS "users_select" ON users;
CREATE POLICY "users_select" ON users FOR SELECT USING (true);

DROP POLICY IF EXISTS "users_insert" ON users;
CREATE POLICY "users_insert" ON users FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "users_update" ON users;
CREATE POLICY "users_update" ON users FOR UPDATE USING (true);
