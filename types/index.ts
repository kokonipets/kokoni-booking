export interface Client {
  phone: string
  name: string
  email?: string
  created_at?: string
}

export interface Pet {
  id: string
  client_phone: string
  name: string
  breed?: string
  notes?: string
  vaccine_status: 'pending' | 'email_sent' | 'verified' | 'expired'
  vaccine_expiry?: string
  is_active: boolean
}

export interface Appointment {
  id: string
  client_phone: string
  pet_id: string
  service: 'simply_cute' | 'bath_brush' | 'asian_fusion'
  appointment_date: string
  appointment_time: string
  notes?: string
  status: 'pending' | 'confirmed' | 'cancelled' | 'completed' | 'no_show'
  stylist?: string
  tos_agreed_at: string
  created_at?: string
}

export type DogStatus =
  | 'checked_in'
  | 'waiting'
  | 'bath_brush'
  | 'styling'
  | 'ready'
  | 'checked_out'

export const SERVICE_LABELS: Record<string, string> = {
  simply_cute: 'Simply Cute – Everyday Style',
  bath_brush: 'Bath & Brush',
  asian_fusion: 'Asian Fusion Style',
}
