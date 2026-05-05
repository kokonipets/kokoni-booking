-- ============================================================
-- Kokoni Pet Grooming Salon — Supabase Database Schema
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── Clients ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS clients (
  phone        TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  email        TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ── Pets ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pets (
  id             UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  client_phone   TEXT NOT NULL REFERENCES clients(phone) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  breed          TEXT,
  weight         TEXT,
  birthday       DATE,
  notes          TEXT,
  vaccine_status TEXT DEFAULT 'pending'
                 CHECK (vaccine_status IN ('pending','email_sent','verified','expired')),
  vaccine_expiry DATE,
  is_active      BOOLEAN DEFAULT TRUE,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ── Vaccination Records ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS vaccination_records (
  id             UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  pet_id         UUID NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  file_url       TEXT,
  is_email_only  BOOLEAN DEFAULT FALSE,
  contact_method TEXT DEFAULT 'upload'
                 CHECK (contact_method IN ('upload', 'email', 'text')),
  verified       BOOLEAN DEFAULT FALSE,
  verified_at    TIMESTAMPTZ,
  submitted_at   TIMESTAMPTZ DEFAULT NOW(),
  admin_notes    TEXT
);

-- ── Migration: add contact_method if upgrading existing DB ───
-- Run this in Supabase SQL Editor if the table already exists:
-- ALTER TABLE vaccination_records ADD COLUMN IF NOT EXISTS contact_method TEXT DEFAULT 'upload' CHECK (contact_method IN ('upload', 'email', 'text'));

-- ── Migration: add birthday column to pets if upgrading existing DB ───
-- Run this in Supabase SQL Editor if the table already exists:
-- ALTER TABLE pets ADD COLUMN IF NOT EXISTS birthday DATE;

-- ── Migration: add staff assignment + payment columns to appointments ────
-- Run these in Supabase SQL Editor if the appointments table already exists:
-- ALTER TABLE appointments ADD COLUMN IF NOT EXISTS assigned_groomer TEXT;
-- ALTER TABLE appointments ADD COLUMN IF NOT EXISTS assigned_bather TEXT;
-- ALTER TABLE appointments ADD COLUMN IF NOT EXISTS payment_amount TEXT;
-- ALTER TABLE appointments ADD COLUMN IF NOT EXISTS payment_method TEXT;
-- ALTER TABLE appointments ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'unpaid';

-- ── Appointments ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS appointments (
  id               UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  client_phone     TEXT NOT NULL REFERENCES clients(phone),
  pet_id           UUID NOT NULL REFERENCES pets(id),
  service          TEXT NOT NULL
                   CHECK (service IN ('simply_cute','bath_brush','asian_fusion')),
  appointment_date DATE NOT NULL,
  appointment_time TEXT NOT NULL,
  notes            TEXT,
  status           TEXT DEFAULT 'pending'
                   CHECK (status IN ('pending','confirmed','cancelled','completed','no_show')),
  stylist          TEXT,
  assigned_groomer TEXT,
  assigned_bather  TEXT,
  payment_amount   TEXT,
  payment_method   TEXT,
  payment_status   TEXT DEFAULT 'unpaid',
  tos_agreed_at    TIMESTAMPTZ NOT NULL,
  confirmed_at     TIMESTAMPTZ,
  cancelled_at     TIMESTAMPTZ,
  notes_chinese    TEXT,
  notes_english    TEXT,
  in_progress_at   TIMESTAMPTZ,
  completed_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ── Dog Status Board ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dog_checkins (
  id             UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  appointment_id UUID NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  status         TEXT DEFAULT 'checked_in'
                 CHECK (status IN ('checked_in','waiting','bath_brush','styling','ready','checked_out')),
  updated_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_by     TEXT
);

-- ── Row Level Security ───────────────────────────────────────
ALTER TABLE clients           ENABLE ROW LEVEL SECURITY;
ALTER TABLE pets              ENABLE ROW LEVEL SECURITY;
ALTER TABLE vaccination_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments      ENABLE ROW LEVEL SECURITY;
ALTER TABLE dog_checkins      ENABLE ROW LEVEL SECURITY;

-- Public (anon key) can insert + select for booking flow
CREATE POLICY "clients_insert"   ON clients           FOR INSERT WITH CHECK (true);
CREATE POLICY "clients_select"   ON clients           FOR SELECT USING (true);
CREATE POLICY "pets_insert"      ON pets              FOR INSERT WITH CHECK (true);
CREATE POLICY "pets_select"      ON pets              FOR SELECT USING (true);
CREATE POLICY "vaccine_insert"   ON vaccination_records FOR INSERT WITH CHECK (true);
CREATE POLICY "vaccine_select"   ON vaccination_records FOR SELECT USING (true);
CREATE POLICY "appt_insert"      ON appointments      FOR INSERT WITH CHECK (true);
CREATE POLICY "appt_select"      ON appointments      FOR SELECT USING (true);
CREATE POLICY "checkin_select"   ON dog_checkins      FOR SELECT USING (true);
CREATE POLICY "checkin_insert"   ON dog_checkins      FOR INSERT WITH CHECK (true);
CREATE POLICY "checkin_update"   ON dog_checkins      FOR UPDATE USING (true);

-- ── Storage Bucket for Vaccination Documents ────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('vaccination-docs', 'vaccination-docs', false)
ON CONFLICT DO NOTHING;

CREATE POLICY "vaccine_upload"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'vaccination-docs');

CREATE POLICY "vaccine_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'vaccination-docs');
