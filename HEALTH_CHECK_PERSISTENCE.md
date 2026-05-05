# Health Check Data Persistence

## Overview
When a groomer submits a health check from the grooming dashboard, the data is now persisted to the database.

## Flow

### 1. **Groomer Dashboard** (`/app/groomer/dashboard/page.tsx`)
- Groomer clicks "Done" button on an appointment
- Health check modal appears (lines 2208-2283)
- Groomer fills out 7 health inspection checkboxes:
  - Eyes
  - Ears
  - Nose
  - Mouth/Teeth
  - Paw Pads
  - Skin & Coat
  - Underside
- Groomer enters notes in textarea
- Groomer clicks "✓ Submit & Mark Done" button

### 2. **Submit Function** (`submitHealthCheck`, line 392)
The function sends a PATCH request to `/api/admin/appointments/{id}` with:
```javascript
{
  action: 'grooming-status',
  grooming_status: 'ready',
  health_check: {
    eyes: boolean,
    ears: boolean,
    nose: boolean,
    mouth: boolean,
    paws: boolean,
    skin: boolean,
    underside: boolean,
    groomer_notes: string
  }
}
```

### 3. **API Handler** (`/app/api/admin/appointments/[id]/route.ts`)
The `grooming-status` action handler (lines 418-472):
- Extracts `health_check` object from request body
- When `grooming_status === 'ready'`, saves the health check data:
  - Saves to `appointments.health_check` (JSONB column)
  - Timestamps with `appointments.health_check_completed_at`

### 4. **Database Storage** (`supabase/migrations/20260417_add_health_check.sql`)
Two new columns added to the `appointments` table:
- **`health_check`** (JSONB): Stores the health check data
- **`health_check_completed_at`** (TIMESTAMPTZ): Timestamp when health check was submitted

## Data Structure

Health check data is stored as JSONB in the `health_check` column:
```json
{
  "eyes": true,
  "ears": true,
  "nose": true,
  "mouth": true,
  "paws": true,
  "skin": true,
  "underside": true,
  "groomer_notes": "Dog appeared lethargic, possible skin irritation on rear left leg"
}
```

## Query Examples

### Get health check for a specific appointment:
```sql
SELECT health_check, health_check_completed_at 
FROM appointments 
WHERE id = 'appointment-uuid';
```

### Get all appointments with health checks:
```sql
SELECT id, pet_id, appointment_date, health_check, health_check_completed_at
FROM appointments
WHERE health_check IS NOT NULL;
```

### Check a specific health flag:
```sql
SELECT id, health_check->>'eyes' as eyes_inspection
FROM appointments
WHERE health_check->>'eyes' = 'true';
```

## Implementation Details

- **When saved**: Health check is saved when grooming_status transitions to 'ready'
- **Authentication**: Uses service role (admin only)
- **Status**: Also marks appointment status as 'confirmed' (sets status = 'confirmed')
- **Timestamps**: Records exact moment health check was completed

## Next Steps (Optional)

1. **View Health Checks**: Build admin dashboard to view historical health checks
2. **Health History**: Add ability to compare health checks across multiple appointments
3. **Alerts**: Add alerts if any health check fails (all checkboxes not marked)
4. **Export**: Add ability to export health check records for records/compliance
