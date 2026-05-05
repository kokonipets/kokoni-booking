# Kokoni Pet Grooming Salon — Booking System Setup Guide

## Step 1: Push code to GitHub

Open Terminal and run:

```bash
cd ~/Downloads/kokoni-booking   # or wherever you unzipped the project
git init
git add .
git commit -m "Initial booking system"
git branch -M main
git remote add origin https://github.com/kokonigrooming2023/kokoni-booking.git
git push -u origin main
```

---

## Step 2: Set up Supabase database

1. Go to **supabase.com** → open your project
2. Click **SQL Editor** in the left sidebar
3. Click **New Query**
4. Copy the entire contents of `supabase-schema.sql`
5. Paste it into the editor and click **Run**
6. You should see: "Success. No rows returned"

---

## Step 3: Get your Supabase API keys

1. In Supabase → **Project Settings** (gear icon) → **API**
2. Copy these three values:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon / public key** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role key** → `SUPABASE_SERVICE_ROLE_KEY`

---

## Step 4: Get your Twilio credentials

1. Go to **console.twilio.com**
2. From the dashboard copy:
   - **Account SID** → `TWILIO_ACCOUNT_SID`
   - **Auth Token** → `TWILIO_AUTH_TOKEN`
   - **Phone Number** (your Twilio number) → `TWILIO_PHONE_NUMBER`

---

## Step 5: Deploy to Vercel

1. Go to **vercel.com** → **Add New Project**
2. Import your `kokoni-booking` GitHub repo
3. Click **Environment Variables** and add all of these:

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | your Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | your Supabase service role key |
| `TWILIO_ACCOUNT_SID` | your Twilio Account SID |
| `TWILIO_AUTH_TOKEN` | your Twilio Auth Token |
| `TWILIO_PHONE_NUMBER` | your Twilio phone number (e.g. +11234567890) |
| `ADMIN_PHONE` | +16264290038 |
| `SALON_NAME` | Kokoni Pet Grooming Salon |
| `VACCINATION_EMAIL` | kokonipets@gmail.com |

4. Click **Deploy** — Vercel will build and publish automatically

---

## Step 6: Set up custom domain

1. In Vercel → your project → **Settings** → **Domains**
2. Add: `book.kokonipetsalon.com`
3. In your domain registrar (GoDaddy / Namecheap / etc.) add a CNAME record:
   - Name: `book`
   - Value: `cname.vercel-dns.com`

---

## Your booking URL will be live at:
**https://book.kokonipetsalon.com**

---

## What's next (Phase 2):
- Staff admin dashboard
- Dog status board (6-stage)
- LED marquee integration
- Kiosk check-in
- Square payment integration
