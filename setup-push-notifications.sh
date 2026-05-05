#!/bin/bash

# ============================================================
#  Kokoni Grooming — Push Notification Setup Script
#  Run this once from your terminal to get everything working
# ============================================================

set -e

echo ""
echo "🦄 Kokoni Staff — Push Notification Setup"
echo "==========================================="
echo ""

# ---------- Step 1: Git push ----------
echo "📤 Step 1: Pushing latest code to GitHub / Vercel..."
cd "$(dirname "$0")"
git push
echo "✅ Code pushed!"
echo ""

# ---------- Step 2: Generate VAPID Keys ----------
echo "🔑 Step 2: Generating VAPID keys..."
echo ""

KEYS=$(node -e "
const crypto = require('crypto');
const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
const pubJwk = publicKey.export({ format: 'jwk' });
const privJwk = privateKey.export({ format: 'jwk' });

function urlBase64(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

const pubBytes = Buffer.from(pubJwk.x, 'base64');
const pubYBytes = Buffer.from(pubJwk.y, 'base64');
const uncompressed = Buffer.concat([Buffer.from([0x04]), pubBytes, pubYBytes]);
const privBytes = Buffer.from(privJwk.d, 'base64');

console.log('PUBLIC=' + urlBase64(uncompressed));
console.log('PRIVATE=' + urlBase64(privBytes));
")

PUBLIC_KEY=$(echo "$KEYS" | grep 'PUBLIC=' | cut -d= -f2)
PRIVATE_KEY=$(echo "$KEYS" | grep 'PRIVATE=' | cut -d= -f2)

echo "Here are your VAPID keys (copy these into Vercel):"
echo ""
echo "  NEXT_PUBLIC_VAPID_PUBLIC_KEY=$PUBLIC_KEY"
echo "  VAPID_PRIVATE_KEY=$PRIVATE_KEY"
echo "  VAPID_CONTACT_EMAIL=kokonipets@gmail.com"
echo ""

# Save to a .env.local file for local testing too
ENV_FILE="$(dirname "$0")/.env.local"
if [ ! -f "$ENV_FILE" ] || ! grep -q "VAPID_PRIVATE_KEY" "$ENV_FILE"; then
  echo "" >> "$ENV_FILE"
  echo "NEXT_PUBLIC_VAPID_PUBLIC_KEY=$PUBLIC_KEY" >> "$ENV_FILE"
  echo "VAPID_PRIVATE_KEY=$PRIVATE_KEY" >> "$ENV_FILE"
  echo "VAPID_CONTACT_EMAIL=kokonipets@gmail.com" >> "$ENV_FILE"
  echo "✅ Keys also saved to .env.local for local testing"
else
  echo "ℹ️  .env.local already has VAPID keys — skipped writing"
fi
echo ""

# ---------- Step 3: Supabase migration ----------
echo "🗄️  Step 3: Run this SQL in Supabase SQL Editor:"
echo ""
echo "  -- Creates the push_subscriptions table"
MIGRATION_FILE="$(dirname "$0")/supabase/migrations/20260326_push_subscriptions.sql"
if [ -f "$MIGRATION_FILE" ]; then
  echo ""
  cat "$MIGRATION_FILE"
else
  cat << 'SQLEOF'

  CREATE TABLE IF NOT EXISTS push_subscriptions (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_name   text NOT NULL,
    endpoint     text NOT NULL UNIQUE,
    p256dh       text NOT NULL,
    auth         text NOT NULL,
    created_at   timestamptz DEFAULT now()
  );

  CREATE INDEX IF NOT EXISTS push_subscriptions_staff_name_idx
    ON push_subscriptions (staff_name);
SQLEOF
fi
echo ""

# ---------- Step 4: Vercel env vars ----------
echo "⚙️  Step 4: Add these to Vercel Dashboard"
echo "  → vercel.com → your project → Settings → Environment Variables"
echo ""
echo "  Name:  NEXT_PUBLIC_VAPID_PUBLIC_KEY"
echo "  Value: $PUBLIC_KEY"
echo ""
echo "  Name:  VAPID_PRIVATE_KEY"
echo "  Value: $PRIVATE_KEY"
echo ""
echo "  Name:  VAPID_CONTACT_EMAIL"
echo "  Value: kokonipets@gmail.com"
echo ""

# ---------- Step 5: iPhone PWA ----------
echo "📱 Step 5: Install on Wylie's iPhone"
echo "  1. Open Safari → go to your staff login URL"
echo "  2. Tap the Share button (box with arrow up)"
echo "  3. Tap 'Add to Home Screen'"
echo "  4. Name it 'Kokoni Staff' → tap Add"
echo "  5. Open the app from the home screen"
echo "  6. Log in → tap Allow when asked for notifications"
echo ""

echo "🎉 All done! Redeploy Vercel after adding the env vars."
echo ""
