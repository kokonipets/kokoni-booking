'use client'

import { useState, useEffect, useCallback, useRef, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { TagPill, TagPicker, tagClasses, type Tag as PetTag } from '@/lib/tags'
import ChatSidebarLink from '@/components/ChatSidebarLink'
import ChatIconButton from '@/components/ChatIconButton'
import { readAuthRaw, clearAuth } from '@/lib/authStorage'

// ── Types ──────────────────────────────────────────────────────────────────
type StaffMember = {
  id: string
  name: string
  first_name?: string | null
  last_name?: string | null
  role: string
  username?: string | null
  is_active: boolean
  commission_percent: number
  tip_percent: number
  days_off?: string[]
  created_at: string
}

type ServiceDef = {
  id: string
  name: string
  desc: string
  price: string
  tiers?: { label: string; price: string; duration: string }[]
  visible?: boolean   // true = shown to customers; false = admin-only
  category?: 'main' | 'addon'   // 'main' = base grooming style, 'addon' = extra add-on service
}

// Older saved services predate the category field. Infer it so existing data
// keeps working: base styles have "Starting from $" baked into their name
// (or are one of the three original built-in ids); everything else is an add-on.
function inferServiceCategory(s: { id: string; name?: string; category?: 'main' | 'addon' }): 'main' | 'addon' {
  if (s.category === 'main' || s.category === 'addon') return s.category
  if (s.id === 'simply_cute' || s.id === 'bath_brush' || s.id === 'asian_fusion') return 'main'
  if (/starting from/i.test(s.name ?? '')) return 'main'
  return 'addon'
}

type NoteEntry = {
  id: string
  text: string
  notes_english?: string | null
  notes_chinese?: string | null
  author: string
  created_at: string
  price?: string
  is_addon?: boolean
}

type Appointment = {
  id: string
  client_phone: string
  pet_id?: string | null
  service: string
  appointment_date: string
  appointment_time: string
  notes: string | null
  notes_chinese: string | null
  notes_english: string | null
  notes_author: string | null
  notes_updated_at: string | null
  notes_list: NoteEntry[] | null
  status: string
  created_at: string
  confirmed_at: string | null
  assigned_groomer: string | null
  assigned_bather: string | null
  payment_amount: string | null
  payment_method: string | null
  payment_status: string | null
  size_tier?: string | null
  tip_amount: string | null
  grooming_status: string | null
  grooming_status_updated_at: string | null
  grooming_started_at: string | null
  grooming_finished_at: string | null
  owner_notified_at: string | null
  checked_out_at: string | null
  checked_in_at: string | null
  groomer_confirmed: boolean | null
  health_check: any | null
  health_check_completed_at: string | null
  grooming_quality: any | null
  grooming_quality_completed_at: string | null
  clients: { name: string; phone: string; email: string | null; sms_consent?: boolean | null } | null
  pets: { id?: string; name: string; breed: string | null; weight: string | null; vaccine_status: string; vaccine_expiry?: string | null; photo_url: string | null } | null
  is_new_client?: boolean
}

type ClientRecord = {
  name: string
  phone: string
  email: string | null
  address?: string | null
  created_at: string
  sms_consent?: boolean | null
  sms_consent_at?: string | null
  pets: { id: string; name: string; breed: string | null; weight: string | null; vaccine_status: string; vaccine_expiry: string | null; photo_url: string | null; tags?: { id: string; name: string; color: string }[] }[]
  appointments: { id: string; appointment_date: string; appointment_time: string; service: string; status: string; pet_id: string | null; assigned_groomer: string | null; assigned_bather: string | null; payment_amount: string | null; payment_method: string | null; tip_amount?: string | null; created_at?: string | null; confirmed_at?: string | null; checked_in_at?: string | null; grooming_started_at?: string | null; grooming_finished_at?: string | null; checked_out_at?: string | null; notes?: string | null; notes_english?: string | null; notes_chinese?: string | null; notes_list?: { id: string; text: string; author: string; created_at: string; notes_english?: string | null; notes_chinese?: string | null; is_addon?: boolean }[] | null; health_check?: any | null; grooming_quality?: any | null; health_check_completed_at?: string | null; grooming_quality_completed_at?: string | null }[]
  authorized_pickups: { id: string; name: string; relationship: string | null }[]
}

// ── Constants ──────────────────────────────────────────────────────────────
const SERVICE_LABELS: Record<string, string> = {
  simply_cute: 'Simply Cute',
  bath_brush: 'Bath & Brush',
  asian_fusion: 'Asian Fusion Style',
}

// ── Dog breed autocomplete ──────────────────────────────────────────────────
const DOG_BREEDS = [
  'Affenpinscher','Afghan Hound','Airedale Terrier','Akita','Alaskan Malamute',
  'American Bulldog','American Eskimo Dog','American Foxhound','American Pit Bull Terrier',
  'American Staffordshire Terrier','Australian Cattle Dog','Australian Shepherd',
  'Australian Terrier','Basenji','Basset Hound','Beagle','Bearded Collie',
  'Belgian Malinois','Bernese Mountain Dog','Bichon Frise','Bloodhound','Border Collie',
  'Border Terrier','Boston Terrier','Boxer','Brittany','Brussels Griffon','Bull Terrier',
  'Bulldog','Bullmastiff','Cairn Terrier','Cavalier King Charles Spaniel','Chihuahua',
  'Chinese Crested','Chinese Shar-Pei','Chow Chow','Cockapoo','Cocker Spaniel',
  'Collie','Corgi','Dachshund','Dalmatian','Doberman Pinscher','Doodle',
  'English Setter','English Springer Spaniel','French Bulldog','German Shepherd',
  'German Shorthaired Pointer','Golden Retriever','Goldendoodle','Great Dane',
  'Great Pyrenees','Greyhound','Havanese','Irish Setter','Irish Wolfhound',
  'Italian Greyhound','Jack Russell Terrier','Japanese Chin','Labradoodle',
  'Labrador Retriever','Lhasa Apso','Maltese','Maltipoo','Mastiff',
  'Miniature Pinscher','Miniature Schnauzer','Mixed Breed','Newfoundland',
  'Norfolk Terrier','Norwegian Elkhound','Old English Sheepdog','Papillon',
  'Pekingese','Pembroke Welsh Corgi','Persian','Pit Bull','Plott Hound',
  'Pointer','Pomeranian','Pomsky','Poodle','Portuguese Water Dog','Pug',
  'Rat Terrier','Rhodesian Ridgeback','Rottweiler','Saint Bernard','Samoyed',
  'Schnauzer','Scottish Terrier','Shetland Sheepdog','Shiba Inu','Shih Tzu',
  'Siberian Husky','Silky Terrier','Soft Coated Wheaten Terrier','Spinone Italiano',
  'Staffordshire Bull Terrier','Standard Schnauzer','Toy Fox Terrier','Toy Poodle',
  'Vizsla','Weimaraner','Welsh Corgi','West Highland White Terrier','Whippet',
  'Wire Fox Terrier','Wirehaired Pointing Griffon','Xoloitzcuintli',
  'Yorkshire Terrier',
]

function BreedInput({ value, onChange, className }: { value: string; onChange: (v: string) => void; className?: string }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const suggestions = value.length >= 2
    ? DOG_BREEDS.filter(b => b.toLowerCase().includes(value.toLowerCase())).slice(0, 8)
    : []

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div ref={ref} className="relative">
      <input
        type="text"
        value={value}
        onChange={e => { onChange(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        placeholder="Breed"
        className={className}
        autoComplete="off"
      />
      {open && suggestions.length > 0 && (
        <ul className="absolute z-50 left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
          {suggestions.map(breed => (
            <li
              key={breed}
              onMouseDown={e => { e.preventDefault(); onChange(breed); setOpen(false) }}
              className="px-3 py-2 text-sm text-gray-700 hover:bg-sky-50 hover:text-sky-700 cursor-pointer"
            >
              {breed}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

const STATUS_COLORS: Record<string, string> = {
  pending:     'bg-amber-100 text-amber-700',
  confirmed:   'bg-emerald-100 text-emerald-700',
  in_progress: 'bg-sky-100 text-sky-700',
  completed:   'bg-gray-100 text-gray-500',
  cancelled:   'bg-red-100 text-red-600',
}

const GROOMING_STAGES = [
  { id: 'waiting', label: 'Waiting',          icon: '⏳', bg: 'bg-amber-50',  border: 'border-amber-300', text: 'text-amber-700',  btnBg: '#f59e0b', next: 'Start Grooming →' },
  { id: 'incare',  label: 'In Good Hands 🐾', icon: '✂️', bg: 'bg-sky-50',    border: 'border-sky-300',   text: 'text-sky-700',    btnBg: '#0ea5e9', next: 'Mark Ready →' },
  { id: 'ready',   label: 'Ready to Pick Up', icon: '🔔', bg: 'bg-green-50',  border: 'border-green-300', text: 'text-green-700',  btnBg: '#22c55e', next: 'Check Out' },
  { id: 'done',    label: 'Checked Out',      icon: '🎉', bg: 'bg-pink-50',   border: 'border-pink-300',  text: 'text-pink-700',   btnBg: '#ec4899', next: '' },
]
const GROOMING_STAGE_ORDER = GROOMING_STAGES.map(s => s.id)

function formatDate(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

function firstName(name: string | null | undefined): string {
  if (!name) return ''
  return name.trim().split(/\s+/)[0]
}

// Parse "1:15 PM" or "13:15" or "13:15:00" into a local Date on the given date string
const SALON_TZ = 'America/Los_Angeles'

// How many ms the given timezone is ahead of UTC at `date`.
function tzOffsetMs(tz: string, date: Date): number {
  const dtf = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
  const m: Record<string, string> = {}
  for (const p of dtf.formatToParts(date)) m[p.type] = p.value
  const hh = m.hour === '24' ? '00' : m.hour
  const asUTC = Date.UTC(+m.year, +m.month - 1, +m.day, +hh, +m.minute, +m.second)
  return asUTC - date.getTime()
}

// Current time in the salon's timezone, returned as a Date whose local
// getters (getFullYear/getDate/getHours/...) report Pacific wall-clock values.
// Use this instead of `new Date()` for any "what day is it at the salon?"
// logic, so admin views are correct when staff devices are in other timezones.
function salonNow(): Date {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: SALON_TZ, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date())
  const g = (t: string) => p.find(x => x.type === t)?.value ?? '00'
  const h = g('hour') === '24' ? '00' : g('hour')
  return new Date(+g('year'), +g('month') - 1, +g('day'), +h, +g('minute'), +g('second'))
}

// Parse an appointment's date + wall-clock time as a moment in the salon's
// timezone (Pacific), so "Late"/"Coming" is correct regardless of the device's
// own timezone (e.g. when the owner is traveling).
function parseApptTime(dateStr: string, timeStr: string): Date {
  const upper = timeStr.trim().toUpperCase()
  let h: number, m: number
  if (upper.includes('AM') || upper.includes('PM')) {
    const [t, period] = upper.split(' ')
    const [hStr, mStr] = t.split(':')
    h = parseInt(hStr, 10)
    m = parseInt(mStr || '0', 10)
    if (period === 'PM' && h !== 12) h += 12
    if (period === 'AM' && h === 12) h = 0
  } else {
    const [hStr, mStr] = upper.split(':')
    h = parseInt(hStr, 10)
    m = parseInt(mStr || '0', 10)
  }
  if (isNaN(h) || isNaN(m)) return new Date(`${dateStr}T00:00:00`)
  const [Y, Mo, D] = dateStr.split('-').map(Number)
  const asUTC = Date.UTC(Y, Mo - 1, D, h, m, 0)
  // Two-pass offset estimate so DST-transition days resolve correctly.
  let off = tzOffsetMs(SALON_TZ, new Date(asUTC))
  off = tzOffsetMs(SALON_TZ, new Date(asUTC - off))
  return new Date(asUTC - off)
}

function groomingDuration(startedAt: string | null | undefined, finishedAt?: string | null | undefined): string | null {
  if (!startedAt) return null
  // If grooming has finished, measure start→finish; otherwise it's still in progress (start→now).
  const end = finishedAt ? new Date(finishedAt).getTime() : Date.now()
  const mins = Math.floor((end - new Date(startedAt).getTime()) / 60000)
  if (mins < 1) return finishedAt ? 'under a minute' : 'just started'
  if (mins < 60) return `${mins} min`
  const h = Math.floor(mins / 60), m = mins % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

const AVATAR_COLORS = ['bg-sky-500','bg-violet-500','bg-emerald-500','bg-amber-500','bg-rose-500','bg-indigo-500','bg-teal-500','bg-orange-500']
function avatarColor(name: string) {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

// ── Sidebar nav items ──────────────────────────────────────────────────────
const NAV = [
  { key: 'requests',   label: 'Pending Request',         icon: '📋' },
  { key: 'calendar',   label: 'Calendar',                icon: '📅' },
  { key: 'today',      label: 'Today',                   icon: '✅' },
  { key: 'grooming',   label: 'Grooming Board',          icon: '✂️' },
  { key: 'clients',    label: 'Pet Parents',             icon: '🐾' },
  { key: 'vaccines',   label: 'Vaccine Records',         icon: '💉' },
  { key: 'payroll',    label: 'Payroll',                 icon: '💵' },
  { key: 'intake',     label: 'New Client Intake',       icon: '📝' },
  { key: 'waitlist',   label: 'Waitlist',                icon: '⏳' },
  { key: 'cashier',    label: 'Cashier',                 icon: '💰' },
  { key: 'reviews',    label: 'SMS Reviews',             icon: '⭐' },
  { key: 'reports',    label: 'Reports',                 icon: '📊' },
  { key: 'settings',   label: 'Settings',                icon: '⚙️' },
] as const

type TabKey = typeof NAV[number]['key']

type VaccineRecord = {
  id: string
  file_url: string | null
  signedUrl: string | null
  is_email_only: boolean
  verified: boolean
  verified_at: string | null
  submitted_at: string
  admin_notes: string | null
  pets: {
    id: string
    name: string
    breed: string | null
    weight: string | null
    photo_url: string | null
    vaccine_status: string
    vaccine_expiry: string | null
    client_phone: string
    clients: { name: string; phone: string; email: string | null; sms_consent?: boolean | null } | null
  } | null
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const TIME_OPTIONS = [
  '7:00 AM','7:15 AM','7:30 AM','7:45 AM',
  '8:00 AM','8:15 AM','8:30 AM','8:45 AM',
  '9:00 AM','9:15 AM','9:30 AM','9:45 AM',
  '10:00 AM','10:15 AM','10:30 AM','10:45 AM',
  '11:00 AM','11:15 AM','11:30 AM','11:45 AM',
  '12:00 PM','12:15 PM','12:30 PM','12:45 PM',
  '1:00 PM','1:15 PM','1:30 PM','1:45 PM',
  '2:00 PM','2:15 PM','2:30 PM','2:45 PM',
  '3:00 PM','3:15 PM','3:30 PM','3:45 PM',
  '4:00 PM','4:15 PM','4:30 PM','4:45 PM',
  '5:00 PM','5:15 PM','5:30 PM','5:45 PM',
  '6:00 PM','6:15 PM','6:30 PM','6:45 PM',
  '7:00 PM','7:15 PM','7:30 PM','7:45 PM',
  '8:00 PM',
]

// ── Main component ─────────────────────────────────────────────────────────
export default function DeskAdmin() {
  const router = useRouter()
  const [isBookMode, setIsBookMode] = useState(false)
  const [authed, setAuthed] = useState(false)
  const [checkingAuth, setCheckingAuth] = useState(true)
  const [loggedInName, setLoggedInName] = useState('Kokoni')
  // null = full access (either unrestricted, or not loaded yet). A non-null
  // array restricts the sidebar (and this admin's access) to just those tabs.
  const [allowedTabs, setAllowedTabs] = useState<string[] | null>(null)

  const [tab, setTab] = useState<TabKey>('today')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [loading, setLoading] = useState(false)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [pendingCount, setPendingCount] = useState<number>(0)
  const prevPendingCountRef = useRef<number | null>(null)
  const confirmedGroomerIdsRef = useRef<Set<string>>(new Set())
  const audioCtxRef = useRef<AudioContext | null>(null)

  // Clients
  const [clients, setClients] = useState<ClientRecord[]>([])
  const [clientsLoading, setClientsLoading] = useState(false)
  const [clientSearch, setClientSearch] = useState('')
  const [clientTagFilter, setClientTagFilter] = useState<string[]>([])
  const [expandedClient, setExpandedClient] = useState<string | null>(null)
  const [expandedPetHistoryIds, setExpandedPetHistoryIds] = useState<Set<string>>(new Set())
  // Intake inline-editing state
  const [intakeEditId, setIntakeEditId] = useState<string | null>(null)
  const [intakeFirstName, setIntakeFirstName] = useState('')
  const [intakeLastName, setIntakeLastName] = useState('')
  const [intakeEmail, setIntakeEmail] = useState('')
  const [intakeBreed, setIntakeBreed] = useState('')
  const [intakeWeight, setIntakeWeight] = useState('')
  const [intakeVaccine, setIntakeVaccine] = useState('')
  const [intakeNotes, setIntakeNotes] = useState('')
  const [intakeSaving, setIntakeSaving] = useState(false)
  const [uploadingPetId, setUploadingPetId] = useState<string | null>(null)
  const [uploadDonePetId, setUploadDonePetId] = useState<string | null>(null)

  // Client editing
  const [editingClient, setEditingClient] = useState<string | null>(null)
  const [clientEditData, setClientEditData] = useState<{ firstName: string; lastName: string; phone: string; email: string; address: string } | null>(null)
  const [savingClient, setSavingClient] = useState(false)
  const [newPickupName, setNewPickupName] = useState('')
  const [newPickupRel, setNewPickupRel] = useState('')
  const [addingPickupFor, setAddingPickupFor] = useState<string | null>(null)

  // Vaccine records
  const [vaccineRecords, setVaccineRecords] = useState<VaccineRecord[]>([])
  const [vaccineLoading, setVaccineLoading] = useState(false)
  const [vaccineCount, setVaccineCount] = useState(0)
  const [approvingId, setApprovingId] = useState<string | null>(null)
  const [vaccineFilter, setVaccineFilter] = useState<'all' | 'uploaded' | 'email' | 'text'>('all')
  const [vaccineShowAll, setVaccineShowAll] = useState(false)
  const [vaccineError, setVaccineError] = useState<string | null>(null)
  const [expiryEditing, setExpiryEditing] = useState<string | null>(null)   // pet id being edited (Clients tab)
  const [expiryValue, setExpiryValue] = useState('')                        // date string YYYY-MM-DD (Clients tab)
  const [savingExpiry, setSavingExpiry] = useState(false)
  const [rowExpiryValues, setRowExpiryValues] = useState<Record<string, string>>({}) // petId → date for Vaccine Records rows

  // Reviews
  const [reviewMetrics, setReviewMetrics] = useState<{ sent: number; responses: number; positive: number; negative: number; responseRate: number }>({ sent: 0, responses: 0, positive: 0, negative: 0, responseRate: 0 })
  const [reviewAlerts, setReviewAlerts] = useState<any[]>([])
  const [reviewsLoading, setReviewsLoading] = useState(false)
  const [reviewSettings, setReviewSettings] = useState<any>(null)
  const [reviewSettingsEdit, setReviewSettingsEdit] = useState<any>(null)
  const [reviewSettingsSaving, setReviewSettingsSaving] = useState(false)
  const [reviewSettingsMode, setReviewSettingsMode] = useState<'view' | 'edit'>('view')

  // Calendar
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}`
  })
  const [calendarAppts, setCalendarAppts] = useState<Appointment[]>([])
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const [calendarStaffFilter, setCalendarStaffFilter] = useState<string>('all')
  const [todayGroupByStaff, setTodayGroupByStaff] = useState(false)
  // Which day the Today view is showing (defaults to the salon's current day).
  // Lets the owner step back through history with the same timeline detail.
  const salonDayStr = () => { const n = salonNow(); if (n.getHours() < 4) n.setDate(n.getDate() - 1); return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}` }
  const [todayViewDate, setTodayViewDate] = useState<string>(salonDayStr)
  const [blockedTimes, setBlockedTimes] = useState<{date:string;time:string;reason:string|null}[]>([])
  const [blockingSlot, setBlockingSlot] = useState<{date:string;time:string}|null>(null)
  const [blockReason, setBlockReason] = useState('')
  const [savingBlock, setSavingBlock] = useState(false)

  // Quick-add appointment from calendar
  const [addingApptSlot, setAddingApptSlot] = useState<{date:string;time:string}|null>(null)
  const [addApptPhone, setAddApptPhone] = useState('')
  const [addApptClientName, setAddApptClientName] = useState('')
  const [addApptFirstName, setAddApptFirstName] = useState('')
  const [addApptLastName, setAddApptLastName] = useState('')
  const [addApptEmail, setAddApptEmail] = useState('')
  const [addApptPetId, setAddApptPetId] = useState('')
  const [addApptPetName, setAddApptPetName] = useState('')
  const [addApptBreed, setAddApptBreed] = useState('')
  const [addApptWeight, setAddApptWeight] = useState('')
  const [addApptVaccine, setAddApptVaccine] = useState('pending')
  const [addApptService, setAddApptService] = useState('bath_brush')
  const [addApptSaving, setAddApptSaving] = useState(false)
  const [addApptClientData, setAddApptClientData] = useState<{name:string;pets:{id:string;name:string;breed?:string;weight?:string}[]}|null>(null)
  const [addApptPhoneLooking, setAddApptPhoneLooking] = useState(false)

  // Appointment detail slide-over
  const [detailAppt, setDetailAppt] = useState<Appointment | null>(null)
  const [detailTab, setDetailTab] = useState<'appt' | 'customer' | 'payment' | 'future' | 'notes'>('appt')
  // Stack of appointments we drilled in from (e.g. clicking "View" on a past
  // visit in the History tab) so we can jump back to where we started.
  const [detailApptBackStack, setDetailApptBackStack] = useState<Appointment[]>([])
  const [detailClient, setDetailClient] = useState<ClientRecord | null>(null)
  const [detailClientLoading, setDetailClientLoading] = useState(false)
  const [smsConsentSaving, setSmsConsentSaving] = useState(false)
  // Which History-tab past visit is expanded inline (view details without
  // leaving the current appointment popup).
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null)
  // Editing the supervisor note inline from the History tab (id of the
  // appointment being edited, or null). Unlike the groomer's own diary note
  // (which only the groomer can edit, from the groomer dashboard), admin can
  // add/edit this supervisor note at any time — no lock window, since it's
  // admin's own note rather than an edit on the groomer's behalf.
  const [editingHistorySupervisorId, setEditingHistorySupervisorId] = useState<string | null>(null)
  const [historySupervisorDraft, setHistorySupervisorDraft] = useState('')
  const [savingHistorySupervisor, setSavingHistorySupervisor] = useState(false)
  // Tags for the pet on the currently-open Calendar/appointment detail popup
  // (separate from the Pet Parents page's tag state — this popup shows a
  // single appointment's pet, fetched fresh each time it opens).
  const [detailPetTags, setDetailPetTags] = useState<PetTag[]>([])
  // Editing the supervisor note for the appointment currently open in the
  // Calendar detail popup (this visit's own note, not a past one).
  const [editingApptSupervisor, setEditingApptSupervisor] = useState(false)
  const [apptSupervisorDraft, setApptSupervisorDraft] = useState('')
  const [savingApptSupervisor, setSavingApptSupervisor] = useState(false)

  const saveHistorySupervisor = async (apptId: string) => {
    setSavingHistorySupervisor(true)
    try {
      const supervisor_note = historySupervisorDraft.trim()
      const res = await fetch(`/api/admin/appointments/${apptId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update-supervisor-note',
          supervisor_note,
          supervisor_note_author: loggedInName || '',
        }),
      })
      const data = await res.json()
      if (data.success) {
        setDetailClient(prev => prev ? {
          ...prev,
          appointments: prev.appointments.map(a => a.id === apptId ? { ...a, grooming_quality: data.grooming_quality } as typeof a : a),
        } : prev)
        setEditingHistorySupervisorId(null)
      } else {
        alert('Save failed — please try again')
      }
    } catch {
      alert('Save failed — check connection')
    } finally {
      setSavingHistorySupervisor(false)
    }
  }

  // Editable supervisor note for the appointment currently open in the
  // Calendar detail popup (this visit, not a past one — see saveHistorySupervisor
  // above for the History-tab equivalent).
  const saveApptSupervisor = async () => {
    if (!detailAppt) return
    setSavingApptSupervisor(true)
    try {
      const supervisor_note = apptSupervisorDraft.trim()
      const res = await fetch(`/api/admin/appointments/${detailAppt.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update-supervisor-note',
          supervisor_note,
          supervisor_note_author: loggedInName || '',
        }),
      })
      const data = await res.json()
      if (data.success) {
        setDetailAppt(prev => prev ? { ...prev, grooming_quality: data.grooming_quality } as typeof prev : prev)
        setAppointments(prev => prev.map(a => a.id === detailAppt.id ? { ...a, grooming_quality: data.grooming_quality } as typeof a : a))
        setEditingApptSupervisor(false)
      } else {
        alert('Save failed — please try again')
      }
    } catch {
      alert('Save failed — check connection')
    } finally {
      setSavingApptSupervisor(false)
    }
  }

  // Staff-recorded SMS opt-in (e.g. customer agreed verbally at checkout but
  // never checked the box during booking). Only ever turns consent ON.
  const grantSmsConsent = async (phone: string) => {
    setSmsConsentSaving(true)
    try {
      const res = await fetch('/api/admin/clients', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, sms_consent: true }),
      })
      if (res.ok) {
        const consentAt = new Date().toISOString()
        setDetailClient(prev => prev ? { ...prev, sms_consent: true, sms_consent_at: consentAt } : prev)
        setClients(prev => prev.map(c => c.phone === phone ? { ...c, sms_consent: true, sms_consent_at: consentAt } : c))
      }
    } catch {/**/}
    finally { setSmsConsentSaving(false) }
  }
  const [detailFutureAppts, setDetailFutureAppts] = useState<Appointment[]>([])
  const [detailFutureLoading, setDetailFutureLoading] = useState(false)
  const [detailNotes, setDetailNotes] = useState('')
  const [noteAuthor, setNoteAuthor] = useState('')
  const [editingNotes, setEditingNotes] = useState(false)
  const [savingDetailNotes, setSavingDetailNotes] = useState(false)
  const [detailActionLoading, setDetailActionLoading] = useState<string | null>(null)

  // Reschedule (detail panel)
  const [detailRescheduleDate, setDetailRescheduleDate] = useState('')
  const [detailRescheduleTime, setDetailRescheduleTime] = useState('')
  const [savingReschedule, setSavingReschedule] = useState(false)
  const [showRescheduleInputs, setShowRescheduleInputs] = useState(false)

  // Inline reschedule (Today tab row button)
  const [inlineRescheduleAppt, setInlineRescheduleAppt] = useState<Appointment | null>(null)
  const [inlineRescheduleDate, setInlineRescheduleDate] = useState('')
  const [inlineRescheduleTime, setInlineRescheduleTime] = useState('')
  const [inlineRescheduleSlots, setInlineRescheduleSlots] = useState<string[]>([])
  const [inlineRescheduleLoading, setInlineRescheduleLoading] = useState(false)
  const [inlineRescheduleSaving, setInlineRescheduleSaving] = useState(false)

  // Staff assignment in detail panel
  const [detailGroomer, setDetailGroomer] = useState('')
  const [detailBather, setDetailBather] = useState('')
  const [savingStaff, setSavingStaff] = useState(false)

  // Payment in detail panel
  const [detailPayAmount, setDetailPayAmount] = useState('')
  const [detailTipAmount, setDetailTipAmount] = useState('')
  const [detailPayMethod, setDetailPayMethod] = useState('cash')
  const [detailPayStatus, setDetailPayStatus] = useState('unpaid')
  const [savingPayment, setSavingPayment] = useState(false)
  const [totalSaved, setTotalSaved] = useState(false)
  // Discount codes (shared with groomer): pick from the coupon list, first-visit-only gated
  type DeskCoupon = { id: string; name: string; code: string | null; discount_type: 'percent' | 'fixed'; discount_value: number; active: boolean; first_visit_only?: boolean }
  const [availableCoupons, setAvailableCoupons] = useState<DeskCoupon[]>([])
  const [detailCouponId, setDetailCouponId] = useState<string | null>(null)
  // null = unknown (detection not yet run / failed), true = has a prior PAID visit
  // (returning), false = no prior paid visit (first-time). First-visit-only coupons
  // are only blocked when we POSITIVELY know the customer is returning.
  const [detailHasPriorPaid, setDetailHasPriorPaid] = useState<boolean | null>(null)
  // Add-on services before checkout
  const [detailBasePrice, setDetailBasePrice] = useState('')
  const [detailBaseTier, setDetailBaseTier] = useState('')  // tier label to avoid same-price collision
  const [detailAddOns, setDetailAddOns] = useState<{id: string; name: string; price: string}[]>([])
  const [detailAddonDraft, setDetailAddonDraft] = useState({ text: '', price: '' })
  // Inline price editing for service tiers
  const [detailEditTiersMode, setDetailEditTiersMode] = useState(false)
  const [detailEditTiers, setDetailEditTiers] = useState<{label:string;price:string;duration:string}[]>([])
  const [savingTiers, setSavingTiers] = useState(false)
  // Change service
  const [changingService, setChangingService] = useState(false)
  const [savingServiceChange, setSavingServiceChange] = useState(false)
  // Notes translation (3-way: EN + 繁體 + 簡體, auto on type)
  const [translatingNotes, setTranslatingNotes] = useState(false)
  const [noteTranslations, setNoteTranslations] = useState<{english:string;traditional:string;simplified:string;detected:string} | null>(null)
  const noteTranslateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const noteIsComposingRef = useRef(false)
  const noteInputRef = useRef<HTMLTextAreaElement>(null)

  // Settings
  const [settingsLoading, setSettingsLoading] = useState(false)
  const [timezone, setTimezone] = useState('America/Los_Angeles')
  const [openDays, setOpenDays] = useState<number[]>([1,2,3,4,5,6])
  const [openTime, setOpenTime] = useState('9:00 AM')
  const [closeTime, setCloseTime] = useState('5:00 PM')
  const [appointmentInterval, setAppointmentInterval] = useState<15 | 30>(30)
  const [settingsSaved, setSettingsSaved] = useState(false)
  const [blockedDates, setBlockedDates] = useState<{id:string;date:string;reason:string|null}[]>([])
  const [newBlockDate, setNewBlockDate] = useState('')
  const [newBlockReason, setNewBlockReason] = useState('')

  // ── Tags ──
  type Tag = { id: string; name: string; color: string }
  const [tags, setTags] = useState<Tag[]>([])
  const [newTagName, setNewTagName] = useState('')
  const [newTagColor, setNewTagColor] = useState('sky')
  const [savingTag, setSavingTag] = useState(false)

  // Service pricing
  type PriceTier = { label: string; price: string; duration: string }
  type ServicePricingMap = Record<string, PriceTier[]>
  const DEFAULT_TIERS: PriceTier[] = [
    { label: 'Small (under 15 lbs)', price: '', duration: '' },
    { label: 'Medium (16–30 lbs)',  price: '', duration: '' },
    { label: 'Large (31–50 lbs)',   price: '', duration: '' },
    { label: 'XL (51–70 lbs)',        price: '', duration: '' },
  ]
  const [servicePricing, setServicePricing] = useState<ServicePricingMap>({
    simply_cute:  DEFAULT_TIERS.map(t => ({...t})),
    bath_brush:   DEFAULT_TIERS.map(t => ({...t})),
    asian_fusion: DEFAULT_TIERS.map(t => ({...t})),
  })
  const [pricingSaved, setPricingSaved] = useState(false)

  // Staff
  const [staff, setStaff] = useState<StaffMember[]>([])
  const [newStaffName, setNewStaffName] = useState('')
  const [newStaffRole, setNewStaffRole] = useState('groomer')

  // Payroll
  const [payrollStartDate, setPayrollStartDate] = useState('')
  const [payrollEndDate, setPayrollEndDate] = useState('')
  const [payrollPayDate, setPayrollPayDate] = useState('')
  const [payrollNotes, setPayrollNotes] = useState('')
  const [payrollSelectedGroomer, setPayrollSelectedGroomer] = useState('')
  type PayrollDailyRow = {date:string;appts:number;revenue:number;tips:number;commission:number;tipShare:number}
  type PayrollGroomerRow = {name:string;appts:number;revenue:number;tips:number;commission:number;tipShare:number;commRate:number;tipRate:number}
  type PayrollReportData = {daily: PayrollDailyRow[]; groomers: PayrollGroomerRow[]; dailyByGroomer: Record<string, PayrollDailyRow[]>}
  const [payrollReport, setPayrollReport] = useState<PayrollReportData|null>(null)

  // Reports
  const [reportsRange, setReportsRange] = useState<'today' | 'week' | 'this_payroll' | 'last_payroll' | 'month' | 'last_month' | 'all' | 'custom'>('month')
  const [reportsShowDetails, setReportsShowDetails] = useState(false)
  const [incomeChartRange, setIncomeChartRange] = useState<'today' | 'week' | 'this_payroll' | 'last_payroll'>('week')
  const [revenueChartGroomer, setRevenueChartGroomer] = useState<string>('') // '' = whole store
  const [tipsChartGroomer, setTipsChartGroomer] = useState<string>('') // '' = whole store
  const [perfGroomer, setPerfGroomer] = useState<string>('')
  const [perfRange, setPerfRange] = useState<'today' | 'week' | 'this_payroll' | 'last_payroll' | 'month' | 'last_month'>('today')
  const [reportsCustomStart, setReportsCustomStart] = useState('')
  const [reportsCustomEnd, setReportsCustomEnd] = useState('')
  const [reportsAppts, setReportsAppts] = useState<Appointment[]>([])
  const [reportsLoading, setReportsLoading] = useState(false)
  // (report inline-edit state removed with the By Groomer section — edits happen in Cashier)
  const [reportSavingId, setReportSavingId] = useState<string | null>(null)

  // Cashier
  const [cashierRange, setCashierRange] = useState<'today' | 'week' | 'month' | 'custom'>('today')
  const [cashierCustomDate, setCashierCustomDate] = useState('')
  const [cashierExpandedId, setCashierExpandedId] = useState<string | null>(null)
  const [cashierMode, setCashierMode] = useState<'pay' | 'edit' | null>(null)
  const [cashierAmount, setCashierAmount] = useState('')
  const [cashierTip, setCashierTip] = useState('')
  const [cashierService, setCashierService] = useState('')
  const [cashierSavingId, setCashierSavingId] = useState<string | null>(null)

  // Services
  const [services, setServices] = useState<ServiceDef[]>([
    { id: 'simply_cute', name: 'Simply Cute', desc: 'Classic clean cut, bath, blow-dry & finishing touches', price: '', tiers: DEFAULT_TIERS.map(t => ({...t})) },
    { id: 'bath_brush', name: 'Bath & Brush', desc: 'Thorough bath, blow-dry & brush-out', price: '', tiers: DEFAULT_TIERS.map(t => ({...t})) },
    { id: 'asian_fusion', name: 'Asian Fusion Style', desc: 'Creative styling with a modern Asian-inspired look', price: '', tiers: DEFAULT_TIERS.map(t => ({...t})) },
  ])
  // Dynamic lookup: static labels + anything added via Settings
  const serviceMap: Record<string, string> = {
    ...SERVICE_LABELS,
    ...Object.fromEntries(services.filter(s => s.name).map(s => [s.id, s.name])),
  }
  const [servicesSaved, setServicesSaved] = useState(false)
  const [hoursSaved, setHoursSaved] = useState(false)

  // Grooming board
  const [groomingAppts, setGroomingAppts] = useState<Appointment[]>([])
  const [groomingLoading, setGroomingLoading] = useState(false)
  const [groomingView, setGroomingView] = useState<'list' | 'board'>('list')
  const [groomingUpdating, setGroomingUpdating] = useState<string | null>(null)
  const [groomingCelebrate, setGroomingCelebrate] = useState<Appointment | null>(null)
  const [groomingSmsAlert, setGroomingSmsAlert] = useState<string | null>(null)

  // Delete confirmation
  const [deletingApptId, setDeletingApptId] = useState<string | null>(null)
  const [deletingPetId, setDeletingPetId] = useState<string | null>(null)

  // Vaccine status inline edit
  const [editingVaccineId, setEditingVaccineId] = useState<string | null>(null)
  const [savingVaccineId, setSavingVaccineId] = useState<string | null>(null)

  // Weight inline edit (clients tab + appointment popup)
  const [editingWeightId, setEditingWeightId] = useState<string | null>(null)
  const [editingWeightValue, setEditingWeightValue] = useState('')
  const [customWeightText, setCustomWeightText] = useState('')
  const [savingWeightId, setSavingWeightId] = useState<string | null>(null)
  const [editingApptWeight, setEditingApptWeight] = useState(false)
  const [apptWeightDraft, setApptWeightDraft] = useState('')
  const [savingNameId, setSavingNameId] = useState<string | null>(null)
  const [editingApptName, setEditingApptName] = useState(false)
  const [petNameDraft, setPetNameDraft] = useState('')

  useEffect(() => {
    const bookMode = new URLSearchParams(window.location.search).get('mode') === 'book'
    if (bookMode) {
      setIsBookMode(true)
      setTab('calendar')
      setAuthed(true)
      setCheckingAuth(false)
    } else {
      try {
        const auth = JSON.parse(readAuthRaw('admin') || 'null')
        if (auth?.role === 'admin') {
          setAuthed(true)
          setLoggedInName(auth.name || 'Kokoni')
          // Re-check permissions against the live staff record (not the
          // possibly-stale login-time snapshot) so a change made in Settings
          // takes effect on next page load, not next login.
          fetch('/api/admin/staff').then(r => r.json()).then(d => {
            const me = (d.staff || []).find((s: { username?: string }) => s.username?.toLowerCase() === auth.username?.toLowerCase())
            const allowed = me?.permissions?.allowed_tabs
            setAllowedTabs(Array.isArray(allowed) ? allowed : null)
          }).catch(() => setAllowedTabs(null))
        } else {
          router.push('/login')
        }
      } catch {
        router.push('/login')
      }
      setCheckingAuth(false)
    }
    // Load active discount codes for the appointment popup
    fetch('/api/admin/coupons').then(r => r.json()).then(d => {
      setAvailableCoupons((d.coupons ?? []).filter((c: DeskCoupon) => c.active))
    }).catch(() => {})
  }, [router])

  // If this admin is restricted and the current tab isn't one they're allowed
  // to see (e.g. the default 'today' tab), jump to their first allowed tab.
  useEffect(() => {
    if (allowedTabs && allowedTabs.length > 0 && !allowedTabs.includes(tab)) {
      setTab(allowedTabs[0] as TabKey)
    }
  }, [allowedTabs, tab])

  // No-op — AudioContext created on demand inside play functions

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000) }

  // ── Data fetching ─────────────────────────────────────────────────────────
  const fetchAppointments = useCallback(async (status: string, date?: string) => {
    setLoading(true)
    try {
      const url = date ? `/api/admin/appointments?status=${status}&date=${date}` : `/api/admin/appointments?status=${status}`
      const res = await fetch(url)
      const data = await res.json()
      setAppointments(data.appointments || [])
    } catch { setAppointments([]) }
    setLoading(false)
  }, [])

  // Today tab: (re)load appointments whenever the tab opens or the viewed day changes.
  useEffect(() => {
    if (tab === 'today') fetchAppointments('today', todayViewDate)
  }, [tab, todayViewDate, fetchAppointments])

  const fetchCalendar = useCallback(async () => {
    setLoading(true)
    try {
      const [apptRes, btRes, sRes] = await Promise.all([
        fetch(`/api/admin/appointments?status=month&month=${calendarMonth}`),
        fetch('/api/admin/blocked-times'),
        fetch('/api/admin/settings'),
      ])
      const apptData = await apptRes.json()
      const btData = await btRes.json()
      const sData = await sRes.json()
      setCalendarAppts(apptData.appointments || [])
      setBlockedTimes(btData.blocked_times || [])
      const s = sData.settings || {}
      if (s.open_time) setOpenTime(s.open_time)
      if (s.close_time) setCloseTime(s.close_time)
    } catch { setCalendarAppts([]) }
    setLoading(false)
  }, [calendarMonth])

  const fetchClients = useCallback(async () => {
    setClientsLoading(true)
    try {
      const res = await fetch('/api/admin/clients')
      const data = await res.json()
      setClients(data.clients || [])
    } catch { setClients([]) }
    setClientsLoading(false)
  }, [])

  const uploadPetPhoto = async (petId: string, file: File) => {
    setUploadingPetId(petId)
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const img = new window.Image()
        img.onload = () => {
          const MAX = 1200
          let { width, height } = img
          if (width > MAX || height > MAX) {
            if (width > height) { height = Math.round((height / width) * MAX); width = MAX }
            else { width = Math.round((width / height) * MAX); height = MAX }
          }
          const canvas = document.createElement('canvas')
          canvas.width = width; canvas.height = height
          canvas.getContext('2d')!.drawImage(img, 0, 0, width, height)
          resolve(canvas.toDataURL('image/jpeg', 0.85).split(',')[1])
        }
        img.onerror = reject
        img.src = URL.createObjectURL(file)
      })
      const res = await fetch('/api/pets/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ petId, fileBase64: base64, contentType: 'image/jpeg', ext: 'jpg' }),
      })
      const data = await res.json()
      if (data.url) {
        setClients(prev => prev.map(c => ({
          ...c,
          pets: c.pets.map(p => p.id === petId ? { ...p, photo_url: data.url } : p)
        })))
        setUploadDonePetId(petId)
        setTimeout(() => setUploadDonePetId(null), 2000)
        showToast('Photo updated!')
      } else {
        showToast('⚠️ Upload failed')
      }
    } catch { showToast('⚠️ Upload error') }
    finally { setUploadingPetId(null) }
  }

  const saveClientEdit = async (phone: string) => {
    if (!clientEditData) return
    setSavingClient(true)
    const newPhone = clientEditData.phone.replace(/\D/g, '')
    try {
      const res = await fetch('/api/admin/clients', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, newPhone: newPhone !== phone ? newPhone : undefined, name: `${clientEditData.firstName.trim()} ${clientEditData.lastName.trim()}`.trim(), email: clientEditData.email, address: clientEditData.address }),
      })
      const data = await res.json()
      if (data.success) {
        const fullName = `${clientEditData.firstName.trim()} ${clientEditData.lastName.trim()}`.trim()
        const effectivePhone = newPhone !== phone ? newPhone : phone
        setClients(prev => prev.map(c => c.phone === phone ? { ...c, phone: effectivePhone, name: fullName, email: clientEditData!.email, address: clientEditData!.address } : c))
        setEditingClient(null)
        setClientEditData(null)
        showToast('Client info saved!')
      } else {
        showToast('⚠️ Save failed')
      }
    } catch { showToast('⚠️ Save error') }
    finally { setSavingClient(false) }
  }

  const [deletingClient, setDeletingClient] = useState<string|null>(null)
  const [confirmDeleteClient, setConfirmDeleteClient] = useState<string|null>(null)
  const [showDeletedClients, setShowDeletedClients] = useState(false)
  const [loadingDeletedClients, setLoadingDeletedClients] = useState(false)
  const [deletedClientsData, setDeletedClientsData] = useState<{ id: string; deleted_at: string; phone: string; client?: { name?: string; email?: string; address?: string }; pets?: { id: string; name: string; breed?: string; weight?: string }[]; appointments?: { id: string; appointment_date: string; service: string; payment_amount?: string }[] }[]>([])
  const [deletedClientsSearch, setDeletedClientsSearch] = useState('')
  const [expandedDeletedId, setExpandedDeletedId] = useState<string|null>(null)

  const openDeletedClients = async () => {
    setShowDeletedClients(true)
    setLoadingDeletedClients(true)
    try {
      const res = await fetch('/api/admin/deleted-clients')
      const data = await res.json()
      setDeletedClientsData(data.records ?? [])
    } catch { /* noop */ }
    finally { setLoadingDeletedClients(false) }
  }

  const handleDeleteClient = async (phone: string) => {
    setDeletingClient(phone)
    try {
      const res = await fetch('/api/admin/clients', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      })
      const data = await res.json()
      if (data.success) {
        setClients(prev => prev.filter(c => c.phone !== phone))
        setExpandedClient(null)
        setConfirmDeleteClient(null)
        showToast('Client deleted')
      } else {
        showToast('⚠️ Delete failed')
      }
    } catch { showToast('⚠️ Delete error') }
    finally { setDeletingClient(null) }
  }

  const addPickup = async (clientPhone: string) => {
    if (!newPickupName.trim()) return
    try {
      const res = await fetch('/api/admin/pickups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: clientPhone, name: newPickupName, relationship: newPickupRel }),
      })
      const data = await res.json()
      if (data.pickup) {
        setClients(prev => prev.map(c => c.phone === clientPhone
          ? { ...c, authorized_pickups: [...(c.authorized_pickups || []), data.pickup] }
          : c))
        setNewPickupName('')
        setNewPickupRel('')
        setAddingPickupFor(null)
        showToast('Pickup person added!')
      } else {
        showToast('⚠️ Failed to add pickup')
      }
    } catch { showToast('⚠️ Error adding pickup') }
  }

  const removePickup = async (clientPhone: string, pickupId: string) => {
    try {
      const res = await fetch('/api/admin/pickups', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: pickupId }),
      })
      const data = await res.json()
      if (data.success) {
        setClients(prev => prev.map(c => c.phone === clientPhone
          ? { ...c, authorized_pickups: c.authorized_pickups.filter(p => p.id !== pickupId) }
          : c))
        showToast('Pickup person removed')
      }
    } catch { showToast('⚠️ Error removing pickup') }
  }

  const openApptDetail = async (appt: Appointment, opts?: { keepBackStack?: boolean }) => {
    if (!opts?.keepBackStack) setDetailApptBackStack([])
    setExpandedHistoryId(null)
    setDetailAppt(appt)
    setDetailTab('appt')
    setDetailNotes(appt.notes || '')
    setEditingNotes(false)
    setDetailRescheduleDate(appt.appointment_date)
    setDetailRescheduleTime(appt.appointment_time)
    setDetailGroomer(appt.assigned_groomer || '')
    setDetailBather(appt.assigned_bather || '')
    setDetailPayAmount(appt.payment_amount || '')
    setDetailTipAmount(appt.tip_amount || '')
    setDetailPayMethod(appt.payment_method || 'cash')
    setDetailPayStatus(appt.payment_status || 'unpaid')
    setTotalSaved(!!appt.payment_amount)
    // Restore saved discount state (persisted by record-payment)
    const savedDiscountAmt = parseFloat((appt as { discount_amount?: string | null }).discount_amount || '') || 0
    // Restore the discount as a coupon selection (match by name, else by percent)
    if (savedDiscountAmt > 0) {
      const dLabel = (appt as { discount_label?: string | null }).discount_label || ''
      const dPct = parseFloat((appt as { discount_percent?: string | null }).discount_percent || '')
      const matched = availableCoupons.find(c => c.name === dLabel)
        ?? availableCoupons.find(c => !isNaN(dPct) && c.discount_type === 'percent' && c.discount_value === dPct)
      setDetailCouponId(matched?.id ?? null)
    } else {
      setDetailCouponId(null)
    }
    // Detect whether this customer has a previous PAID appointment (returning).
    setDetailHasPriorPaid(null) // unknown until the lookup resolves
    if (appt.pets?.id) {
      fetch(`/api/groomer/last-payment?pet_id=${appt.pets.id}&exclude_id=${appt.id}`)
        .then(r => r.json()).then(d => setDetailHasPriorPaid(!!d?.amount)).catch(() => {})
    }
    // Load saved add-ons from notes_list (is_addon: true entries)
    const savedAddOns = (appt.notes_list ?? [])
      .filter((n: { is_addon?: boolean }) => n.is_addon)
      .map((n: { id: string; text: string; price?: string }) => ({ id: n.id, name: n.text, price: n.price ?? '' }))
    setDetailAddOns(savedAddOns)
    setDetailAddonDraft({ text: '', price: '' })
    // Base price = total minus add-ons. payment_amount is post-discount, so add
    // the saved discount back to reconstruct the pre-discount base — the toggle
    // (restored above) then re-derives the same discounted total.
    if (appt.payment_amount) {
      const addonTotal = savedAddOns.reduce((s: number, a: { price: string }) => s + (parseFloat(a.price) || 0), 0)
      const base = parseFloat(appt.payment_amount) + savedDiscountAmt - addonTotal
      setDetailBasePrice(base > 0 ? base.toString() : appt.payment_amount)
    } else {
      setDetailBasePrice('')
    }
    // Restore the saved size tier so the exact tile re-highlights (even when
    // multiple sizes share the same price).
    setDetailBaseTier((appt as { size_tier?: string | null }).size_tier || '')
    setDetailEditTiersMode(false)
    setDetailEditTiers([])
    setNoteTranslations(null)
    setDetailClient(null)
    setDetailFutureAppts([])
    setShowRescheduleInputs(false)

    // Fetch this pet's tags fresh each time the popup opens
    setDetailPetTags([])
    if (appt.pets?.id) {
      fetch(`/api/admin/pet-tags?pet_id=${appt.pets.id}`)
        .then(r => r.json())
        .then(d => setDetailPetTags((d.tags ?? []) as PetTag[]))
        .catch(() => {/**/})
    }
    setEditingApptDiary(false)

    // Fetch full client record (address, pickups, etc.)
    setDetailClientLoading(true)
    try {
      const res = await fetch(`/api/admin/clients?phone=${appt.client_phone}`)
      const data = await res.json()
      setDetailClient((data.clients || [])[0] ?? null)
    } catch {/**/}
    finally { setDetailClientLoading(false) }

    // Fetch upcoming appointments for this client
    setDetailFutureLoading(true)
    try {
      const res = await fetch(`/api/admin/appointments?status=client&clientPhone=${appt.client_phone}`)
      const data = await res.json()
      setDetailFutureAppts((data.appointments || []).filter((a: Appointment) => a.id !== appt.id))
    } catch {/**/}
    finally { setDetailFutureLoading(false) }
  }

  // Drilling into a past visit from the History tab: remember what we were
  // looking at so "← Back" can return to it instead of leaving a dead end.
  const viewHistoryAppt = (appt: Appointment) => {
    setDetailApptBackStack(prev => detailAppt ? [...prev, detailAppt] : prev)
    openApptDetail(appt, { keepBackStack: true })
  }
  const goBackDetailAppt = () => {
    setDetailApptBackStack(prev => {
      if (prev.length === 0) return prev
      const next = prev[prev.length - 1]
      openApptDetail(next, { keepBackStack: true })
      return prev.slice(0, -1)
    })
  }
  const closeDetailAppt = () => {
    setDetailAppt(null)
    setDetailApptBackStack([])
  }

  const detailHandleAction = async (action: 'confirm' | 'decline' | 'start' | 'complete') => {
    if (!detailAppt) return
    setDetailActionLoading(action)
    try {
      const res = await fetch(`/api/admin/appointments/${detailAppt.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const data = await res.json()
      if (data.success) {
        const newStatus = action === 'confirm' ? 'confirmed' : action === 'decline' ? 'cancelled' : action === 'start' ? 'in_progress' : 'completed'
        setDetailAppt(prev => prev ? { ...prev, status: newStatus } : prev)
        setAppointments(prev => prev.map(a => a.id === detailAppt.id ? { ...a, status: newStatus } : a))
        setCalendarAppts(prev => prev.map(a => a.id === detailAppt.id ? { ...a, status: newStatus } : a))
        showToast(action === 'confirm' ? '✓ Confirmed! SMS sent.' : action === 'decline' ? 'Declined.' : action === 'start' ? 'Checked in!' : 'Completed!')
        if (action === 'confirm' || action === 'decline') setDetailAppt(null)
      }
    } catch {/**/}
    finally { setDetailActionLoading(null) }
  }

  const detailUpdateGroomingStatus = async (newStatus: string) => {
    if (!detailAppt) return
    setDetailActionLoading('grooming-' + newStatus)
    try {
      const res = await fetch(`/api/admin/appointments/${detailAppt.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'grooming-status', grooming_status: newStatus }),
      })
      const data = await res.json()
      if (data.success) {
        const now = new Date().toISOString()
        setDetailAppt(prev => prev ? { ...prev, grooming_status: newStatus, grooming_status_updated_at: now } : prev)
        setGroomingAppts(prev => prev.map(a => a.id === detailAppt.id ? { ...a, grooming_status: newStatus, grooming_status_updated_at: now } : a))
        if (newStatus === 'ready') showToast('📱 SMS sent — pet is ready!')
        if (newStatus === 'done') showToast('🎉 Checked out!')
      }
    } catch {/**/}
    finally { setDetailActionLoading(null) }
  }

  const saveDetailNotes = async () => {
    if (!detailAppt) return
    setSavingDetailNotes(true)
    try {
      const newNote: NoteEntry = {
        id: crypto.randomUUID(),
        text: noteInputRef.current?.value?.trim() ?? '',
        author: noteAuthor || 'Staff',
        created_at: new Date().toISOString(),
        notes_english: noteTranslations?.detected !== 'english' ? (noteTranslations?.english ?? null) : null,
        notes_chinese: noteTranslations?.detected !== 'traditional' ? (noteTranslations?.traditional ?? null) : null,
      }

      const res = await fetch(`/api/admin/appointments/${detailAppt.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add-note', note: newNote }),
      })
      const data = await res.json()

      if (!res.ok || data.error) {
        showToast('⚠️ Could not save note')
        return
      }

      setDetailAppt(prev => prev ? {
        ...prev,
        notes_list: data.notes_list,
      } : prev)
      setDetailNotes('')
      setNoteTranslations(null)
      setEditingNotes(false)
      showToast('✓ Note saved!')
    } catch {
      showToast('⚠️ Could not save note')
    }
    finally { setSavingDetailNotes(false) }
  }

  const deleteNote = async (noteId: string) => {
    if (!detailAppt) return
    setSavingDetailNotes(true)
    try {
      // Handle legacy note deletion differently
      const action = noteId === '__legacy__' ? 'delete-legacy-note' : 'delete-note'
      const res = await fetch(`/api/admin/appointments/${detailAppt.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, noteId }),
      })
      const data = await res.json()
      if (!res.ok || data.error) { showToast('⚠️ Could not delete note'); return }

      // Update state based on what was deleted
      if (noteId === '__legacy__') {
        setDetailAppt(prev => prev ? { ...prev, notes: null, notes_english: null, notes_chinese: null, notes_author: null, notes_updated_at: null } : prev)
      } else {
        setDetailAppt(prev => prev ? { ...prev, notes_list: data.notes_list } : prev)
      }
      showToast('🗑️ Note deleted')
    } catch { showToast('⚠️ Could not delete note') }
    finally { setSavingDetailNotes(false) }
  }

  // Auto-translate notes after user stops typing (800ms debounce)
  const triggerAutoTranslate = useCallback((text: string) => {
    if (noteTranslateTimerRef.current) clearTimeout(noteTranslateTimerRef.current)
    if (!text.trim()) { setNoteTranslations(null); return }
    noteTranslateTimerRef.current = setTimeout(async () => {
      setTranslatingNotes(true)
      try {
        const res = await fetch('/api/translate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
        })
        const data = await res.json()
        if (data.english !== undefined || data.traditional !== undefined) {
          setNoteTranslations({
            english: data.english || '',
            traditional: data.traditional || '',
            simplified: data.simplified || '',
            detected: data.detected || 'unknown',
          })
        } else {
          setToast('⚠️ Translation failed'); setTimeout(() => setToast(null), 3000)
        }
      } catch {
        setToast('⚠️ Translation unavailable'); setTimeout(() => setToast(null), 3000)
      } finally {
        setTranslatingNotes(false)
      }
    }, 800)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Re-translate an existing note (for fixing bad translations)
  const retranslateNote = async (noteId: string, text: string) => {
    if (!detailAppt) return
    setSavingDetailNotes(true)
    try {
      const tRes = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      const tData = await tRes.json()
      if (!tData.english && !tData.traditional) {
        showToast('⚠️ Translation failed')
        return
      }
      const newEnglish = tData.detected !== 'english' ? (tData.english || null) : null
      const newChinese = tData.detected !== 'traditional' ? (tData.traditional || null) : null

      if (noteId === '__legacy__') {
        // Update legacy note translations
        const res = await fetch(`/api/admin/appointments/${detailAppt.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'update-notes', notes: text, notes_english: newEnglish, notes_chinese: newChinese }),
        })
        if (res.ok) {
          setDetailAppt(prev => prev ? { ...prev, notes_english: newEnglish, notes_chinese: newChinese } : prev)
          showToast('✓ Re-translated!')
        }
      } else {
        // Update note in notes_list
        const updatedList = (detailAppt.notes_list ?? []).map(n =>
          n.id === noteId ? { ...n, notes_english: newEnglish, notes_chinese: newChinese } : n
        )
        const res = await fetch(`/api/admin/appointments/${detailAppt.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'update-note-translations', noteId, notes_english: newEnglish, notes_chinese: newChinese }),
        })
        if (res.ok) {
          setDetailAppt(prev => prev ? { ...prev, notes_list: updatedList } : prev)
          showToast('✓ Re-translated!')
        }
      }
    } catch { showToast('⚠️ Could not re-translate') }
    finally { setSavingDetailNotes(false) }
  }

  const saveStaffAssignment = async () => {
    if (!detailAppt) return
    setSavingStaff(true)
    try {
      const res = await fetch(`/api/admin/appointments/${detailAppt.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'assign-staff', assigned_groomer: detailGroomer, assigned_bather: detailBather }),
      })
      const data = await res.json()
      if (data.success) {
        setDetailAppt(prev => prev ? { ...prev, assigned_groomer: detailGroomer || null, assigned_bather: detailBather || null } : prev)
        setAppointments(prev => prev.map(a => a.id === detailAppt.id ? { ...a, assigned_groomer: detailGroomer || null, assigned_bather: detailBather || null } : a))
        setCalendarAppts(prev => prev.map(a => a.id === detailAppt.id ? { ...a, assigned_groomer: detailGroomer || null, assigned_bather: detailBather || null } : a))
        showToast('Staff assigned!')
        if (tab === 'requests') setDetailAppt(null)
      }
    } catch {/**/}
    finally { setSavingStaff(false) }
  }

  const rescheduleAppointment = async () => {
    if (!detailAppt || !detailRescheduleDate || !detailRescheduleTime) return
    setSavingReschedule(true)
    try {
      const res = await fetch(`/api/admin/appointments/${detailAppt.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reschedule', appointment_date: detailRescheduleDate, appointment_time: detailRescheduleTime }),
      })
      const data = await res.json()
      if (data.success) {
        const updater = (a: Appointment) =>
          a.id === detailAppt.id
            ? { ...a, appointment_date: detailRescheduleDate, appointment_time: detailRescheduleTime, status: 'pending', groomer_confirmed: false }
            : a
        setDetailAppt(prev => prev ? { ...prev, appointment_date: detailRescheduleDate, appointment_time: detailRescheduleTime, status: 'pending', groomer_confirmed: false } : prev)
        setAppointments(prev => prev.map(updater))
        setCalendarAppts(prev => prev.map(updater))
        showToast('✓ Rescheduled! Groomer needs to re-confirm.')
      } else {
        showToast('⚠️ Reschedule failed')
      }
    } catch { showToast('⚠️ Reschedule error') }
    finally { setSavingReschedule(false) }
  }

  const savePayment = async () => {
    if (!detailAppt) return
    setSavingPayment(true)
    try {
      const res = await fetch(`/api/admin/appointments/${detailAppt.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'record-payment', payment_amount: detailPayAmount, tip_amount: detailTipAmount, payment_method: detailPayMethod, payment_status: detailPayStatus }),
      })
      const data = await res.json()
      if (data.success) {
        setDetailAppt(prev => prev ? { ...prev, payment_amount: detailPayAmount || null, tip_amount: detailTipAmount || null, payment_method: detailPayMethod, payment_status: detailPayStatus } : prev)
        setAppointments(prev => prev.map(a => a.id === detailAppt.id ? { ...a, payment_amount: detailPayAmount || null, tip_amount: detailTipAmount || null, payment_method: detailPayMethod, payment_status: detailPayStatus } : a))
        showToast(detailPayStatus === 'paid' ? '✓ Payment recorded!' : 'Payment updated.')
      }
    } catch {/**/}
    finally { setSavingPayment(false) }
  }

  const addStaff = async () => {
    if (!newStaffName.trim()) return
    await fetch('/api/admin/staff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newStaffName, role: newStaffRole }),
    })
    setNewStaffName('')
    fetchSettings()
  }

  const toggleStaff = async (id: string, is_active: boolean) => {
    await fetch(`/api/admin/staff/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active }),
    })
    fetchSettings()
  }

  const saveServices = async () => {
    // Save full services (with tiers + duration)
    await fetch('/api/admin/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'services', value: JSON.stringify(services) }),
    })
    // Also save derived pricing map for backward compat with detail panel
    const pricingMap: Record<string, { label: string; price: string }[]> = {}
    services.forEach(svc => { if (svc.tiers) pricingMap[svc.id] = svc.tiers })
    await fetch('/api/admin/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'service_pricing', value: JSON.stringify(pricingMap) }),
    })
    setServicesSaved(true)
    setTimeout(() => setServicesSaved(false), 2000)
  }

  const deleteAppointment = async (id: string) => {
    setDeletingApptId(id)
    try {
      const res = await fetch(`/api/admin/appointments/${id}`, { method: 'DELETE' })
      const data = await res.json()
      if (data.success) {
        setDetailAppt(null)
        setAppointments(prev => prev.filter(a => a.id !== id))
        setCalendarAppts(prev => prev.filter(a => a.id !== id))
        showToast('Appointment deleted.')
      } else {
        showToast('⚠️ Delete failed')
      }
    } catch { showToast('⚠️ Delete error') }
    finally { setDeletingApptId(null) }
  }

  const blockTimeSlot = async (date: string, time: string, reason: string) => {
    setSavingBlock(true)
    try {
      const res = await fetch('/api/admin/blocked-times', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, time, reason: reason || null }),
      })
      const data = await res.json()
      if (data.success) {
        setBlockedTimes(prev => [...prev.filter(b => !(b.date === date && b.time === time)), { date, time, reason: reason || null }])
        setBlockingSlot(null)
        setBlockReason('')
        showToast('Time slot blocked.')
      }
    } catch { showToast('⚠️ Error blocking slot') }
    finally { setSavingBlock(false) }
  }

  const unblockTimeSlot = async (date: string, time: string) => {
    try {
      const res = await fetch('/api/admin/blocked-times', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, time }),
      })
      const data = await res.json()
      if (data.success) {
        setBlockedTimes(prev => prev.filter(b => !(b.date === date && b.time === time)))
        showToast('Time slot unblocked.')
      }
    } catch { showToast('⚠️ Error unblocking') }
  }

  const lookupClientByPhone = useCallback(async (phone: string) => {
    const digits = phone.replace(/\D/g, '')
    if (digits.length < 7) return
    setAddApptPhoneLooking(true)
    try {
      // Fetch all formats in parallel — much faster than sequential
      const formats = [
        digits,
        digits.length === 10 ? `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}` : null,
        digits.length === 10 ? `${digits.slice(0,3)}-${digits.slice(3,6)}-${digits.slice(6)}` : null,
        digits.length === 10 ? `+1${digits}` : null,
      ].filter(Boolean) as string[]

      const results = await Promise.all(
        formats.map(fmt =>
          fetch(`/api/admin/clients?phone=${encodeURIComponent(fmt)}`).then(r => r.json()).catch(() => ({ clients: [] }))
        )
      )

      let client = null
      for (const data of results) {
        if (data.clients && data.clients.length > 0) {
          const named = data.clients.find((c: {name:string}) => c.name && c.name.replace(/\D/g,'').length !== 10)
          client = named ?? data.clients[0]
          break
        }
      }

      if (client) {
        const displayName = client.name && client.name.replace(/\D/g,'').length === 10 ? '(name not on file)' : client.name
        setAddApptClientData({ name: displayName, pets: client.pets || [] })
        setAddApptClientName(displayName)
        if (client.pets?.length === 1) {
          setAddApptPetId(client.pets[0].id)
          setAddApptPetName(client.pets[0].name)
        }
      } else {
        setAddApptClientData(null)
        setAddApptClientName('')
        setAddApptFirstName(''); setAddApptLastName('')
      }
    } catch {/**/}
    finally { setAddApptPhoneLooking(false) }
  }, [])

  const clearAddApptForm = () => {
    setAddingApptSlot(null)
    setAddApptPhone(''); setAddApptClientName(''); setAddApptFirstName(''); setAddApptLastName(''); setAddApptEmail('')
    setAddApptPetId(''); setAddApptPetName(''); setAddApptBreed(''); setAddApptWeight('')
    setAddApptVaccine('pending'); setAddApptClientData(null)
  }

  const submitQuickAddAppt = async () => {
    if (!addingApptSlot || !addApptPhone || (!addApptPetId && !addApptPetName)) return
    setAddApptSaving(true)
    try {
      const res = await fetch('/api/admin/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: addApptPhone,
          clientName: `${addApptFirstName.trim()} ${addApptLastName.trim()}`.trim() || addApptClientName || addApptPhone,
          email: addApptEmail || null,
          petId: addApptPetId || null,
          petName: addApptPetName,
          breed: addApptBreed || null,
          weight: addApptWeight || null,
          vaccineStatus: addApptVaccine,
          service: addApptService,
          date: addingApptSlot.date,
          time: addingApptSlot.time,
        }),
      })
      const data = await res.json()
      if (data.success) {
        clearAddApptForm()
        if (data.newClientCreated) {
          // New client — send to New Client Intake so admin can complete their profile
          showToast('🆕 New client added! Complete their profile in New Client Intake.')
          setTab('intake')
          fetchAppointments('pending')
        } else {
          showToast('✓ Appointment added!')
          fetchCalendar()
        }
      } else {
        showToast('⚠️ ' + (data.error || 'Error adding appointment'))
      }
    } catch { showToast('⚠️ Error adding appointment') }
    finally { setAddApptSaving(false) }
  }

  const updateVaccineStatus = async (clientPhone: string, petId: string, status: string) => {
    setSavingVaccineId(petId)
    try {
      const res = await fetch(`/api/admin/pets/${petId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vaccine_status: status }),
      })
      const data = await res.json()
      if (data.success || !data.error) {
        setClients(prev => prev.map(c => c.phone === clientPhone
          ? { ...c, pets: c.pets.map(p => p.id === petId ? { ...p, vaccine_status: status } : p) }
          : c))
        setEditingVaccineId(null)
        showToast('Vaccine status updated!')
      } else {
        showToast('⚠️ Update failed')
      }
    } catch { showToast('⚠️ Update error') }
    finally { setSavingVaccineId(null) }
  }

  const WEIGHT_OPTIONS = [
    'Small (under 15 lbs)',
    'Medium (16–30 lbs)',
    'Large (31–50 lbs)',
    'XL (51–70 lbs)',
  ]

  const updatePetWeight = async (petId: string, weight: string, clientPhone?: string) => {
    setSavingWeightId(petId)
    try {
      const res = await fetch(`/api/admin/pets/${petId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weight }),
      })
      const data = await res.json()
      if (data.success || !data.error) {
        // Update clients list
        if (clientPhone) {
          setClients(prev => prev.map(c => c.phone === clientPhone
            ? { ...c, pets: c.pets.map(p => p.id === petId ? { ...p, weight } : p) }
            : c))
        }
        // Update appointment popup pet if it's the same pet
        setDetailAppt(prev => prev && prev.pets?.id === petId
          ? { ...prev, pets: { ...prev.pets!, weight } }
          : prev)
        // Update appointments list
        setAppointments(prev => prev.map(a => a.pets?.id === petId
          ? { ...a, pets: { ...a.pets!, weight } }
          : a))
        setEditingWeightId(null)
        setEditingApptWeight(false)
        showToast('✓ Weight updated')
      } else {
        showToast('⚠️ Failed to update weight')
      }
    } catch { showToast('⚠️ Update error') }
    finally { setSavingWeightId(null) }
  }

  const updatePetName = async (petId: string, name: string, clientPhone?: string) => {
    const trimmed = name.trim()
    if (!trimmed) { setEditingApptName(false); return }
    setSavingNameId(petId)
    try {
      const res = await fetch(`/api/admin/pets/${petId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      })
      const data = await res.json()
      if (data.success || !data.error) {
        if (clientPhone) {
          setClients(prev => prev.map(c => c.phone === clientPhone
            ? { ...c, pets: c.pets.map(p => p.id === petId ? { ...p, name: trimmed } : p) }
            : c))
        }
        setDetailAppt(prev => prev && prev.pets?.id === petId ? { ...prev, pets: { ...prev.pets!, name: trimmed } } : prev)
        setAppointments(prev => prev.map(a => a.pets?.id === petId ? { ...a, pets: { ...a.pets!, name: trimmed } } : a))
        setEditingApptName(false)
        showToast('✓ Pet name updated')
      } else {
        showToast('⚠️ Failed to update name')
      }
    } catch { showToast('⚠️ Update error') }
    finally { setSavingNameId(null) }
  }

  const deletePet = async (clientPhone: string, petId: string) => {
    setDeletingPetId(petId)
    try {
      const res = await fetch(`/api/admin/pets/${petId}`, { method: 'DELETE' })
      const data = await res.json()
      if (data.success) {
        setClients(prev => prev.map(c => c.phone === clientPhone
          ? { ...c, pets: c.pets.filter(p => p.id !== petId) }
          : c))
        showToast('Pet profile deleted.')
      } else {
        showToast('⚠️ Delete failed')
      }
    } catch { showToast('⚠️ Delete error') }
    finally { setDeletingPetId(null) }
  }

  const fetchVaccineRecords = useCallback(async (showAll?: boolean) => {
    setVaccineLoading(true)
    setVaccineError(null)
    try {
      const url = (showAll ?? vaccineShowAll) ? '/api/admin/vaccines?all=true' : '/api/admin/vaccines'
      const res = await fetch(url)
      const data = await res.json()
      if (data.error) { setVaccineError(data.error); return }
      const records = data.records ?? []
      setVaccineRecords(records)
      setVaccineCount(records.filter((r: VaccineRecord) => !r.verified).length)
      // Pre-fill per-row expiry values from existing pet data
      const map: Record<string, string> = {}
      records.forEach((r: VaccineRecord) => { if (r.pets?.id) map[r.pets.id] = r.pets.vaccine_expiry || '' })
      setRowExpiryValues(map)
    } catch (e) { setVaccineError(String(e)) }
    finally { setVaccineLoading(false) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vaccineShowAll])

  const saveVaccineExpiry = async (petId: string, expiry: string) => {
    setSavingExpiry(true)
    try {
      const res = await fetch(`/api/admin/pets/${petId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vaccine_expiry: expiry || null }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      // Update local vaccine records list
      setVaccineRecords(prev => prev.map(r =>
        r.pets?.id === petId ? { ...r, pets: r.pets ? { ...r.pets, vaccine_expiry: expiry || null } : r.pets } : r
      ))
      // Update local clients list if loaded
      setClients(prev => prev.map(c => ({
        ...c,
        pets: c.pets.map(p => p.id === petId ? { ...p, vaccine_expiry: expiry || null } : p),
      })))
      setExpiryEditing(null)
      showToast(expiry ? `✓ Expiry set to ${new Date(expiry + 'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}` : '✓ Expiry cleared')
    } catch { showToast('⚠️ Failed to save expiry date') }
    finally { setSavingExpiry(false) }
  }

  const approveVaccineRecord = async (recordId: string) => {
    setApprovingId(recordId)
    try {
      const res = await fetch('/api/admin/vaccines', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recordId }),
      })
      const data = await res.json()
      if (data.success) {
        setVaccineRecords(prev => prev.filter(r => r.id !== recordId))
        setVaccineCount(prev => Math.max(0, prev - 1))
        showToast('✓ Vaccine record approved!')
      } else {
        showToast('⚠️ Approval failed')
      }
    } catch { showToast('⚠️ Approval error') }
    finally { setApprovingId(null) }
  }

  const fetchSettings = useCallback(async () => {
    setSettingsLoading(true)
    const [sRes, bRes, staffRes, tagsRes] = await Promise.all([
      fetch('/api/admin/settings'),
      fetch('/api/admin/blocked-dates'),
      fetch('/api/admin/staff'),
      fetch('/api/admin/tags'),
    ])
    const sData = await sRes.json(); const bData = await bRes.json(); const staffData = await staffRes.json()
    try { const tagsData = await tagsRes.json(); setTags(tagsData.tags || []) } catch {/**/}
    const s = sData.settings || {}
    if (s.timezone) setTimezone(s.timezone)
    if (s.open_days) { try { setOpenDays(JSON.parse(s.open_days)) } catch {/**/} }
    if (s.open_time) setOpenTime(s.open_time)
    if (s.close_time) setCloseTime(s.close_time)
    if (s.appointment_interval) setAppointmentInterval(parseInt(s.appointment_interval) as 15 | 30)
    if (s.services) {
      try {
        const loadedSvcs: ServiceDef[] = JSON.parse(s.services)
        // Merge tiers from service_pricing if this service doesn't have them yet (old format)
        let pricingMap: Record<string, { label: string; price: string }[]> = {}
        if (s.service_pricing) { try { pricingMap = JSON.parse(s.service_pricing) } catch {/**/} }
        setServices(loadedSvcs.map(svc => ({
          ...svc,
          // Normalize visible to explicit boolean so future saves always write true/false
          visible: svc.visible === false || (svc as {visible?:unknown}).visible === 'false' ? false : true,
          tiers: svc.tiers ?? pricingMap[svc.id] ?? DEFAULT_TIERS.map(t => ({...t})),
          category: inferServiceCategory(svc),
        })))
        // Also sync servicePricing state for detail panel compat
        if (s.service_pricing) {
          try {
            const loaded = JSON.parse(s.service_pricing)
            setServicePricing(prev => ({ ...prev, ...loaded }))
          } catch {/**/}
        }
      } catch {/**/}
    } else if (s.service_pricing) {
      try {
        const loaded = JSON.parse(s.service_pricing)
        setServicePricing(prev => ({ ...prev, ...loaded }))
      } catch {/**/}
    }
    setStaff(staffData.staff || [])
    setBlockedDates(bData.blocked_dates || [])
    setSettingsLoading(false)
  }, [])

  // Fetch payroll data (staff earnings, etc.)
  const fetchPayroll = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/staff')
      const data = await res.json()
      setStaff(data.staff || [])
    } catch { /* silent */ }
  }, [])

  // Generate payroll report based on date range and optional groomer filter
  const generatePayrollReport = useCallback(async () => {
    if (!payrollStartDate || !payrollEndDate) {
      alert('Please select both start and end dates')
      return
    }
    setActionLoading('payroll')
    setPayrollReport(null)
    try {
      const res = await fetch(`/api/admin/appointments?status=all`)
      const data = await res.json()
      const allAppts: any[] = data.appointments || []

      // Filter by date range and optional groomer. Deleted/cancelled appointments and
      // no-shows never happened as far as pay is concerned, so exclude both statuses.
      const appts = allAppts.filter((a: any) => {
        if (a.status === 'cancelled' || a.status === 'no_show') return false
        if (a.appointment_date < payrollStartDate || a.appointment_date > payrollEndDate) return false
        if (payrollSelectedGroomer && a.assigned_groomer !== payrollSelectedGroomer) return false
        return true
      })

      // ── Daily totals (all groomers combined for the filtered set) ──
      const byDate: Record<string, {appts: number; revenue: number; tips: number; commission: number; tipShare: number}> = {}
      appts.forEach((a: any) => {
        const d = a.appointment_date
        if (!byDate[d]) byDate[d] = { appts: 0, revenue: 0, tips: 0, commission: 0, tipShare: 0 }
        byDate[d].appts += 1
        if (a.payment_status === 'paid') {
          // Commission is on the full pre-discount price: add the discount back.
          const rev = parseFloat(a.payment_amount || '0') + parseFloat(a.discount_amount || '0')
          const tip = parseFloat(a.tip_amount || '0')
          byDate[d].revenue += rev
          byDate[d].tips += tip
          // Look up this appointment's groomer rates
          const apptMember = a.assigned_groomer ? staff.find(s => s.name === a.assigned_groomer) : null
          const cRate = apptMember ? apptMember.commission_percent / 100 : 0
          const tRate = apptMember ? apptMember.tip_percent / 100 : 0
          byDate[d].commission += rev * cRate
          byDate[d].tipShare += tip * tRate
        }
      })
      const daily = Object.entries(byDate)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, v]) => ({ date, appts: v.appts, revenue: v.revenue, tips: v.tips, commission: v.commission, tipShare: v.tipShare }))

      // ── Per-groomer totals for the period ──
      const groomersToShow = payrollSelectedGroomer
        ? staff.filter(s => s.name === payrollSelectedGroomer)
        : staff

      const groomers = groomersToShow.map(member => {
        const memberAppts = appts.filter((a: any) => a.assigned_groomer === member.name)
        const paidAppts = memberAppts.filter((a: any) => a.payment_status === 'paid')
        const revenue = paidAppts.reduce((s: number, a: any) => s + parseFloat(a.payment_amount || '0') + parseFloat(a.discount_amount || '0'), 0)
        const tips = memberAppts.reduce((s: number, a: any) => s + parseFloat(a.tip_amount || '0'), 0)
        const commRate = member.commission_percent / 100
        const tipRate = member.tip_percent / 100
        return {
          name: member.name,
          appts: memberAppts.length,
          revenue,
          tips,
          commission: revenue * commRate,
          tipShare: tips * tipRate,
          commRate: member.commission_percent,
          tipRate: member.tip_percent,
        }
      }).filter(g => g.appts > 0 || payrollSelectedGroomer)

      // ── Per-groomer daily breakdown (for per-groomer PDF detail tables) ──
      const dailyByGroomer: Record<string, PayrollDailyRow[]> = {}
      groomersToShow.forEach(member => {
        const cRate = member.commission_percent / 100
        const tRate = member.tip_percent / 100
        const mByDate: Record<string, {appts:number;revenue:number;tips:number;commission:number;tipShare:number}> = {}
        appts.filter((a: any) => a.assigned_groomer === member.name).forEach((a: any) => {
          const d = a.appointment_date
          if (!mByDate[d]) mByDate[d] = { appts: 0, revenue: 0, tips: 0, commission: 0, tipShare: 0 }
          mByDate[d].appts += 1
          if (a.payment_status === 'paid') {
            // Commission is on the full pre-discount price: add the discount back.
            const rev = parseFloat(a.payment_amount || '0') + parseFloat(a.discount_amount || '0')
            const tip = parseFloat(a.tip_amount || '0')
            mByDate[d].revenue += rev
            mByDate[d].tips += tip
            mByDate[d].commission += rev * cRate
            mByDate[d].tipShare += tip * tRate
          }
        })
        dailyByGroomer[member.name] = Object.entries(mByDate)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([date, v]) => ({ date, appts: v.appts, revenue: v.revenue, tips: v.tips, commission: v.commission, tipShare: v.tipShare }))
      })

      setPayrollReport({ daily, groomers, dailyByGroomer })
    } catch (e) {
      console.error(e)
      alert('Error generating payroll report')
    } finally {
      setActionLoading(null)
    }
  }, [payrollStartDate, payrollEndDate, payrollSelectedGroomer, staff])

  // Compute a bi-weekly payroll period (Sun→Sat, anchor 2026-05-24) and a default pay date
  const computePayrollPeriod = useCallback((which: 'next' | 'this' | 'last') => {
    const now = salonNow(); if (now.getHours() < 4) now.setDate(now.getDate() - 1)
    const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const ANCHOR = new Date(2026, 4, 24), PERIOD = 14
    const days = Math.floor((now.getTime() - ANCHOR.getTime()) / 86400000)
    const periods = Math.floor(days / PERIOD)
    // "This Pay" = the most recently completed period (the one being paid now);
    // "Last Pay" = the period before that; "Next Pay" = the period currently in
    // progress (hasn't ended yet, so nothing to pay out on it yet).
    const offset = which === 'next' ? periods : which === 'last' ? periods - 2 : periods - 1
    const start = new Date(ANCHOR); start.setDate(ANCHOR.getDate() + offset * PERIOD)
    const end = new Date(start); end.setDate(start.getDate() + PERIOD - 1)
    // Default pay date: the first Friday after the period ends (period ends Sat → next Fri).
    const pay = new Date(end); do { pay.setDate(pay.getDate() + 1) } while (pay.getDay() !== 5)
    return { start: fmt(start), end: fmt(end), pay: fmt(pay) }
  }, [])

  // Pre-fill the most recently completed pay period (you run payroll after a
  // period ends), plus its default pay date, when entering the Payroll tab.
  useEffect(() => {
    if (tab !== 'payroll') return
    if (payrollStartDate && payrollEndDate) return
    const p = computePayrollPeriod('this')
    setPayrollStartDate(p.start); setPayrollEndDate(p.end)
    if (!payrollPayDate) setPayrollPayDate(p.pay)
  }, [tab, computePayrollPeriod, payrollStartDate, payrollEndDate, payrollPayDate])

  // Auto-generate the report when dates/groomer change, so export buttons stay available
  useEffect(() => {
    if (tab !== 'payroll') return
    if (!payrollStartDate || !payrollEndDate || !staff.length) return
    const t = setTimeout(() => { generatePayrollReport() }, 350)
    return () => clearTimeout(t)
  }, [tab, payrollStartDate, payrollEndDate, payrollSelectedGroomer, staff, generatePayrollReport])

  // Export payroll report to CSV
  const exportPayrollCSV = useCallback(() => {
    if (!payrollReport) return
    const groomerLabel = payrollSelectedGroomer || 'All Groomers'
    let csv = `Payroll Report: ${groomerLabel}\r\nPeriod: ${payrollStartDate} to ${payrollEndDate}\r\n\r\n`

    // Section 1: Daily transactions
    csv += 'DAILY TRANSACTIONS\r\n'
    csv += 'Date,Appointments,Revenue,Commission Earned,Tips Collected,Tip Share Earned\r\n'
    payrollReport.daily.forEach(r => {
      csv += `${r.date},${r.appts},$${r.revenue.toFixed(2)},$${r.commission.toFixed(2)},$${r.tips.toFixed(2)},$${r.tipShare.toFixed(2)}\r\n`
    })
    const dTotalAppts = payrollReport.daily.reduce((s, r) => s + r.appts, 0)
    const dTotalRev = payrollReport.daily.reduce((s, r) => s + r.revenue, 0)
    const dTotalTips = payrollReport.daily.reduce((s, r) => s + r.tips, 0)
    const dTotalComm = payrollReport.daily.reduce((s, r) => s + r.commission, 0)
    const dTotalTipShare = payrollReport.daily.reduce((s, r) => s + r.tipShare, 0)
    csv += `TOTAL,${dTotalAppts},$${dTotalRev.toFixed(2)},$${dTotalComm.toFixed(2)},$${dTotalTips.toFixed(2)},$${dTotalTipShare.toFixed(2)}\r\n\r\n`

    // Section 2: Groomer pay summary
    csv += 'GROOMER PAY SUMMARY\r\n'
    csv += 'Groomer,Appointments,Revenue,Commission Rate,Commission Earned,Tips Collected,Tip Share Rate,Tip Share Earned,Total Pay\r\n'
    payrollReport.groomers.forEach(g => {
      csv += `${g.name},${g.appts},$${g.revenue.toFixed(2)},${g.commRate}%,$${g.commission.toFixed(2)},$${g.tips.toFixed(2)},${g.tipRate}%,$${g.tipShare.toFixed(2)},$${(g.commission + g.tipShare).toFixed(2)}\r\n`
    })
    const gTotalComm = payrollReport.groomers.reduce((s, g) => s + g.commission, 0)
    const gTotalTipShare = payrollReport.groomers.reduce((s, g) => s + g.tipShare, 0)
    csv += `TOTAL,,,,,,,,$${(gTotalComm + gTotalTipShare).toFixed(2)}\r\n`

    const blob = new Blob([csv], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `payroll-${payrollSelectedGroomer || 'all'}-${payrollStartDate}-to-${payrollEndDate}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    window.URL.revokeObjectURL(url)
  }, [payrollReport, payrollStartDate, payrollEndDate, payrollSelectedGroomer])

  // Export payroll report to Excel (.xlsx)
  const exportPayrollExcel = useCallback(async () => {
    if (!payrollReport) return
    const XLSX = await import('xlsx')
    const groomerLabel = payrollSelectedGroomer || 'All Groomers'
    const filename = `payroll-${payrollSelectedGroomer || 'all'}-${payrollStartDate}-to-${payrollEndDate}.xlsx`

    // Sheet 1: Daily Transactions
    const dailyData = payrollReport.daily.map(r => ({
      'Date': r.date,
      'Appointments': r.appts,
      'Revenue ($)': r.revenue,
      'Commission Earned ($)': r.commission,
      'Tips Collected ($)': r.tips,
      'Tip Share Earned ($)': r.tipShare,
    }))
    // Totals row
    dailyData.push({
      'Date': 'TOTAL',
      'Appointments': payrollReport.daily.reduce((s, r) => s + r.appts, 0),
      'Revenue ($)': payrollReport.daily.reduce((s, r) => s + r.revenue, 0),
      'Commission Earned ($)': payrollReport.daily.reduce((s, r) => s + r.commission, 0),
      'Tips Collected ($)': payrollReport.daily.reduce((s, r) => s + r.tips, 0),
      'Tip Share Earned ($)': payrollReport.daily.reduce((s, r) => s + r.tipShare, 0),
    })

    // Sheet 2: Groomer Pay Summary
    const groomerData = payrollReport.groomers.map(g => ({
      'Groomer': g.name,
      'Appointments': g.appts,
      'Revenue ($)': g.revenue,
      [`Commission Rate`]: `${g.commRate}%`,
      'Commission Earned ($)': g.commission,
      'Tips Collected ($)': g.tips,
      [`Tip Share Rate`]: `${g.tipRate}%`,
      'Tip Share Earned ($)': g.tipShare,
      'Total Pay ($)': g.commission + g.tipShare,
    }))
    // Totals row
    groomerData.push({
      'Groomer': 'TOTAL',
      'Appointments': payrollReport.groomers.reduce((s, g) => s + g.appts, 0),
      'Revenue ($)': payrollReport.groomers.reduce((s, g) => s + g.revenue, 0),
      'Commission Rate': '',
      'Commission Earned ($)': payrollReport.groomers.reduce((s, g) => s + g.commission, 0),
      'Tips Collected ($)': payrollReport.groomers.reduce((s, g) => s + g.tips, 0),
      'Tip Share Rate': '',
      'Tip Share Earned ($)': payrollReport.groomers.reduce((s, g) => s + g.tipShare, 0),
      'Total Pay ($)': payrollReport.groomers.reduce((s, g) => s + g.commission + g.tipShare, 0),
    })

    const wb = XLSX.utils.book_new()
    const ws1 = XLSX.utils.json_to_sheet(dailyData)
    const ws2 = XLSX.utils.json_to_sheet(groomerData)

    // Add a title row above each sheet
    XLSX.utils.sheet_add_aoa(ws1, [[`Payroll Report: ${groomerLabel}`], [`Period: ${payrollStartDate} to ${payrollEndDate}`], []], { origin: 'A1' })
    XLSX.utils.sheet_add_json(ws1, dailyData, { origin: 'A4', skipHeader: false })
    XLSX.utils.sheet_add_aoa(ws2, [[`Groomer Pay Summary: ${groomerLabel}`], [`Period: ${payrollStartDate} to ${payrollEndDate}`], []], { origin: 'A1' })
    XLSX.utils.sheet_add_json(ws2, groomerData, { origin: 'A4', skipHeader: false })

    XLSX.utils.book_append_sheet(wb, ws1, 'Daily Transactions')
    XLSX.utils.book_append_sheet(wb, ws2, 'Groomer Pay')
    XLSX.writeFile(wb, filename)
  }, [payrollReport, payrollStartDate, payrollEndDate, payrollSelectedGroomer])

  // Export payroll report to per-groomer PDF statements (one file each; zipped if multiple)
  const exportPayrollPDF = useCallback(async () => {
    if (!payrollReport) return
    setActionLoading('payroll-pdf')
    try {
      const { jsPDF } = await import('jspdf')
      const JSZip = (await import('jszip')).default

      // ── Kokoni brand palette ──
      const BLUE: [number,number,number] = [28, 79, 149]
      const SKY: [number,number,number] = [70, 191, 191]
      const LIGHT: [number,number,number] = [216, 235, 253]
      const ORANGE: [number,number,number] = [242, 166, 90]
      const INK: [number,number,number] = [44, 44, 44]
      const GREY: [number,number,number] = [120, 120, 120]
      const LINE: [number,number,number] = [223, 232, 242]

      const money = (n: number) => '$' + (n || 0).toFixed(2)
      const fmtDate = (iso: string) => {
        const [y, m, d] = iso.split('-')
        return `${m}/${d}/${y.slice(2)}`
      }

      // Draw a donut chart (commission vs tip share) on an offscreen canvas, return PNG data URL
      const makeDonut = (commission: number, tipShare: number) => {
        const size = 420
        const cv = document.createElement('canvas')
        cv.width = size; cv.height = size
        const ctx = cv.getContext('2d')!
        const cx = size / 2, cy = size / 2, rOut = 175, rIn = 105
        const total = commission + tipShare
        const segs = total > 0
          ? [
              { val: commission, color: 'rgb(28,79,149)' },
              { val: tipShare, color: 'rgb(242,166,90)' },
            ]
          : [{ val: 1, color: 'rgb(216,235,253)' }]
        let start = -Math.PI / 2
        segs.forEach(s => {
          const frac = total > 0 ? s.val / total : 1
          const end = start + frac * Math.PI * 2
          ctx.beginPath()
          ctx.moveTo(cx, cy)
          ctx.arc(cx, cy, rOut, start, end)
          ctx.closePath()
          ctx.fillStyle = s.color
          ctx.fill()
          start = end
        })
        // punch the hole
        ctx.globalCompositeOperation = 'destination-out'
        ctx.beginPath(); ctx.arc(cx, cy, rIn, 0, Math.PI * 2); ctx.fill()
        ctx.globalCompositeOperation = 'source-over'
        // center label
        ctx.fillStyle = 'rgb(44,44,44)'
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
        ctx.font = 'bold 30px Helvetica, Arial, sans-serif'
        ctx.fillText('Total Pay', cx, cy - 16)
        ctx.font = 'bold 40px Helvetica, Arial, sans-serif'
        ctx.fillText(money(total), cx, cy + 22)
        return cv.toDataURL('image/png')
      }

      type GRow = { name:string; appts:number; revenue:number; tips:number; commission:number; tipShare:number; commRate:number; tipRate:number }

      // Load the branded cover image (public/payroll-cover.jpg) once, as a data URL
      const loadCover = async (): Promise<string | null> => {
        try {
          const res = await fetch('/payroll-cover.jpg')
          if (!res.ok) return null
          const blob = await res.blob()
          return await new Promise<string>((resolve, reject) => {
            const fr = new FileReader()
            fr.onload = () => resolve(fr.result as string)
            fr.onerror = reject
            fr.readAsDataURL(blob)
          })
        } catch { return null }
      }

      const buildDoc = (g: GRow, coverUrl: string | null) => {
        const doc = new jsPDF({ unit: 'pt', format: 'letter' })
        const W = doc.internal.pageSize.getWidth()
        const H = doc.internal.pageSize.getHeight()
        const M = 48
        const totalPay = g.commission + g.tipShare
        const custTipRate = g.revenue > 0 ? (g.tips / g.revenue) * 100 : 0
        const hasCover = !!coverUrl

        // ── Page 1: branded cover with this groomer's name on the orange banner ──
        if (coverUrl) {
          doc.addImage(coverUrl, 'JPEG', 0, 0, W, H)
          // Orange "Groomer Wylie" pill: measured bounds (fractions of page) + exact fill color
          const bx0 = 0.4608 * W, bx1 = 0.9307 * W
          const by0 = 0.7985 * H, by1 = 0.8510 * H
          const rad = (by1 - by0) / 2
          // Cover the baked-in name with the pill's flat fill, staying inside the rounded ends
          doc.setFillColor(252, 199, 123)
          doc.rect(bx0 + rad, by0, (bx1 - rad) - (bx0 + rad), by1 - by0, 'F')
          // Write the correct groomer name, centered, auto-shrunk to fit
          const cleanName = g.name.replace(/^groomer\s+/i, '').trim()
          const label = `Groomer ${cleanName}`
          const maxW = (bx1 - bx0) - rad * 2 - 10
          doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255)
          let fs = 18
          doc.setFontSize(fs)
          while (doc.getTextWidth(label) > maxW && fs > 9) { fs -= 0.5; doc.setFontSize(fs) }
          doc.text(label, (bx0 + bx1) / 2, (by0 + by1) / 2 + fs * 0.35, { align: 'center' })
          doc.addPage()
        }

        // ── Header band ──
        doc.setFillColor(...BLUE)
        doc.rect(0, 0, W, 96, 'F')
        doc.setFillColor(...SKY)
        doc.rect(0, 96, W, 6, 'F')
        doc.setTextColor(255, 255, 255)
        doc.setFont('helvetica', 'bold'); doc.setFontSize(24)
        doc.text('KOKONI', M, 50)
        doc.setFont('helvetica', 'normal'); doc.setFontSize(11)
        doc.text('Pet Grooming Salon', M, 68)
        doc.setFont('helvetica', 'bold'); doc.setFontSize(15)
        doc.text('Payroll Statement', W - M, 50, { align: 'right' })
        doc.setFont('helvetica', 'normal'); doc.setFontSize(10)
        doc.setTextColor(...LIGHT)
        doc.text(`${fmtDate(payrollStartDate)} – ${fmtDate(payrollEndDate)}`, W - M, 64, { align: 'right' })
        if (payrollPayDate) {
          doc.setFontSize(9)
          doc.text(`Pay date: ${fmtDate(payrollPayDate)}`, W - M, 80, { align: 'right' })
        }

        // ── Groomer name + total pay banner ──
        let y = 132
        doc.setTextColor(...INK)
        doc.setFont('helvetica', 'bold'); doc.setFontSize(20)
        doc.text(g.name, M, y)
        doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...GREY)
        doc.text(`Pay period: ${payrollStartDate} to ${payrollEndDate}${payrollPayDate ? `   ·   Pay date: ${payrollPayDate}` : ''}`, M, y + 16)

        // total pay chip (right)
        const chipW = 190, chipH = 56, chipX = W - M - chipW, chipY = y - 18
        doc.setFillColor(...LIGHT)
        doc.roundedRect(chipX, chipY, chipW, chipH, 8, 8, 'F')
        doc.setTextColor(...BLUE)
        doc.setFont('helvetica', 'normal'); doc.setFontSize(9)
        doc.text('TOTAL PAY THIS PERIOD', chipX + chipW / 2, chipY + 20, { align: 'center' })
        doc.setFont('helvetica', 'bold'); doc.setFontSize(22)
        doc.text(money(totalPay), chipX + chipW / 2, chipY + 44, { align: 'center' })

        // ── Customer tip rate callout (performance signal) ──
        const calY = 178, calH = 48, calW = W - M * 2
        doc.setFillColor(235, 248, 248)
        doc.roundedRect(M, calY, calW, calH, 8, 8, 'F')
        doc.setFillColor(...SKY)
        doc.roundedRect(M, calY, 5, calH, 2, 2, 'F')
        doc.setTextColor(...INK); doc.setFont('helvetica', 'bold'); doc.setFontSize(11)
        doc.text('Customer Tip Rate', M + 18, calY + 21)
        doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...GREY)
        doc.text('Tips as a share of service revenue this period (tips ÷ revenue) — a sign of happy clients.', M + 18, calY + 38)
        doc.setTextColor(...SKY); doc.setFont('helvetica', 'bold'); doc.setFontSize(26)
        doc.text(`${custTipRate.toFixed(0)}%`, W - M - 18, calY + 33, { align: 'right' })

        // ── Pay summary table ──
        y = 252
        doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(...INK)
        doc.text('Pay Summary', M, y)
        y += 12
        const rows: [string, string][] = [
          ['Appointments completed', String(g.appts)],
          ['Revenue generated (paid)', money(g.revenue)],
          [`Commission rate`, `${g.commRate}%`],
          ['Commission earned', money(g.commission)],
          ['Tips collected', money(g.tips)],
          ['Customer tip rate (tips / revenue)', `${custTipRate.toFixed(0)}%`],
          [`Tip share rate (your cut of tips)`, `${g.tipRate}%`],
          ['Tip share earned', money(g.tipShare)],
        ]
        const rowH = 24, tableW = W - M * 2
        rows.forEach((r, i) => {
          const ry = y + i * rowH
          if (i % 2 === 0) { doc.setFillColor(247, 250, 254); doc.rect(M, ry, tableW, rowH, 'F') }
          doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...INK)
          doc.text(r[0], M + 12, ry + 16)
          doc.setFont('helvetica', 'bold')
          doc.text(r[1], W - M - 12, ry + 16, { align: 'right' })
        })
        let yEnd = y + rows.length * rowH
        // total pay row
        doc.setFillColor(...BLUE)
        doc.rect(M, yEnd, tableW, rowH + 4, 'F')
        doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(11)
        doc.text('TOTAL PAY (commission + tip share)', M + 12, yEnd + 17)
        doc.text(money(totalPay), W - M - 12, yEnd + 17, { align: 'right' })
        yEnd += rowH + 4

        // ── Pay breakdown donut ──
        y = yEnd + 28
        doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(...INK)
        doc.text('Pay Breakdown', M, y)
        const donut = makeDonut(g.commission, g.tipShare)
        const dSize = 150
        doc.addImage(donut, 'PNG', M, y + 10, dSize, dSize)
        // legend
        const lx = M + dSize + 30
        let ly = y + 36
        const pct = (v: number) => totalPay > 0 ? `${Math.round((v / totalPay) * 100)}%` : '0%'
        const legend: [string, string, [number,number,number]][] = [
          ['Commission', `${money(g.commission)}  (${pct(g.commission)})`, BLUE],
          ['Tip share', `${money(g.tipShare)}  (${pct(g.tipShare)})`, ORANGE],
        ]
        legend.forEach(([label, val, col]) => {
          doc.setFillColor(...col)
          doc.roundedRect(lx, ly - 9, 12, 12, 2, 2, 'F')
          doc.setTextColor(...INK); doc.setFont('helvetica', 'bold'); doc.setFontSize(10)
          doc.text(label, lx + 20, ly)
          doc.setFont('helvetica', 'normal'); doc.setTextColor(...GREY)
          doc.text(val, lx + 20, ly + 15)
          ly += 40
        })

        // ── Daily detail table ──
        const daily = payrollReport.dailyByGroomer[g.name] || []
        let dy = y + dSize + 36
        doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(...INK)
        doc.text('Daily Detail', M, dy)
        dy += 14
        const cols = [
          { label: 'Date', x: M + 8, align: 'left' as const },
          { label: 'Appts', x: M + 130, align: 'right' as const },
          { label: 'Revenue', x: M + 230, align: 'right' as const },
          { label: 'Tips', x: M + 330, align: 'right' as const },
          { label: 'Commission', x: M + 440, align: 'right' as const },
          { label: 'Tip Share', x: W - M - 8, align: 'right' as const },
        ]
        const drawDailyHeader = (hy: number) => {
          doc.setFillColor(...SKY)
          doc.rect(M, hy, W - M * 2, 22, 'F')
          doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(9)
          cols.forEach(c => doc.text(c.label, c.x, hy + 15, { align: c.align }))
          return hy + 22
        }
        dy = drawDailyHeader(dy)
        const drH = 20
        const renderRow = (cells: string[], ry: number, shade: boolean, bold = false) => {
          if (shade) { doc.setFillColor(247, 250, 254); doc.rect(M, ry, W - M * 2, drH, 'F') }
          doc.setTextColor(...INK); doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(9)
          cols.forEach((c, i) => doc.text(cells[i], c.x, ry + 14, { align: c.align }))
        }
        daily.forEach((r, i) => {
          if (dy > H - 70) { doc.addPage(); dy = M; dy = drawDailyHeader(dy) }
          renderRow([fmtDate(r.date), String(r.appts), money(r.revenue), money(r.tips), money(r.commission), money(r.tipShare)], dy, i % 2 === 0)
          dy += drH
        })
        if (daily.length === 0) {
          doc.setTextColor(...GREY); doc.setFont('helvetica', 'italic'); doc.setFontSize(9)
          doc.text('No appointments in this period.', M + 8, dy + 14); dy += drH
        } else {
          if (dy > H - 70) { doc.addPage(); dy = M }
          doc.setFillColor(...LIGHT); doc.rect(M, dy, W - M * 2, drH + 2, 'F')
          renderRow([
            'TOTAL',
            String(daily.reduce((s, r) => s + r.appts, 0)),
            money(daily.reduce((s, r) => s + r.revenue, 0)),
            money(daily.reduce((s, r) => s + r.tips, 0)),
            money(daily.reduce((s, r) => s + r.commission, 0)),
            money(daily.reduce((s, r) => s + r.tipShare, 0)),
          ], dy, false, true)
          dy += drH + 2
        }

        // ── Footer on every statement page (skip the cover) ──
        const pageCount = doc.getNumberOfPages()
        const firstContentPage = hasCover ? 2 : 1
        const contentPages = pageCount - (hasCover ? 1 : 0)
        for (let p = firstContentPage; p <= pageCount; p++) {
          doc.setPage(p)
          doc.setDrawColor(...LINE); doc.setLineWidth(0.5)
          doc.line(M, H - 42, W - M, H - 42)
          doc.setTextColor(...GREY); doc.setFont('helvetica', 'normal'); doc.setFontSize(8)
          doc.text('Kokoni Pet Grooming Salon  ·  Every cut, made with care.', M, H - 28)
          const num = hasCover ? p - 1 : p
          doc.text(`Generated ${new Date().toLocaleDateString()}  ·  Page ${num} of ${contentPages}`, W - M, H - 28, { align: 'right' })
        }
        return doc
      }

      const groomersWithData = payrollReport.groomers.filter(g => g.appts > 0 || payrollSelectedGroomer)
      if (groomersWithData.length === 0) { alert('No groomer data to export.'); return }

      const coverUrl = await loadCover()
      const safe = (s: string) => s.replace(/[^a-z0-9]+/gi, '-')
      const triggerDownload = (blob: Blob, filename: string) => {
        const url = window.URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url; link.download = filename
        document.body.appendChild(link); link.click(); document.body.removeChild(link)
        window.URL.revokeObjectURL(url)
      }

      if (groomersWithData.length === 1) {
        const g = groomersWithData[0]
        const doc = buildDoc(g, coverUrl)
        triggerDownload(doc.output('blob'), `payroll-${safe(g.name)}-${payrollStartDate}-to-${payrollEndDate}.pdf`)
      } else {
        const zip = new JSZip()
        groomersWithData.forEach(g => {
          const doc = buildDoc(g, coverUrl)
          zip.file(`payroll-${safe(g.name)}-${payrollStartDate}-to-${payrollEndDate}.pdf`, doc.output('blob'))
        })
        const blob = await zip.generateAsync({ type: 'blob' })
        triggerDownload(blob, `payroll-pdfs-${payrollStartDate}-to-${payrollEndDate}.zip`)
      }
    } catch (e) {
      console.error(e)
      alert('Error generating payroll PDFs')
    } finally {
      setActionLoading(null)
    }
  }, [payrollReport, payrollStartDate, payrollEndDate, payrollPayDate, payrollSelectedGroomer])

  const fetchReports = useCallback(async (range?: 'week' | 'month' | 'all') => {
    setReportsLoading(true)
    try {
      // Fetch all appointments (no status filter) for reports
      const res = await fetch('/api/admin/appointments?status=all')
      const data = await res.json()
      setReportsAppts(data.appointments || [])
    } catch { /* silent */ }
    setReportsLoading(false)
  }, [])

  // Helper function to get button text based on loading state
  const getButtonText = (baseText: string, loadingKey: string, isLoading: boolean) => {
    if (!isLoading) return baseText
    if (actionLoading === loadingKey) return `⏳ ${baseText}...`
    return baseText
  }

  // Helper to check if specific action is loading
  const isActionLoading = (loadingKey: string) => actionLoading === loadingKey

  // ── Sound helpers ─────────────────────────────────────────────────────────
  const getCtx = useCallback(async () => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
    }
    if (audioCtxRef.current.state === 'suspended') {
      await audioCtxRef.current.resume()
    }
    return audioCtxRef.current
  }, [])

  // 🐶 Real dog bark — plays uploaded audio file
  const playBark = useCallback(async () => {
    try {
      const audio = new Audio('/dog-bark.mp3')
      audio.volume = 0.8
      await audio.play()
    } catch (e) { console.warn('Bark sound error:', e) }
  }, [])

  // 🔔 Chime — groomer confirmed
  const playChime = useCallback(async () => {
    try {
      const ctx = await getCtx()
      const notes = [523.25, 659.25, 783.99] // C5 E5 G5
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = 'sine'
        osc.frequency.value = freq
        gain.gain.setValueAtTime(0, ctx.currentTime + i * 0.15)
        gain.gain.linearRampToValueAtTime(0.5, ctx.currentTime + i * 0.15 + 0.02)
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.15 + 0.6)
        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.start(ctx.currentTime + i * 0.15)
        osc.stop(ctx.currentTime + i * 0.15 + 0.65)
      })
    } catch (e) { console.warn('Chime sound error:', e) }
  }, [getCtx])

  const fetchPendingCount = useCallback(async () => {
    try {
      // Check new client requests (pending)
      const res = await fetch('/api/admin/appointments?status=pending')
      const data = await res.json()
      const count = (data.appointments || []).length
      if (prevPendingCountRef.current !== null && count > prevPendingCountRef.current) {
        playBark()
      }
      prevPendingCountRef.current = count
      setPendingCount(count)

      // Check for new groomer confirmations (confirmed appointments)
      const res2 = await fetch('/api/admin/appointments?status=upcoming')
      const data2 = await res2.json()
      const appts: Appointment[] = data2.appointments || []
      const nowConfirmed = new Set(appts.filter(a => a.groomer_confirmed).map(a => a.id))
      const prevConfirmed = confirmedGroomerIdsRef.current
      const hasNew = [...nowConfirmed].some(id => !prevConfirmed.has(id))
      if (prevConfirmed.size > 0 && hasNew) playChime()
      confirmedGroomerIdsRef.current = nowConfirmed
    } catch { /* silent */ }
  }, [playBark, playChime])

  useEffect(() => {
    if (!authed) return
    if (tab === 'calendar') { fetchCalendar(); fetchSettings() }
    else if (tab === 'clients') fetchClients()
    else if (tab === 'vaccines') fetchVaccineRecords()
    else if (tab === 'payroll') fetchPayroll()
    else if (tab === 'settings') fetchSettings()
    else if (tab === 'reviews') {
      const fetchReviewSettings = async () => {
        try {
          const res = await fetch('/api/admin/reviews/settings')
          const data = await res.json()
          setReviewSettings(data)
          setReviewSettingsEdit(data)
        } catch (error) {
          console.error('Error fetching review settings:', error)
        }
      }
      fetchReviewSettings()
      return
    }
    else if (tab === 'today') { fetchSettings() }
    else if (tab === 'grooming') {
      const fetchGrooming = async () => {
        setGroomingLoading(true)
        try {
          const res = await fetch('/api/admin/appointments?status=today')
          const data = await res.json()
          setGroomingAppts((data.appointments || []).filter((a: Appointment) => a.status !== 'cancelled'))
        } catch { setGroomingAppts([]) }
        setGroomingLoading(false)
      }
      fetchGrooming()
      const iv = setInterval(async () => {
        try {
          const res = await fetch('/api/admin/appointments?status=today')
          const data = await res.json()
          const fresh = (data.appointments || []).filter((a: Appointment) => a.status !== 'cancelled')
          setGroomingAppts(fresh)
          // Also update the open detail panel if it's showing one of these appointments
          setDetailAppt(prev => {
            if (!prev) return prev
            const updated = fresh.find((a: Appointment) => a.id === prev.id)
            return updated ?? prev
          })
        } catch {}
      }, 20000)
      return () => clearInterval(iv)
    }
    else if (tab === 'requests') {
      fetchAppointments('requests')
      const iv = setInterval(() => fetchAppointments('requests'), 20000)
      return () => clearInterval(iv)
    }
    else if (tab === 'intake') fetchAppointments('pending')
    else if (tab === 'checkout') fetchAppointments('today')
    else if (tab === 'cashier') {
      fetchReports()
      const iv = setInterval(() => fetchReports(), 15000)
      return () => clearInterval(iv)
    }
    else if (tab === 'reports') { fetchReports(); fetchPayroll() }
  }, [authed, tab, fetchCalendar, fetchClients, fetchVaccineRecords, fetchPayroll, fetchSettings, fetchAppointments, fetchReports, calendarMonth])

  // Poll pending count every 30s so badge always stays current
  useEffect(() => {
    if (!authed) return
    fetchPendingCount()
    const interval = setInterval(fetchPendingCount, 30_000)
    return () => clearInterval(interval)
  }, [authed, fetchPendingCount])

  // Load vaccine count on auth so badge shows immediately
  useEffect(() => {
    if (!authed) return
    fetch('/api/admin/vaccines')
      .then(r => r.json())
      .then(d => setVaccineCount((d.records ?? []).length))
      .catch(() => {})
  }, [authed])

  // Load staff + service prices on auth so detail panel works from any tab
  useEffect(() => {
    if (!authed) return
    fetch('/api/admin/staff')
      .then(r => r.json())
      .then(d => setStaff(d.staff || []))
      .catch(() => {})
    // Load services/pricing so tier buttons always show correct prices
    fetch('/api/admin/settings')
      .then(r => r.json())
      .then(d => {
        const s = d.settings || {}
        let loadedSvcs = services
        if (s.services) {
          try { loadedSvcs = JSON.parse(s.services) } catch {}
        }
        let pricingMap: Record<string, {label:string;price:string}[]> = {}
        if (s.service_pricing) {
          try { pricingMap = JSON.parse(s.service_pricing) } catch {}
        }
        setServices(loadedSvcs.map((svc: ServiceDef) => ({
          ...svc,
          visible: svc.visible === false || (svc as {visible?:unknown}).visible === 'false' ? false : true,
          tiers: svc.tiers ?? pricingMap[svc.id] ?? DEFAULT_TIERS.map(t => ({...t})),
          category: inferServiceCategory(svc),
        })))
        if (s.open_time) setOpenTime(s.open_time)
        if (s.close_time) setCloseTime(s.close_time)
      })
      .catch(() => {})
  }, [authed])

  // Keep pending count in sync — only count truly pending (not confirmed) appointments
  useEffect(() => {
    if (tab === 'requests') {
      setPendingCount(appointments.filter(a => a.status === 'pending').length)
    } else if (tab === 'intake') {
      setPendingCount(appointments.length)
    }
  }, [tab, appointments])

  const handleAction = async (id: string, action: 'confirm'|'decline'|'start'|'complete'|'no-show'|'cancel-today') => {
    setActionLoading(id+action)
    try {
      const res = await fetch(`/api/admin/appointments/${id}`, { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ action }) })
      const data = await res.json()
      if (data.success) {
        const msg = action==='confirm' ? 'Confirmed! SMS sent.' : action==='decline' ? 'Declined.' : action==='start' ? 'Checked in!' : action==='no-show' ? 'Marked as no-show.' : action==='cancel-today' ? 'Appointment cancelled.' : 'Marked complete!'
        showToast(msg)
        if (tab==='today'||tab==='checkout') fetchAppointments('today')
        else if (tab==='requests') fetchAppointments('requests')
        else if (tab==='intake') fetchAppointments('pending')
      }
    } catch { showToast('Something went wrong.') }
    setActionLoading(null)
  }

  // ── Auth gate ────────────────────────────────────────────────────────────
  // Real login now happens on /login (username + password against the staff
  // table). If we get here unauthenticated, we're just mid-redirect there.
  if (!authed) return (
    <div className="min-h-screen bg-white flex items-center justify-center p-6">
      {!checkingAuth && (
        <div className="flex flex-col items-center">
          <Image src="/logo.png" alt="Kokoni" width={140} height={140} className="mb-4" />
          <p className="text-sm text-gray-400">Redirecting to login…</p>
        </div>
      )}
    </div>
  )

  // ── Dashboard ──────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-100 flex">
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-gray-800 text-white px-5 py-2.5 rounded-full text-sm shadow-lg">{toast}</div>
      )}

      {/* ── Add Appointment Modal ──────────────────────────────────────────── */}
      {addingApptSlot && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={clearAddApptForm} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="bg-sky-50 border-b border-sky-100 px-6 py-4 flex items-center justify-between shrink-0">
              <div>
                <h3 className="font-bold text-sky-800 text-base">New Appointment</h3>
                <p className="text-sm text-sky-600 mt-0.5">
                  {new Date(addingApptSlot.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                  {' · '}
                  {(() => {
                    const [h, m] = addingApptSlot.time.split(':')
                    const hour = parseInt(h), period = hour >= 12 ? 'PM' : 'AM'
                    return `${hour % 12 || 12}:${m} ${period}`
                  })()}
                </p>
              </div>
              <button onClick={clearAddApptForm}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-sky-100 text-sky-500 text-xl font-light">×</button>
            </div>

            {/* Body — scrollable */}
            <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1">

              {/* ── CLIENT ── */}
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">Client Phone</label>
                <div className="flex items-center gap-2">
                  <input type="tel" value={addApptPhone}
                    onChange={e => {
                      const val = e.target.value
                      setAddApptPhone(val)
                      // Auto-lookup as soon as 10 digits are entered (no need to tab out)
                      if (val.replace(/\D/g, '').length >= 10) lookupClientByPhone(val)
                    }}
                    onBlur={() => { if (addApptPhone.replace(/\D/g,'').length >= 7) lookupClientByPhone(addApptPhone) }}
                    placeholder="(555) 000-0000" autoFocus
                    className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300" />
                  {addApptPhoneLooking && <span className="text-xs text-gray-400">Looking up…</span>}
                </div>
                {addApptClientData ? (
                  <p className="text-sm font-semibold text-emerald-600 mt-1.5">✓ Existing client: {addApptClientData.name}</p>
                ) : addApptPhone.length >= 10 && !addApptPhoneLooking ? (
                  <div className="mt-2 p-3 bg-amber-50 border border-amber-100 rounded-xl space-y-2">
                    <p className="text-xs font-semibold text-amber-700">🆕 New client — fill in details:</p>
                    <div className="grid grid-cols-2 gap-2">
                      <input type="text" value={addApptFirstName} onChange={e => setAddApptFirstName(e.target.value)}
                        placeholder="First name *"
                        className="border border-amber-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300" />
                      <input type="text" value={addApptLastName} onChange={e => setAddApptLastName(e.target.value)}
                        placeholder="Last name"
                        className="border border-amber-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300" />
                    </div>
                    <input type="email" value={addApptEmail} onChange={e => setAddApptEmail(e.target.value)}
                      placeholder="Email address (optional)"
                      className="w-full border border-amber-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300" />
                  </div>
                ) : null}
              </div>

              {/* ── PET ── */}
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">Pet</label>
                {addApptClientData && addApptClientData.pets.length > 0 ? (
                  <>
                    <select value={addApptPetId}
                      onChange={e => {
                        const pet = addApptClientData.pets.find(p => p.id === e.target.value)
                        setAddApptPetId(e.target.value)
                        setAddApptPetName(pet?.name || '')
                      }}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300">
                      <option value="">Select a pet…</option>
                      {addApptClientData.pets.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                    {/* Option to add a new pet for existing client */}
                    {!addApptPetId && (
                      <div className="mt-2 p-3 bg-gray-50 border border-gray-100 rounded-xl space-y-2">
                        <p className="text-xs text-gray-500 font-medium">Or add a new pet:</p>
                        <input type="text" value={addApptPetName} onChange={e => setAddApptPetName(e.target.value)}
                          placeholder="Pet name"
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300" />
                        {addApptPetName && (
                          <div className="grid grid-cols-2 gap-2">
                            <BreedInput value={addApptBreed} onChange={setAddApptBreed}
                              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300 w-full" />
                            <select value={addApptWeight} onChange={e => setAddApptWeight(e.target.value)}
                              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300 bg-white">
                              <option value="">Size / Weight</option>
                              {WEIGHT_OPTIONS.map(w => <option key={w} value={w}>{w}</option>)}
                            </select>
                          </div>
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="space-y-2">
                    <input type="text" value={addApptPetName} onChange={e => setAddApptPetName(e.target.value)}
                      placeholder="Pet name *"
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300" />
                    {addApptPetName && (
                      <div className="grid grid-cols-2 gap-2">
                        <BreedInput value={addApptBreed} onChange={setAddApptBreed}
                          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300 w-full" />
                        <select value={addApptWeight} onChange={e => setAddApptWeight(e.target.value)}
                          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300 bg-white">
                          <option value="">Size / Weight</option>
                          {WEIGHT_OPTIONS.map(w => <option key={w} value={w}>{w}</option>)}
                        </select>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* ── VACCINE RECORDS ── (only when new pet) */}
              {!addApptPetId && (
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">💉 Vaccine Records</label>
                  <select value={addApptVaccine} onChange={e => setAddApptVaccine(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300">
                    <option value="pending">⚠️ Not yet — request at appointment</option>
                    <option value="text">📱 Will send via text</option>
                    <option value="email">📧 Will send via email</option>
                    <option value="verified">✓ Already have on file</option>
                  </select>
                  {addApptVaccine === 'pending' && (
                    <p className="text-xs text-amber-600 mt-1">Pet will appear in Vaccine Records tab as pending.</p>
                  )}
                  {(addApptVaccine === 'text' || addApptVaccine === 'email') && (
                    <p className="text-xs text-sky-600 mt-1">Pet will be flagged — remind client to submit records before appointment.</p>
                  )}
                </div>
              )}

              {/* ── SERVICE ── */}
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">Service</label>
                <select value={addApptService} onChange={e => setAddApptService(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300">
                  {services.filter(s => inferServiceCategory(s) === 'main').map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 pb-5 pt-3 border-t border-gray-100 flex gap-3 shrink-0">
              <button onClick={submitQuickAddAppt}
                disabled={addApptSaving || !addApptPhone || (!addApptPetId && !addApptPetName)}
                className="flex-1 bg-sky-500 hover:bg-sky-600 disabled:opacity-40 text-white font-semibold py-2.5 rounded-xl text-sm transition-colors">
                {addApptSaving ? 'Adding…' : 'Add Appointment'}
              </button>
              <button onClick={clearAddApptForm}
                className="px-5 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 font-medium">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Inline Reschedule Modal (Today tab Late rows) ──────────────────── */}
      {inlineRescheduleAppt && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setInlineRescheduleAppt(null)} />
          <div className="relative bg-white rounded-t-3xl w-full max-w-lg px-5 pt-5 pb-8 shadow-2xl">
            {/* Header */}
            <div className="flex items-center gap-3 mb-4">
              {inlineRescheduleAppt.pets?.photo_url
                ? <img src={inlineRescheduleAppt.pets.photo_url} className="w-12 h-12 rounded-2xl object-cover flex-shrink-0" alt="" />
                : <div className="w-12 h-12 rounded-2xl bg-amber-100 flex items-center justify-center text-2xl flex-shrink-0">🐶</div>}
              <div>
                <p className="font-black text-gray-800">{inlineRescheduleAppt.pets?.name} <span className="text-gray-400 font-normal text-sm">· {inlineRescheduleAppt.clients?.name}</span></p>
                <p className="text-sm text-gray-500">{serviceMap[inlineRescheduleAppt.service] ?? inlineRescheduleAppt.service} · {inlineRescheduleAppt.appointment_time}</p>
              </div>
              <button onClick={() => setInlineRescheduleAppt(null)} className="ml-auto text-gray-300 hover:text-gray-500 text-2xl leading-none">✕</button>
            </div>

            {/* Date picker */}
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">New Date</p>
            <input
              type="date"
              value={inlineRescheduleDate}
              min={new Date().toISOString().split('T')[0]}
              className="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 text-base focus:outline-none focus:border-amber-400 mb-4"
              onChange={async e => {
                const d = e.target.value
                setInlineRescheduleDate(d)
                setInlineRescheduleTime('')
                if (!d) { setInlineRescheduleSlots([]); return }
                setInlineRescheduleLoading(true)
                try {
                  const r = await fetch(`/api/slots?date=${d}&t=${Date.now()}`)
                  const data = await r.json()
                  setInlineRescheduleSlots(Array.isArray(data.slots) ? data.slots : [])
                } catch { setInlineRescheduleSlots([]) }
                setInlineRescheduleLoading(false)
              }}
            />

            {/* Time slots */}
            {inlineRescheduleDate && (
              <>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">Available Times</p>
                {inlineRescheduleLoading ? (
                  <p className="text-sm text-gray-400 text-center py-3">Checking availability…</p>
                ) : inlineRescheduleSlots.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-3">No available slots for this date.</p>
                ) : (
                  <div className="grid grid-cols-4 gap-2 mb-4 max-h-40 overflow-y-auto">
                    {inlineRescheduleSlots.map(t => (
                      <button key={t} onClick={() => setInlineRescheduleTime(t)}
                        className={`py-2 rounded-xl text-xs font-semibold border-2 transition-all ${inlineRescheduleTime === t ? 'bg-amber-500 text-white border-amber-500' : 'border-gray-200 text-gray-700 hover:border-amber-300'}`}>
                        {t}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}

            {/* Confirm */}
            <button
              disabled={!inlineRescheduleDate || !inlineRescheduleTime || inlineRescheduleSaving}
              onClick={async () => {
                if (!inlineRescheduleAppt || !inlineRescheduleDate || !inlineRescheduleTime) return
                setInlineRescheduleSaving(true)
                try {
                  const res = await fetch(`/api/admin/appointments/${inlineRescheduleAppt.id}`, {
                    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'reschedule', appointment_date: inlineRescheduleDate, appointment_time: inlineRescheduleTime }),
                  })
                  const d = await res.json()
                  if (d.success) {
                    setAppointments(prev => prev.map(a => a.id === inlineRescheduleAppt!.id
                      ? { ...a, appointment_date: inlineRescheduleDate, appointment_time: inlineRescheduleTime, status: 'pending', groomer_confirmed: false }
                      : a))
                    showToast('✓ Rescheduled!')
                    setInlineRescheduleAppt(null)
                  } else {
                    showToast('⚠️ Reschedule failed')
                  }
                } catch { showToast('⚠️ Error') }
                setInlineRescheduleSaving(false)
              }}
              className="w-full py-3.5 rounded-2xl font-black text-base text-white shadow-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-40 transition-colors active:scale-95"
            >
              {inlineRescheduleSaving ? 'Saving…' : `✓ Confirm Reschedule${inlineRescheduleTime ? ` · ${inlineRescheduleTime}` : ''}`}
            </button>
          </div>
        </div>
      )}

      {/* ── Appointment Detail Slide-Over ─────────────────────────────────── */}
      {detailAppt && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 bg-black/30 z-40" onClick={() => { closeDetailAppt(); setEditingApptWeight(false); setChangingService(false); setShowRescheduleInputs(false) }} />
          {/* Panel */}
          <div className="fixed right-0 top-0 bottom-0 w-full md:w-[480px] bg-white z-50 shadow-2xl flex flex-col overflow-hidden">
            {/* Header */}
            <div className={`px-5 py-4 border-b border-gray-100 ${
              detailAppt.service==='simply_cute' ? 'bg-sky-50' :
              detailAppt.service==='bath_brush'  ? 'bg-teal-50' :
              detailAppt.service==='asian_fusion'? 'bg-pink-50' : 'bg-gray-50'}`}>
              {detailApptBackStack.length > 0 && (
                <button
                  onClick={goBackDetailAppt}
                  className="flex items-center gap-1 text-xs font-semibold text-sky-700 bg-sky-100 hover:bg-sky-200 rounded-full px-2.5 py-1 mb-2 transition-colors"
                >
                  ← Back to {detailApptBackStack[detailApptBackStack.length - 1].pets?.name ?? 'previous'} appointment
                </button>
              )}
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-3">
                  {detailAppt.pets?.photo_url
                    ? <img src={detailAppt.pets.photo_url} className="w-11 h-11 rounded-full object-cover border-2 border-white shadow" alt="" />
                    : <div className="w-11 h-11 rounded-full bg-white flex items-center justify-center text-2xl shadow">🐶</div>}
                  <div>
                    <p className="font-bold text-gray-800 text-lg leading-tight">{detailAppt.pets?.name}</p>
                    <p className="text-xs text-gray-500">{detailAppt.pets?.breed} · {detailAppt.clients?.name}</p>
                  </div>
                </div>
                <button onClick={() => { closeDetailAppt(); setEditingApptWeight(false); setChangingService(false); setShowRescheduleInputs(false) }} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-200 text-gray-500 text-xl">×</button>
              </div>
              <div className="flex items-center gap-2 mt-2">
                <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${
                  detailAppt.service==='simply_cute' ? 'bg-sky-200 text-sky-800' :
                  detailAppt.service==='bath_brush'  ? 'bg-teal-200 text-teal-800' :
                  detailAppt.service==='asian_fusion'? 'bg-pink-200 text-pink-800' : 'bg-indigo-100 text-indigo-700'}`}>
                  {services.find(s => s.id === detailAppt.service)?.name ?? serviceMap[detailAppt.service] ?? detailAppt.service}
                </span>
                <span className="text-xs text-gray-500">{formatDate(detailAppt.appointment_date)} · {detailAppt.appointment_time}</span>
                <span className={`ml-auto text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[detailAppt.status]??'bg-gray-100 text-gray-500'}`}>{detailAppt.status}</span>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-gray-100 bg-white">
              {([
                { key: 'appt',     label: '📋 Appointment' },
                { key: 'customer', label: '👤 Customer' },
                { key: 'payment',  label: '📖 History' },
                { key: 'future',   label: '📅 Future' },
                { key: 'notes',    label: '📝 Notes' },
              ] as const).map(t => (
                <button key={t.key} onClick={() => setDetailTab(t.key)}
                  className={`flex-1 text-xs py-2.5 font-medium border-b-2 transition-colors ${detailTab===t.key ? 'border-sky-500 text-sky-700' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>
                  {t.label}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">

              {/* ── APPOINTMENT TAB ──────────────────────── */}
              {detailTab === 'appt' && (
                <>
                  {/* ── Appointment confirmation actions (pending only) ── */}
                  {detailAppt.status === 'pending' && (
                    <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
                      <p className="text-xs font-semibold text-amber-600 uppercase tracking-wide mb-3">⏳ Pending Request</p>
                      <div className="flex gap-2">
                        <button onClick={() => detailHandleAction('confirm')} disabled={!!detailActionLoading}
                          className="flex-1 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-bold rounded-xl disabled:opacity-50">
                          {detailActionLoading==='confirm' ? '…' : '✓ Confirm'}
                        </button>
                        <button onClick={() => detailHandleAction('decline')} disabled={!!detailActionLoading}
                          className="flex-1 py-2.5 bg-rose-500 hover:bg-rose-600 text-white text-sm font-bold rounded-xl disabled:opacity-50">
                          {detailActionLoading==='decline' ? '…' : '✕ Decline'}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* ── Assign Staff ── */}
                  <div className="bg-gray-50 rounded-2xl p-4">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Assign Staff</p>
                      <button onClick={saveStaffAssignment} disabled={savingStaff}
                        className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${savingStaff ? 'bg-gray-200 text-gray-500' : 'bg-sky-600 hover:bg-sky-700 text-white'}`}>
                        {savingStaff ? 'Saving…' : 'Save Staff'}
                      </button>
                    </div>
                    {(() => {
                      const apptDate = detailAppt.appointment_date
                      // Admin accounts are dashboard-only logins, not assignable groomers/bathers.
                      const activeStaff = staff.filter(s => s.is_active && s.role !== 'admin')
                      const isOff = (s: StaffMember) => s.days_off?.includes(apptDate) ?? false

                      const StaffPicker = ({ icon, label, value, onChange }: { icon: string; label: string; value: string; onChange: (v: string) => void }) => (
                        <div>
                          <p className="text-xs text-gray-500 mb-2">{icon} {label}</p>
                          <div className="flex flex-wrap gap-1.5">
                            <button onClick={() => onChange('')}
                              className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${!value ? 'bg-gray-200 text-gray-700 border-gray-300 font-semibold' : 'bg-white text-gray-400 border-gray-200 hover:bg-gray-50'}`}>
                              None
                            </button>
                            {activeStaff.map(s => {
                              const off = isOff(s)
                              const selected = value === s.name
                              return (
                                <button key={s.id} onClick={() => onChange(selected ? '' : s.name)}
                                  className={`text-xs px-2.5 py-1 rounded-lg border transition-colors flex items-center gap-1 ${
                                    selected
                                      ? off ? 'bg-red-100 text-red-700 border-red-300 font-semibold'
                                             : 'bg-sky-100 text-sky-700 border-sky-300 font-semibold'
                                      : off ? 'bg-white text-red-400 border-red-200 hover:bg-red-50'
                                             : 'bg-white text-gray-600 border-gray-200 hover:bg-sky-50'
                                  }`}>
                                  {s.first_name || s.name.split(' ')[0]}
                                  {off && <span title="Day off">🚫</span>}
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      )

                      const offWarnings = [
                        detailGroomer && isOff(activeStaff.find(s => s.name === detailGroomer)!) ? `✂️ ${firstName(detailGroomer)} is off that day` : null,
                        detailBather  && isOff(activeStaff.find(s => s.name === detailBather)!)  ? `🛁 ${firstName(detailBather)} is off that day`  : null,
                      ].filter(Boolean)

                      return (
                        <div className="space-y-3">
                          <StaffPicker icon="✂️" label="Groomer" value={detailGroomer} onChange={setDetailGroomer} />
                          <StaffPicker icon="🛁" label="Bather"  value={detailBather}  onChange={setDetailBather} />
                          {offWarnings.length > 0 && (
                            <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 space-y-0.5">
                              {offWarnings.map(w => <p key={w} className="text-xs font-semibold text-red-600">⚠️ {w}</p>)}
                            </div>
                          )}
                        </div>
                      )
                    })()}
                    {(detailAppt.assigned_groomer || detailAppt.assigned_bather) && (
                      <p className="text-xs text-gray-400 mt-2">
                        Saved: {detailAppt.assigned_groomer ? `✂️ ${firstName(detailAppt.assigned_groomer)}` : ''}{detailAppt.assigned_groomer && detailAppt.assigned_bather ? '  ' : ''}{detailAppt.assigned_bather ? `🛁 ${firstName(detailAppt.assigned_bather)}` : ''}
                      </p>
                    )}
                    {staff.filter(s => s.is_active).length === 0 && (
                      <p className="text-xs text-amber-600 mt-2">⚠️ No active staff — add staff in Settings first</p>
                    )}
                  </div>

                  {/* ── Grooming Pipeline (view-only — controlled by kiosk & grooming board) ── */}
                  {detailAppt.status !== 'pending' && detailAppt.status !== 'cancelled' && (() => {
                    const gs = detailAppt.grooming_status   // null = not checked in yet
                    if (!gs) return (
                      <div className="bg-gray-50 rounded-2xl p-4 flex items-center gap-3">
                        <span className="text-xl">🚶</span>
                        <div>
                          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Grooming Status</p>
                          <p className="text-sm text-gray-400 mt-0.5">Not checked in yet</p>
                        </div>
                        <span className="ml-auto text-xs text-gray-400 italic">Updated by kiosk &amp; groomer</span>
                      </div>
                    )
                    const curIdx = GROOMING_STAGE_ORDER.indexOf(gs)
                    const curStage = GROOMING_STAGES[curIdx] || GROOMING_STAGES[0]
                    const isDone = gs === 'done'
                    return (
                      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                        {/* Header */}
                        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Grooming Status</p>
                          <span className="text-xs text-gray-400 italic">Updated by kiosk &amp; groomer</span>
                        </div>

                        {/* Stage pills — view only */}
                        <div className="px-4 pt-4 pb-2 flex items-center gap-1 flex-wrap">
                          {GROOMING_STAGES.map((s, i) => {
                            const isPast = curIdx > i
                            const isCur  = curIdx === i
                            return (
                              <div key={s.id} className="flex items-center gap-1">
                                <div className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-bold border-2 ${
                                  isCur  ? `${s.bg} ${s.border} ${s.text} shadow-sm scale-105` :
                                  isPast ? 'bg-gray-100 border-gray-200 text-gray-400' :
                                           'bg-gray-50 border-gray-100 text-gray-300'
                                }`}>
                                  <span>{s.icon}</span>
                                  <span className="hidden sm:inline">{s.label}</span>
                                </div>
                                {i < 4 && <span className="text-gray-200 text-xs">›</span>}
                              </div>
                            )
                          })}
                        </div>

                        {/* Current stage label + time + grooming duration */}
                        <div className="px-4 pb-4 space-y-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-xs font-bold px-2 py-1 rounded-lg ${curStage.bg} ${curStage.text}`}>
                              {curStage.icon} {curStage.label}
                            </span>
                            {detailAppt.grooming_status_updated_at && (
                              <span className="text-xs text-gray-400">
                                since {new Date(detailAppt.grooming_status_updated_at).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',timeZone:SALON_TZ})}
                              </span>
                            )}
                            {isDone && (
                              <span className="text-xs font-bold text-pink-600 ml-auto">🎉 Pet has gone home!</span>
                            )}
                          </div>
                          {/* Grooming duration — shown when groomer has started */}
                          {detailAppt.grooming_started_at && (
                            <div className="flex items-center gap-2 bg-sky-50 border border-sky-100 rounded-xl px-3 py-2">
                              <span className="text-base">✂️</span>
                              <div>
                                <p className="text-xs font-semibold text-sky-700">
                                  Grooming started at {new Date(detailAppt.grooming_started_at).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',timeZone:SALON_TZ})}
                                </p>
                                {(() => {
                                  const dur = groomingDuration(detailAppt.grooming_started_at, detailAppt.grooming_finished_at)
                                  return gs !== 'done' && dur ? (
                                    <p className="text-xs text-sky-500">Working for {dur}</p>
                                  ) : gs === 'done' && dur ? (
                                    <p className="text-xs text-sky-500">Took {dur} total</p>
                                  ) : null
                                })()}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })()}

                  {/* ── Health Check Detail ─────────────────── */}
                  {detailAppt.health_check && (() => {
                    const hc = detailAppt.health_check as any
                    const SECTIONS = [
                      { key: 'eyes',  emoji: '👁️', label: 'Eyes',         labelZh: '眼睛' },
                      { key: 'ears',  emoji: '👂', label: 'Ears',         labelZh: '耳朵' },
                      { key: 'nose',  emoji: '👃', label: 'Nose',         labelZh: '鼻子' },
                      { key: 'mouth', emoji: '😬', label: 'Mouth / Teeth',labelZh: '嘴巴/牙齒' },
                      { key: 'paws',  emoji: '🐾', label: 'Paw Pads',     labelZh: '腳掌' },
                      { key: 'skin',  emoji: '🧴', label: 'Skin & Coat',  labelZh: '皮膚/毛髮' },
                    ]
                    const isNewFormat = SECTIONS.some(s => Array.isArray(hc[s.key]))
                    const cleared: string[] = Array.isArray(hc.cleared_sections) ? hc.cleared_sections : []
                    const totalIssues = SECTIONS.reduce((sum, s) => {
                      const val = hc[s.key]
                      if (isNewFormat) return sum + (Array.isArray(val) ? val.length : 0)
                      return sum + (val === false ? 1 : 0)
                    }, 0)
                    const allNormal = isNewFormat ? (cleared.length === 6 && totalIssues === 0)
                      : SECTIONS.every(s => hc[s.key] === true)
                    return (
                      <div className="bg-sky-50 border border-sky-100 rounded-2xl p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-semibold text-sky-700 uppercase tracking-wide">🩺 Initial Health Check</p>
                          {detailAppt.health_check_completed_at && (
                            <span className="text-xs text-sky-400">{new Date(detailAppt.health_check_completed_at).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',timeZone:SALON_TZ})}</span>
                          )}
                        </div>
                        {allNormal ? (
                          <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-3 py-2">
                            <span>✅</span>
                            <div>
                              <p className="text-xs font-bold text-green-700">All Normal — No Issues Found</p>
                              <p className="text-xs text-green-500">一切正常，沒有發現問題</p>
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-1.5">
                            {SECTIONS.map(s => {
                              const val = hc[s.key]
                              const issues: string[] = isNewFormat
                                ? (Array.isArray(val) ? val : [])
                                : (val === false ? [s.label] : [])
                              const isCleared = isNewFormat ? cleared.includes(s.key) : val === true
                              if (isCleared && issues.length === 0) {
                                return (
                                  <div key={s.key} className="flex items-center gap-2 text-xs text-green-600">
                                    <span>{s.emoji}</span>
                                    <span className="font-medium">{s.label}</span>
                                    <span className="text-green-400">· Normal ✓</span>
                                  </div>
                                )
                              }
                              if (issues.length > 0) {
                                return (
                                  <div key={s.key} className="bg-rose-50 border border-rose-100 rounded-xl px-3 py-2">
                                    <p className="text-xs font-semibold text-rose-700">{s.emoji} {s.label} <span className="text-rose-400">/ {s.labelZh}</span></p>
                                    <ul className="mt-1 space-y-0.5">
                                      {issues.map((iss: string) => (
                                        <li key={iss} className="text-xs text-rose-600">⚠️ {iss.replace(/_/g,' ')}</li>
                                      ))}
                                    </ul>
                                  </div>
                                )
                              }
                              return null
                            })}
                          </div>
                        )}
                        {hc.groomer_notes_english && (
                          <div className="bg-white border border-rose-100 rounded-xl px-3 py-2 space-y-0.5">
                            <p className="text-xs font-semibold text-rose-600">🏥 Health Concerns / 健康狀況</p>
                            <p className="text-xs text-gray-600">{hc.groomer_notes_english}</p>
                            {hc.groomer_notes_chinese && <p className="text-xs text-gray-400">{hc.groomer_notes_chinese}</p>}
                          </div>
                        )}
                      </div>
                    )
                  })()}

                  {/* ── Quality Check Detail ─────────────────── */}
                  {detailAppt.grooming_quality && (() => {
                    const q = detailAppt.grooming_quality as any
                    const ITEMS = [
                      { key: 'nails_trimmed', oldKey: 'nails_trimmed', emoji: '✂️', en: 'Nails Trimmed',  zh: '剪指甲' },
                      { key: 'ears_cleaned',  oldKey: 'ears_cleaned',  emoji: '👂', en: 'Ears Cleaned',   zh: '清耳朵' },
                      { key: 'tangles_free',  oldKey: 'coat_brushed',  emoji: '🪮', en: 'Tangles Free',   zh: '無毛結' },
                      { key: 'sanitary_trim', oldKey: 'bath_completed',emoji: '🧼', en: 'Sanitary Trim',  zh: '衛生修剪' },
                      { key: 'paw_pad_trim',  oldKey: 'paw_pads_cleared',emoji:'🐾', en: 'Paw Pad Trim', zh: '腳掌修剪' },
                      { key: 'perfume_spray', oldKey: 'styling_finished',emoji:'🌸', en: 'Perfume Spray', zh: '噴香水' },
                    ]
                    const doneCount = ITEMS.filter(i => q[i.key] || q[i.oldKey]).length
                    const allDone = doneCount === ITEMS.length
                    return (
                      <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wide">🎯 Grooming Quality Check</p>
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${allDone ? 'bg-emerald-200 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>{doneCount}/{ITEMS.length}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-1.5">
                          {ITEMS.map(item => {
                            const done = q[item.key] || q[item.oldKey]
                            return (
                              <div key={item.key} className={`flex items-center gap-2 rounded-xl px-2.5 py-1.5 text-xs ${done ? 'bg-white border border-emerald-200 text-emerald-700' : 'bg-gray-100 text-gray-400'}`}>
                                <span>{item.emoji}</span>
                                <div>
                                  <p className="font-medium leading-tight">{item.en} {done ? '✓' : ''}</p>
                                  <p className="text-xs opacity-70">{item.zh}</p>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                        {q.customer_note_english && (
                          <div className="bg-white border border-emerald-100 rounded-xl px-3 py-2 space-y-0.5">
                            <p className="text-xs font-semibold text-emerald-600">💌 Note to Customer</p>
                            <p className="text-xs text-gray-600">{q.customer_note_english}</p>
                            {q.customer_note_traditional && <p className="text-xs text-gray-400">{q.customer_note_traditional}</p>}
                          </div>
                        )}
                      </div>
                    )
                  })()}

                  {/* Groomer's diary note for this visit — read-only here. Only the
                      groomer can write/edit this note (from the groomer dashboard);
                      admin/desk and admin/mobile just display it, blank if empty. */}
                  {(() => {
                    const q = (detailAppt.grooming_quality as any) || {}
                    const hasNote = !!(q.groomer_diary || q.groomer_diary_english)
                    return (
                      <div className="bg-purple-50 border border-purple-100 rounded-xl px-3 py-2 space-y-1.5">
                        <p className="text-xs font-semibold text-purple-600">📓 Groomer Notes / 美容師工作日記</p>
                        {hasNote ? (
                          <>
                            <p className="text-xs text-gray-600 mt-0.5">{q.groomer_diary_english || q.groomer_diary}</p>
                            {q.groomer_diary_traditional && q.groomer_diary_traditional !== (q.groomer_diary_english || q.groomer_diary) && (
                              <p className="text-xs text-gray-400">{q.groomer_diary_traditional}</p>
                            )}
                            {q.groomer_diary_author && (
                              <p className="text-[11px] text-purple-300">— {q.groomer_diary_author}</p>
                            )}
                          </>
                        ) : (
                          <p className="text-xs text-gray-400 italic">No note yet</p>
                        )}
                      </div>
                    )
                  })()}

                  {/* Supervisor note for this visit — admin's own note, separate from the
                      groomer's diary above. Admin can add/edit this any time. */}
                  {(() => {
                    const q = (detailAppt.grooming_quality as any) || {}
                    const hasNote = !!q.supervisor_note
                    return (
                      <div className="bg-sky-50 border border-sky-100 rounded-xl px-3 py-2 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-semibold text-sky-600">👔 Supervisor Note / 店長備註</p>
                          {!editingApptSupervisor && (
                            <button
                              onClick={() => { setEditingApptSupervisor(true); setApptSupervisorDraft(q.supervisor_note || '') }}
                              className="text-xs font-semibold text-sky-600 hover:text-sky-700 px-2 py-0.5 rounded hover:bg-sky-100"
                            >✏️ {hasNote ? 'Edit' : 'Add'}</button>
                          )}
                        </div>
                        {editingApptSupervisor ? (
                          <div className="space-y-2">
                            <textarea
                              autoFocus
                              value={apptSupervisorDraft}
                              onChange={e => setApptSupervisorDraft(e.target.value)}
                              className="w-full border border-sky-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-sky-300 resize-none bg-white"
                              rows={3}
                            />
                            <div className="flex gap-2">
                              <button
                                onClick={() => setEditingApptSupervisor(false)}
                                className="flex-1 py-1.5 text-xs font-semibold text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 bg-white"
                              >Cancel</button>
                              <button
                                onClick={saveApptSupervisor}
                                disabled={savingApptSupervisor}
                                className="flex-1 py-1.5 bg-sky-500 hover:bg-sky-600 text-white text-xs font-semibold rounded-lg disabled:opacity-50"
                              >{savingApptSupervisor ? 'Saving…' : '💾 Save'}</button>
                            </div>
                          </div>
                        ) : hasNote ? (
                          <>
                            <p className="text-xs text-gray-600 mt-0.5">{q.supervisor_note}</p>
                            {q.supervisor_note_author && (
                              <p className="text-[11px] text-sky-300">— {q.supervisor_note_author}</p>
                            )}
                          </>
                        ) : (
                          <p className="text-xs text-gray-400 italic">No note yet</p>
                        )}
                      </div>
                    )
                  })()}

                  {/* ── Service & Pricing card ───────────────── */}
                  {(() => {
                    const svcDef = services.find(s => s.id === detailAppt.service)
                    const svcName = svcDef?.name ?? serviceMap[detailAppt.service] ?? detailAppt.service
                    const tiers = (svcDef?.tiers ?? servicePricing[detailAppt.service] ?? []).filter(t => t.label)
                    const hasPrices = tiers.some(t => t.price)
                    const addOnTotal = detailAddOns.reduce((sum, a) => sum + (parseFloat(a.price) || 0), 0)
                    const baseAmt = parseFloat(detailBasePrice) || 0
                    const subtotalAmt = baseAmt + addOnTotal
                    const selectedCoupon = availableCoupons.find(c => c.id === detailCouponId) ?? null
                    const discountAmt = selectedCoupon
                      ? (selectedCoupon.discount_type === 'percent'
                          ? Math.round(subtotalAmt * selectedCoupon.discount_value / 100 * 100) / 100
                          : Math.min(selectedCoupon.discount_value, subtotalAmt))
                      : 0
                    const grandTotal = Math.round((subtotalAmt - discountAmt) * 100) / 100
                    const addOnPriority = ['flea shampoo', 'hand stripping']
                    const otherServices = services.filter(s => s.id !== detailAppt.service && inferServiceCategory(s) === 'addon').slice().sort((a, b) => {
                      const ai = addOnPriority.indexOf((a.name ?? '').trim().toLowerCase())
                      const bi = addOnPriority.indexOf((b.name ?? '').trim().toLowerCase())
                      if (ai !== -1 && bi !== -1) return ai - bi
                      if (ai !== -1) return -1
                      if (bi !== -1) return 1
                      return 0
                    })
                    return (
                      <div className={`rounded-2xl p-4 border ${
                        detailAppt.payment_status === 'paid'
                          ? 'bg-emerald-50 border-emerald-100'
                          : 'bg-white border-gray-200'
                      }`}>
                        {/* Header */}
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-bold text-gray-800">{svcName}</p>
                            {changingService ? (
                              <div className="flex items-center gap-1.5">
                                <select
                                  defaultValue=""
                                  onChange={async e => {
                                    const newSvcId = e.target.value
                                    if (!newSvcId || !detailAppt) return
                                    setSavingServiceChange(true)
                                    const res = await fetch(`/api/admin/appointments/${detailAppt.id}`, {
                                      method: 'PATCH',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({ action: 'change-service', service: newSvcId }),
                                    })
                                    if (res.ok) {
                                      setDetailAppt(prev => prev ? { ...prev, service: newSvcId } : prev)
                                      setAppointments(prev => prev.map(a => a.id === detailAppt.id ? { ...a, service: newSvcId } : a))
                                      setDetailBasePrice('')
                                      setDetailBaseTier('')
                                      showToast('✓ Service updated')
                                    } else {
                                      showToast('⚠️ Failed to update service')
                                    }
                                    setSavingServiceChange(false)
                                    setChangingService(false)
                                  }}
                                  className="text-xs border border-sky-300 rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-sky-300">
                                  <option value="" disabled>Select service…</option>
                                  {services.filter(s => s.visible !== false && inferServiceCategory(s) === 'main').map(s => (
                                    <option key={s.id} value={s.id}>{s.name}</option>
                                  ))}
                                </select>
                                <button onClick={() => setChangingService(false)}
                                  className="text-xs text-gray-400 hover:text-gray-600">✕</button>
                              </div>
                            ) : (
                              <button onClick={() => setChangingService(true)}
                                className="text-xs text-gray-400 hover:text-sky-600 font-medium border border-gray-200 hover:border-sky-300 px-2 py-0.5 rounded-lg transition-colors">
                                {savingServiceChange ? '…' : '🔄 Change'}
                              </button>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            {detailAppt.payment_status === 'paid'
                              ? <span className="text-xs bg-emerald-100 text-emerald-700 font-semibold px-2.5 py-1 rounded-full">✓ Paid{detailAppt.payment_amount ? ` · $${detailAppt.payment_amount}` : ''}</span>
                              : <span className="text-xs bg-amber-100 text-amber-700 font-semibold px-2.5 py-1 rounded-full">Unpaid</span>
                            }
                            <button
                              onClick={() => {
                                if (!detailEditTiersMode) {
                                  setDetailEditTiers(tiers.map(t => ({...t})))
                                  setDetailEditTiersMode(true)
                                } else {
                                  setDetailEditTiersMode(false)
                                }
                              }}
                              className="text-xs text-gray-400 hover:text-sky-600 font-medium transition-colors">
                              {detailEditTiersMode ? 'Cancel' : '✏️ Edit'}
                            </button>
                          </div>
                        </div>

                        {/* Main service tier selector */}
                        {detailEditTiersMode ? (
                          /* ── Edit mode: editable price inputs ── */
                          <>
                            <p className="text-xs text-gray-400 mb-2">Edit prices for {svcName} ↓</p>
                            <div className="grid grid-cols-2 gap-1.5 mb-2">
                              {detailEditTiers.map((tier, i) => (
                                <div key={i} className="flex items-center justify-between bg-sky-50 border border-sky-200 rounded-xl px-3 py-2.5">
                                  <span className="text-xs font-medium text-sky-700">{tier.label.split(' ')[0]}</span>
                                  <div className="flex items-center gap-1">
                                    <span className="text-xs text-sky-400">$</span>
                                    <input
                                      type="number" min="0" step="1"
                                      value={tier.price}
                                      onChange={e => setDetailEditTiers(prev => prev.map((t, j) => j === i ? {...t, price: e.target.value} : t))}
                                      className="w-14 text-sm font-bold text-sky-800 bg-transparent focus:outline-none text-right"
                                    />
                                  </div>
                                </div>
                              ))}
                            </div>
                            <button
                              disabled={savingTiers}
                              onClick={async () => {
                                setSavingTiers(true)
                                const updatedServices = services.map(s =>
                                  s.id === detailAppt.service
                                    ? { ...s, tiers: detailEditTiers }
                                    : s
                                )
                                setServices(updatedServices)
                                // Save to API
                                await fetch('/api/admin/settings', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ key: 'services', value: JSON.stringify(updatedServices) }) })
                                const pricingMap: Record<string, {label:string;price:string}[]> = {}
                                updatedServices.forEach(svc => { if (svc.tiers) pricingMap[svc.id] = svc.tiers })
                                await fetch('/api/admin/settings', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ key: 'service_pricing', value: JSON.stringify(pricingMap) }) })
                                setSavingTiers(false)
                                setDetailEditTiersMode(false)
                                showToast('✓ Prices saved!')
                              }}
                              className={`w-full py-2 rounded-xl text-sm font-bold transition-colors mb-3 ${savingTiers ? 'bg-gray-200 text-gray-500' : 'bg-sky-600 hover:bg-sky-700 text-white'}`}>
                              {savingTiers ? 'Saving…' : '💾 Save Prices'}
                            </button>
                          </>
                        ) : (
                          /* ── Normal mode: select tier + custom input ── */
                          <>
                            {tiers.length > 0 && (
                              <>
                                <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2">Select Size</p>
                                <div className={`grid gap-2 mb-3 ${tiers.length <= 2 ? 'grid-cols-2' : tiers.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
                                  {tiers.map((tier, i) => {
                                    const explicitMatch = !!detailBaseTier && detailBaseTier === tier.label && !!tier.price
                                    // On a reopened appointment the chosen tier label isn't saved.
                                    // If the price uniquely matches one tier, highlight that tier too.
                                    const uniquePriceMatch = !!tier.price && !detailBaseTier && detailBasePrice === tier.price
                                      && tiers.filter(t => t.price === tier.price).length === 1
                                    const isSelected = explicitMatch || uniquePriceMatch
                                    return (
                                      <button key={i}
                                        onClick={() => { if (tier.price) { setDetailBasePrice(isSelected ? '' : tier.price); setDetailBaseTier(isSelected ? '' : tier.label); setTotalSaved(false) } }}
                                        disabled={!tier.price}
                                        className={`flex flex-col items-center justify-center rounded-2xl py-3.5 px-2 border-2 transition-all active:scale-95 ${
                                          isSelected
                                            ? 'bg-emerald-500 border-emerald-500 shadow-md'
                                            : tier.price
                                              ? 'bg-white border-gray-200 hover:border-emerald-300 hover:bg-emerald-50'
                                              : 'bg-gray-50 border-gray-100 opacity-40 cursor-default'
                                        }`}>
                                        <span className={`text-xs font-semibold leading-tight text-center ${isSelected ? 'text-emerald-100' : 'text-gray-500'}`}>
                                          {tier.label}
                                        </span>
                                        <span className={`text-2xl font-black leading-tight mt-0.5 ${isSelected ? 'text-white' : tier.price ? 'text-gray-800' : 'text-gray-300'}`}>
                                          {tier.price ? `$${tier.price}` : '—'}
                                        </span>
                                        {tier.duration && (
                                          <span className={`text-[10px] leading-none mt-0.5 ${isSelected ? 'text-emerald-100' : 'text-gray-400'}`}>
                                            ⏱ {tier.duration}
                                          </span>
                                        )}
                                      </button>
                                    )
                                  })}
                                </div>
                              </>
                            )}
                            {!hasPrices && tiers.length > 0 && (
                              <p className="text-xs text-amber-500 mb-2">⚠️ No prices set — tap ✏️ Edit to add prices</p>
                            )}
                            {/* Custom price input */}
                            <div className={`flex items-center rounded-2xl border-2 overflow-hidden mb-3 transition-all ${
                              detailBasePrice && !detailBaseTier
                                ? 'border-emerald-400 bg-emerald-50'
                                : 'border-gray-200 bg-gray-50'
                            }`}>
                              <span className={`text-base font-black px-4 py-3 border-r-2 ${
                                detailBasePrice && !detailBaseTier
                                  ? 'border-emerald-300 text-emerald-600'
                                  : 'border-gray-200 text-gray-400'
                              }`}>$</span>
                              <input
                                type="text" inputMode="numeric" pattern="[0-9]*"
                                placeholder={tiers.length > 0 ? 'or enter custom…' : 'enter price…'}
                                value={detailBaseTier ? '' : detailBasePrice}
                                onChange={e => { const v = e.target.value.replace(/[^0-9.]/g, ''); setDetailBasePrice(v); setDetailBaseTier(''); setTotalSaved(false) }}
                                onFocus={() => { if (detailBaseTier) { setDetailBasePrice(''); setDetailBaseTier(''); setTotalSaved(false) } }}
                                className={`flex-1 text-xl font-black py-3 px-4 bg-transparent focus:outline-none placeholder:text-gray-300 ${
                                  detailBasePrice && !detailBaseTier ? 'text-emerald-700' : 'text-gray-700'
                                }`}
                              />
                            </div>
                          </>
                        )}

                        {/* ── Add-on Services ── */}
                        {(otherServices.length > 0 || detailAddOns.length > 0) && (
                          <div className="border-t border-gray-100 pt-3 mt-1 mb-3">
                            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2">Add-on Services</p>

                            {/* Selected add-ons */}
                            {detailAddOns.length > 0 && (
                              <div className="space-y-2 mb-2">
                                {detailAddOns.map(addon => (
                                  <div key={addon.id} className="flex items-center gap-2 bg-sky-50 border-2 border-sky-200 rounded-2xl px-4 py-2.5">
                                    <span className="text-sm font-bold text-sky-800 flex-1">{addon.name}</span>
                                    <div className="flex items-center rounded-xl border-2 border-sky-300 bg-white overflow-hidden">
                                      <span className="text-sm font-black px-3 py-1.5 border-r-2 border-sky-200 text-sky-500">$</span>
                                      <input
                                        type="number" min="0" step="1"
                                        value={addon.price}
                                        onChange={e => setDetailAddOns(prev => prev.map(a => a.id === addon.id ? { ...a, price: e.target.value } : a))}
                                        className="w-14 text-base font-black text-sky-700 bg-transparent focus:outline-none text-center py-1.5 px-2"
                                      />
                                    </div>
                                    <button onClick={() => setDetailAddOns(prev => prev.filter(a => a.id !== addon.id))}
                                      className="w-7 h-7 rounded-full bg-rose-100 hover:bg-rose-200 text-rose-400 hover:text-rose-600 flex items-center justify-center text-sm font-bold transition-colors">✕</button>
                                  </div>
                                ))}
                              </div>
                            )}

                            {/* Available add-on chips */}
                            <div className="flex flex-wrap gap-1.5 mb-2">
                              {otherServices
                                .filter(s => !detailAddOns.find(a => a.id === s.id))
                                .map(s => {
                                  const label = s.name || serviceMap[s.id] || s.id
                                  const defaultPrice = s.tiers?.find(t => t.price)?.price ?? ''
                                  const priceSuffix = defaultPrice && !/\$/.test(label) ? ` · $${defaultPrice}` : ''
                                  return (
                                    <button key={s.id}
                                      onClick={() => {
                                        setDetailAddOns(prev => [...prev, { id: s.id, name: label, price: defaultPrice }])
                                      }}
                                      className="text-xs bg-white border-2 border-gray-200 hover:border-sky-300 hover:bg-sky-50 text-gray-600 hover:text-sky-700 px-3 py-1.5 rounded-full font-semibold transition-colors">
                                      + {label}{priceSuffix}
                                    </button>
                                  )
                                })
                              }
                            </div>

                            {/* Custom add-on */}
                            <div className="flex gap-1.5">
                              <input
                                value={detailAddonDraft.text}
                                onChange={e => setDetailAddonDraft(prev => ({ ...prev, text: e.target.value }))}
                                onKeyDown={e => {
                                  if (e.key === 'Enter' && detailAddonDraft.text.trim()) {
                                    setDetailAddOns(prev => [...prev, { id: Date.now().toString(), name: detailAddonDraft.text.trim(), price: detailAddonDraft.price }])
                                    setDetailAddonDraft({ text: '', price: '' })
                                  }
                                }}
                                placeholder="Custom add-on…"
                                className="flex-1 border border-gray-200 rounded-xl px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sky-300"
                              />
                              <input
                                value={detailAddonDraft.price}
                                onChange={e => { const v = e.target.value.replace(/[^0-9.]/g, ''); setDetailAddonDraft(prev => ({ ...prev, price: v })) }}
                                placeholder="$" type="text" inputMode="numeric"
                                className="w-14 border border-gray-200 rounded-xl px-2 py-1.5 text-sm text-center bg-white focus:outline-none focus:ring-2 focus:ring-sky-300"
                              />
                              <button
                                onClick={() => {
                                  if (!detailAddonDraft.text.trim()) return
                                  setDetailAddOns(prev => [...prev, { id: Date.now().toString(), name: detailAddonDraft.text.trim(), price: detailAddonDraft.price }])
                                  setDetailAddonDraft({ text: '', price: '' })
                                }}
                                disabled={!detailAddonDraft.text.trim()}
                                className="px-3 py-1.5 bg-sky-500 text-white text-sm font-bold rounded-xl disabled:opacity-40">+</button>
                            </div>
                          </div>
                        )}

                        {/* Discount code selector (shared with groomer; first-visit-only gated) */}
                        {subtotalAmt > 0 && (
                          <div className={`rounded-2xl border-2 overflow-hidden mb-3 ${detailCouponId ? 'border-pink-300 bg-pink-50' : 'border-gray-200 bg-gray-50'}`}>
                            <div className="flex items-center px-4 py-2.5 gap-3">
                              <span className="text-sm">🎟️</span>
                              <select
                                value={detailCouponId ?? ''}
                                onChange={e => { setDetailCouponId(e.target.value || null); setTotalSaved(false) }}
                                className={`flex-1 text-sm font-semibold bg-transparent focus:outline-none ${detailCouponId ? 'text-pink-700' : 'text-gray-400'}`}
                              >
                                <option value="">Apply discount…</option>
                                {availableCoupons.map(c => {
                                  const blocked = !!c.first_visit_only && detailHasPriorPaid === true
                                  return (
                                    <option key={c.id} value={c.id} disabled={blocked}>
                                      {c.name} — {c.discount_type === 'percent' ? `${c.discount_value}% off` : `$${c.discount_value} off`}{blocked ? ' · first visit only' : ''}
                                    </option>
                                  )
                                })}
                              </select>
                              {detailCouponId && (
                                <button onClick={() => { setDetailCouponId(null); setTotalSaved(false) }} className="text-pink-400 hover:text-pink-600 text-lg leading-none">✕</button>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Total breakdown */}
                        {(detailBasePrice || detailAddOns.length > 0) && (
                          <div className="bg-gray-50 rounded-2xl border border-gray-100 px-4 py-3 mb-3 space-y-1.5">
                            {detailBasePrice && (
                              <div className="flex justify-between items-center text-sm">
                                <span className="text-gray-500">{svcName}</span>
                                <span className="font-bold text-gray-700">${detailBasePrice}</span>
                              </div>
                            )}
                            {detailAddOns.map(a => (
                              <div key={a.id} className="flex justify-between items-center text-sm">
                                <span className="text-gray-500">{a.name}</span>
                                <span className="font-bold text-gray-700">${a.price || '0'}</span>
                              </div>
                            ))}
                            {discountAmt > 0 && (
                              <div className="flex justify-between items-center text-sm">
                                <span className="text-pink-500 font-semibold">🎟️ {selectedCoupon?.name ?? 'Discount'}</span>
                                <span className="font-bold text-pink-500">−${discountAmt.toFixed(2)}</span>
                              </div>
                            )}
                            <div className="flex justify-between items-center pt-2 border-t border-gray-200">
                              <span className="font-bold text-gray-800">Total</span>
                              <div className="text-right">
                                {discountAmt > 0 && subtotalAmt > 0 && <span className="text-xs text-gray-400 line-through mr-2">${subtotalAmt.toFixed(2)}</span>}
                                <span className={`text-xl font-black ${totalSaved && grandTotal > 0 ? 'text-emerald-600' : discountAmt > 0 ? 'text-pink-600' : 'text-gray-700'}`}>${grandTotal.toFixed(2)}</span>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Save Total button */}
                        <button
                          disabled={grandTotal <= 0 || savingPayment}
                          onClick={async () => {
                            if (!detailAppt || grandTotal <= 0) return
                            const amount = grandTotal.toString()
                            setDetailPayAmount(amount)
                            // Card/Zelle/Venmo/Check are collected immediately, so saving
                            // the total marks the appointment paid. Cash keeps its current
                            // status (it may still be pending collection).
                            const effectiveStatus = detailPayMethod === 'cash' ? detailPayStatus : 'paid'
                            if (effectiveStatus !== detailPayStatus) setDetailPayStatus(effectiveStatus)
                            setSavingPayment(true)
                            try {
                              const res = await fetch(`/api/admin/appointments/${detailAppt.id}`, {
                                method: 'PATCH',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                  action: 'record-payment', payment_amount: amount, payment_method: detailPayMethod, payment_status: effectiveStatus, addons: detailAddOns,
                                  discount_label: selectedCoupon ? selectedCoupon.name : null,
                                  discount_percent: selectedCoupon?.discount_type === 'percent' ? String(selectedCoupon.discount_value) : null,
                                  discount_amount: discountAmt > 0 ? discountAmt.toFixed(2) : null,
                                  size_tier: detailBaseTier || null,
                                }),
                              })
                              const data = await res.json()
                              if (data.success) {
                                const addonNotes = detailAddOns.map((a: { id: string; name: string; price: string }) => ({ id: a.id, text: a.name, price: a.price, is_addon: true as const, author: 'system', created_at: new Date().toISOString() }))
                                const nonAddonNotes = (detailAppt.notes_list ?? []).filter((n: { is_addon?: boolean }) => !n.is_addon)
                                const dLabel = selectedCoupon ? selectedCoupon.name : null
                                const dPct = selectedCoupon?.discount_type === 'percent' ? String(selectedCoupon.discount_value) : null
                                const dAmt = discountAmt > 0 ? discountAmt.toFixed(2) : null
                                setDetailAppt(prev => prev ? { ...prev, payment_amount: amount, payment_method: detailPayMethod, payment_status: effectiveStatus, status: effectiveStatus === 'paid' ? 'completed' : prev.status, size_tier: detailBaseTier || null, discount_label: dLabel, discount_percent: dPct, discount_amount: dAmt, notes_list: [...nonAddonNotes, ...addonNotes] } as typeof prev : prev)
                                setAppointments(prev => prev.map(a => a.id === detailAppt.id ? { ...a, payment_amount: amount, payment_method: detailPayMethod, payment_status: effectiveStatus, size_tier: detailBaseTier || null, discount_label: dLabel, discount_percent: dPct, discount_amount: dAmt } as typeof a : a))
                                setTotalSaved(true)
                                showToast('✓ Total saved!')
                              }
                            } catch {/**/}
                            finally { setSavingPayment(false) }
                          }}
                          className={`w-full py-2.5 disabled:opacity-50 text-white text-sm font-bold rounded-xl transition-colors flex items-center justify-center gap-2 ${totalSaved && grandTotal > 0 ? 'bg-gray-400 hover:bg-emerald-500' : 'bg-emerald-500 hover:bg-emerald-600'}`}>
                          {savingPayment ? '⏳ Saving…' : grandTotal > 0 ? (totalSaved ? `✓ Total · $${grandTotal}` : `💾 Save Total · $${grandTotal}`) : 'Select a size first'}
                        </button>
                      </div>
                    )
                  })()}

                  {/* Pet details */}
                  <div className="bg-gray-50 rounded-2xl p-4 space-y-2">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Pet</p>
                    <div className="flex items-center gap-3">
                      {detailAppt.pets?.photo_url
                        ? <img src={detailAppt.pets.photo_url} className="w-14 h-14 rounded-full object-cover border-2 border-white" alt="" />
                        : <div className="w-14 h-14 rounded-full bg-sky-100 flex items-center justify-center text-3xl">🐶</div>}
                      <div className="flex-1 min-w-0">
                        {editingApptName ? (
                          <div className="flex items-center gap-1 mb-0.5">
                            <input autoFocus value={petNameDraft} onChange={e => setPetNameDraft(e.target.value)}
                              onKeyDown={e => { if (e.key === 'Enter' && detailAppt.pets?.id) updatePetName(detailAppt.pets.id, petNameDraft); if (e.key === 'Escape') setEditingApptName(false) }}
                              className="font-bold text-gray-800 border border-sky-300 rounded-lg px-2 py-0.5 w-40 focus:outline-none focus:ring-1 focus:ring-sky-400" />
                            <button onClick={() => detailAppt.pets?.id && updatePetName(detailAppt.pets.id, petNameDraft)}
                              disabled={!petNameDraft.trim() || savingNameId === detailAppt.pets?.id}
                              className="text-xs bg-sky-600 text-white px-2 py-0.5 rounded-lg disabled:opacity-40 hover:bg-sky-700">
                              {savingNameId === detailAppt.pets?.id ? '…' : 'Save'}
                            </button>
                            <button onClick={() => setEditingApptName(false)} className="text-xs text-gray-400 hover:text-gray-600">✕</button>
                          </div>
                        ) : (
                          <button onClick={() => { setEditingApptName(true); setPetNameDraft(detailAppt.pets?.name || '') }}
                            className="flex items-center gap-1 font-bold text-gray-800 hover:text-sky-600 group">
                            <span>{detailAppt.pets?.name}</span>
                            <span className="opacity-0 group-hover:opacity-100 text-gray-400 text-xs font-normal">✏️</span>
                          </button>
                        )}
                        {/* Breed + editable weight */}
                        <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                          {detailAppt.pets?.breed && <span className="text-xs text-gray-500">{detailAppt.pets.breed}</span>}
                          {detailAppt.pets?.breed && <span className="text-xs text-gray-300">·</span>}
                          {editingApptWeight ? (
                            <div className="flex items-center gap-1 flex-wrap">
                              {apptWeightDraft === '__custom__' ? (
                                <>
                                  <input autoFocus type="text" value={customWeightText} onChange={e => setCustomWeightText(e.target.value)}
                                    placeholder="e.g. 52 lbs"
                                    className="text-xs border border-sky-300 rounded-lg px-2 py-0.5 w-28 bg-white focus:outline-none focus:ring-1 focus:ring-sky-400"
                                    onKeyDown={e => { if (e.key === 'Enter' && customWeightText.trim() && detailAppt.pets?.id) updatePetWeight(detailAppt.pets.id, customWeightText.trim()) }} />
                                  <button onClick={() => setApptWeightDraft('')} className="text-xs text-gray-400 hover:text-gray-600">← back</button>
                                  <button onClick={() => { if (customWeightText.trim() && detailAppt.pets?.id) updatePetWeight(detailAppt.pets.id, customWeightText.trim()) }}
                                    disabled={!customWeightText.trim() || savingWeightId === detailAppt.pets?.id}
                                    className="text-xs bg-sky-600 text-white px-2 py-0.5 rounded-lg disabled:opacity-40">
                                    {savingWeightId === detailAppt.pets?.id ? '…' : 'Save'}
                                  </button>
                                </>
                              ) : (
                                <>
                                  <select value={apptWeightDraft} onChange={e => { setApptWeightDraft(e.target.value); if (e.target.value === '__custom__') setCustomWeightText('') }}
                                    className="text-xs border border-sky-300 rounded-lg px-1.5 py-0.5 bg-white focus:outline-none focus:ring-1 focus:ring-sky-400">
                                    <option value="">— select —</option>
                                    {WEIGHT_OPTIONS.map(w => <option key={w} value={w}>{w}</option>)}
                                    <option value="__custom__">✏️ Custom…</option>
                                  </select>
                                  <button onClick={() => detailAppt.pets?.id && updatePetWeight(detailAppt.pets.id, apptWeightDraft)}
                                    disabled={!apptWeightDraft || savingWeightId === detailAppt.pets?.id}
                                    className="text-xs bg-sky-600 text-white px-2 py-0.5 rounded-lg disabled:opacity-40 hover:bg-sky-700">
                                    {savingWeightId === detailAppt.pets?.id ? '…' : 'Save'}
                                  </button>
                                </>
                              )}
                              <button onClick={() => { setEditingApptWeight(false); setCustomWeightText('') }} className="text-xs text-gray-400 hover:text-gray-600">✕</button>
                            </div>
                          ) : (
                            <button onClick={() => { setEditingApptWeight(true); const w = detailAppt.pets?.weight || ''; setApptWeightDraft(WEIGHT_OPTIONS.includes(w) ? w : w ? '__custom__' : ''); setCustomWeightText(!WEIGHT_OPTIONS.includes(w) ? w : '') }}
                              className="flex items-center gap-1 text-xs text-gray-500 hover:text-sky-600 group">
                              <span>{detailAppt.pets?.weight || <span className="text-gray-300 italic">no weight</span>}</span>
                              <span className="opacity-0 group-hover:opacity-100 text-gray-400 text-xs">✏️</span>
                            </button>
                          )}
                        </div>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium mt-1 inline-block ${
                          detailAppt.pets?.vaccine_status==='verified' ? 'bg-green-100 text-green-700' :
                          detailAppt.pets?.vaccine_status==='email_sent' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-600'}`}>
                          {detailAppt.pets?.vaccine_status==='verified'?'✓ Vaccinated':detailAppt.pets?.vaccine_status==='email_sent'?'Records Pending':'No Records'}
                        </span>
                        {/* Tags — same picker used on the Pet Parents page, just wired
                            to this appointment's pet so it's reachable from the Calendar
                            popup too, not only from Pet Parents. */}
                        {detailAppt.pets?.id && (
                          <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
                            {detailPetTags.map(t => (
                              <TagPill
                                key={t.id}
                                tag={t}
                                onRemove={async () => {
                                  await fetch('/api/admin/pet-tags', {
                                    method: 'DELETE', headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ pet_id: detailAppt.pets!.id, tag_id: t.id }),
                                  })
                                  setDetailPetTags(prev => prev.filter(x => x.id !== t.id))
                                }}
                              />
                            ))}
                            <TagPicker
                              petId={detailAppt.pets.id}
                              currentTags={detailPetTags}
                              onChange={setDetailPetTags}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  {/* Appointment info */}
                  <div className="bg-gray-50 rounded-2xl p-4 grid grid-cols-2 gap-3 text-sm">
                    <div><span className="text-xs text-gray-400 block">Date</span><p className="font-medium text-gray-700">{formatDate(detailAppt.appointment_date)}</p></div>
                    <div><span className="text-xs text-gray-400 block">Time</span><p className="font-medium text-gray-700">{detailAppt.appointment_time}</p></div>
                    <div><span className="text-xs text-gray-400 block">Booked On</span><p className="font-medium text-gray-700">{new Date(detailAppt.created_at).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}</p></div>
                    {detailAppt.confirmed_at && <div><span className="text-xs text-gray-400 block">Confirmed</span><p className="font-medium text-gray-700">{new Date(detailAppt.confirmed_at).toLocaleDateString('en-US',{month:'short',day:'numeric'})}</p></div>}
                  </div>

                </>
              )}

              {/* ── CUSTOMER TAB ─────────────────────────── */}
              {detailTab === 'customer' && (() => {
                // Use full client record if loaded, fall back to data already on the appointment
                const clientName  = detailClient?.name  ?? detailAppt.clients?.name  ?? '—'
                const clientPhone = detailClient?.phone ?? detailAppt.clients?.phone ?? detailAppt.client_phone
                const clientEmail = detailClient?.email ?? detailAppt.clients?.email ?? null
                const clientAddr  = detailClient?.address ?? null
                const clientSince = detailClient?.created_at ?? null
                const pickups     = detailClient?.authorized_pickups ?? []
                // Pets: prefer full record, else build a 1-item list from appointment's pets join
                const pets: { id: string; name: string; breed: string | null; weight: string | null; vaccine_status: string; vaccine_expiry: string | null; photo_url: string | null }[] =
                  detailClient?.pets ?? (detailAppt.pets ? [{ id: detailAppt.pet_id ?? '__appt__', ...detailAppt.pets }] : [])

                const vcBadge = (vs: string) => ({
                  color: vs === 'approved' ? 'bg-emerald-100 text-emerald-700'
                    : vs === 'expired'   ? 'bg-red-100 text-red-700'
                    : vs === 'pending'   ? 'bg-amber-100 text-amber-700'
                    : vs === 'text_only' ? 'bg-sky-100 text-sky-700'
                    : 'bg-gray-100 text-gray-500',
                  label: vs === 'approved'  ? '✓ Verified'
                    : vs === 'expired'   ? '⚠️ Expired'
                    : vs === 'pending'   ? '⏳ Pending'
                    : vs === 'text_only' ? '📱 Text only'
                    : vs || '—',
                })

                return (
                  <>
                    {detailClientLoading && (
                      <p className="text-xs text-gray-400 text-center py-1">Loading full record…</p>
                    )}

                    {/* Contact */}
                    <div className="bg-gray-50 rounded-2xl p-4 space-y-2">
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Contact</p>
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div><span className="text-xs text-gray-400 block">Name</span><p className="font-medium text-gray-700">{clientName}</p></div>
                        <div><span className="text-xs text-gray-400 block">Phone</span><p className="font-medium text-gray-700">{clientPhone}</p></div>
                        <div><span className="text-xs text-gray-400 block">Email</span><p className="font-medium text-gray-700">{clientEmail || '—'}</p></div>
                        <div><span className="text-xs text-gray-400 block">Address</span><p className="font-medium text-gray-700">{clientAddr || '—'}</p></div>
                        {clientSince && (
                          <div className="col-span-2"><span className="text-xs text-gray-400 block">Member Since</span><p className="font-medium text-gray-700">{new Date(clientSince).toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'})}</p></div>
                        )}
                      </div>
                      <div className="pt-2 mt-2 border-t border-gray-100 flex items-center justify-between">
                        <div>
                          <span className="text-xs text-gray-400 block">SMS Consent</span>
                          {detailClient?.sms_consent ? (
                            <p className="text-sm font-semibold text-emerald-700">✓ Opted in{detailClient.sms_consent_at ? ` · ${new Date(detailClient.sms_consent_at).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}` : ''}</p>
                          ) : (
                            <p className="text-sm font-semibold text-amber-700">⚠ Not opted in — no texts sent</p>
                          )}
                        </div>
                        {!detailClient?.sms_consent && (
                          <button
                            onClick={() => clientPhone && grantSmsConsent(clientPhone)}
                            disabled={smsConsentSaving || !clientPhone}
                            className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-sky-600 text-white disabled:opacity-50 hover:bg-sky-700"
                            title="Use only after the client has verbally confirmed they want to receive SMS notifications"
                          >
                            {smsConsentSaving ? 'Saving…' : 'Mark opted-in'}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Authorized pickups */}
                    {pickups.length > 0 && (
                      <div className="bg-gray-50 rounded-2xl p-4">
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Authorized Pickup People</p>
                        <div className="flex flex-wrap gap-2">
                          {pickups.map(p => (
                            <div key={p.id} className="flex items-center gap-1.5 bg-sky-50 border border-sky-100 rounded-full px-3 py-1 text-sm">
                              <span className="font-medium text-sky-800">{p.name}</span>
                              {p.relationship && <span className="text-sky-400">· {p.relationship}</span>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Dogs & Vaccines */}
                    {pets.length > 0 && (
                      <div className="bg-gray-50 rounded-2xl p-4">
                        <div className="flex items-center justify-between mb-3">
                          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Dogs & Vaccines</p>
                          <button
                            onClick={() => { setDetailAppt(null); setTab('vaccines') }}
                            className="text-xs text-violet-600 hover:text-violet-700 font-semibold flex items-center gap-1">
                            💉 All Records →
                          </button>
                        </div>
                        <div className="space-y-2">
                          {pets.map(p => {
                            const { color, label } = vcBadge(p.vaccine_status)
                            return (
                              <div key={p.id} className="bg-white rounded-xl p-2.5 flex items-center gap-3">
                                {p.photo_url
                                  ? <img src={p.photo_url} className="w-10 h-10 rounded-full object-cover flex-shrink-0" alt="" />
                                  : <div className="w-10 h-10 rounded-full bg-sky-100 flex items-center justify-center text-base flex-shrink-0">🐶</div>
                                }
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-sm font-semibold text-gray-800">{p.name}</span>
                                    {p.breed && <span className="text-xs text-gray-400 truncate">{p.breed}</span>}
                                  </div>
                                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${color}`}>{label}</span>
                                    {p.vaccine_expiry && (
                                      <span className="text-xs text-gray-400">
                                        Exp: {new Date(p.vaccine_expiry + 'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}

                    {detailClient && (
                      <p className="text-xs text-gray-400 text-center">{detailClient.appointments.length} total appointment{detailClient.appointments.length!==1?'s':''}</p>
                    )}
                  </>
                )
              })()}

              {/* ── HISTORY TAB ──────────────────────────── */}
              {detailTab === 'payment' && (
                <>
                  {/* ── This Visit Payment ── */}
                  <div className="rounded-2xl border border-gray-100 overflow-hidden">
                    <div className="bg-gray-50 px-4 py-3 border-b border-gray-100">
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">This Visit — Payment</p>
                    </div>
                    {(detailAppt.payment_amount || detailAppt.payment_method || detailAppt.payment_status === 'paid') ? (
                      <div className="divide-y divide-gray-50">
                        <div className="flex items-center gap-4 px-4 py-4 bg-white">
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg flex-shrink-0 ${detailAppt.payment_status === 'paid' ? 'bg-emerald-100' : 'bg-amber-100'}`}>
                            {detailAppt.payment_status === 'paid' ? '✓' : '⏳'}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className={`text-base font-bold ${detailAppt.payment_status === 'paid' ? 'text-emerald-700' : 'text-amber-600'}`}>
                              {detailAppt.payment_amount ? `$${detailAppt.payment_amount}` : 'Amount not recorded'}
                            </p>
                            <p className="text-xs text-gray-400 mt-0.5">{formatDate(detailAppt.appointment_date)}</p>
                          </div>
                          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${detailAppt.payment_status === 'paid' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                            {detailAppt.payment_status === 'paid' ? '✓ Paid' : 'Unpaid'}
                          </span>
                        </div>
                        <div className="grid grid-cols-3 divide-x divide-gray-50">
                          <div className="px-4 py-3 bg-white">
                            <p className="text-xs text-gray-400 mb-1">Method</p>
                            <p className="text-sm font-semibold text-gray-700">
                              {detailAppt.payment_method === 'cash' ? '💵 Cash' : detailAppt.payment_method === 'card' ? '💳 Card' : detailAppt.payment_method === 'venmo' ? '📱 Venmo' : detailAppt.payment_method === 'zelle' ? '🔵 Zelle' : detailAppt.payment_method === 'check' ? '📝 Check' : detailAppt.payment_method || '—'}
                            </p>
                          </div>
                          <div className="px-4 py-3 bg-white">
                            <p className="text-xs text-gray-400 mb-1">Tip</p>
                            <p className="text-sm font-semibold text-emerald-700">{detailAppt.tip_amount ? `$${detailAppt.tip_amount}` : '—'}</p>
                          </div>
                          <div className="px-4 py-3 bg-white">
                            <p className="text-xs text-gray-400 mb-1">Service</p>
                            <p className="text-sm font-semibold text-gray-700 truncate">{services.find(s => s.id === detailAppt.service)?.name ?? serviceMap[detailAppt.service] ?? detailAppt.service}</p>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="px-4 py-5 bg-white text-center">
                        <p className="text-sm text-gray-400">No payment recorded for this visit</p>
                      </div>
                    )}
                  </div>

                  {/* ── Service History ── */}
                  <div className="rounded-2xl border border-gray-100 overflow-hidden">
                    <div className="bg-gray-50 px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Service History</p>
                      {detailClient && (
                        <span className="text-xs text-gray-400">{detailClient.appointments.length} visit{detailClient.appointments.length !== 1 ? 's' : ''} total</span>
                      )}
                    </div>
                    {detailClientLoading ? (
                      <div className="px-4 py-5 bg-white text-center"><p className="text-sm text-gray-400">Loading…</p></div>
                    ) : detailClient && detailClient.appointments.length > 0 ? (
                      <div className="divide-y divide-gray-50">
                        {[...detailClient.appointments]
                          .sort((a, b) => new Date(b.appointment_date).getTime() - new Date(a.appointment_date).getTime())
                          .map(a => (
                            <div key={a.id}>
                            <div
                              className="flex items-center gap-3 px-4 py-3 bg-white hover:bg-sky-50 transition-colors"
                            >
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm flex-shrink-0 ${
                                a.status === 'completed' ? 'bg-emerald-100' : a.status === 'cancelled' ? 'bg-red-50' : 'bg-sky-100'
                              }`}>
                                {a.status === 'completed' ? '✓' : a.status === 'cancelled' ? '✕' : '📅'}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-gray-800">{serviceMap[a.service] ?? a.service}</p>
                                <p className="text-xs text-gray-400">{formatDate(a.appointment_date)} · {a.appointment_time}</p>
                                {(a.assigned_groomer || a.assigned_bather) && (
                                  <p className="text-xs text-gray-400 mt-0.5">
                                    {a.assigned_groomer && `✂️ ${firstName(a.assigned_groomer)}`}{a.assigned_groomer && a.assigned_bather ? ' · ' : ''}{a.assigned_bather && `🛁 ${firstName(a.assigned_bather)}`}
                                  </p>
                                )}
                                {/* Health Check Summary */}
                                {(a as any).health_check && (() => {
                                  const hc = (a as any).health_check
                                  // Detect format: new format has array values; old format has booleans (true=OK, false=issue)
                                  const isNewFormat = (['eyes','ears','nose','mouth','paws','skin'] as const).some(p => Array.isArray(hc[p]))
                                  const totalIssues = (['eyes','ears','nose','mouth','paws','skin'] as const)
                                    .reduce((sum, part) => {
                                      const val = hc[part]
                                      if (isNewFormat) return sum + (Array.isArray(val) ? val.length : 0)
                                      // Old format: false = had an issue
                                      return sum + (val === false ? 1 : 0)
                                    }, 0)
                                  const cleared: string[] = Array.isArray(hc.cleared_sections) ? hc.cleared_sections : []
                                  // Old format all-clear: all 6 body parts are true
                                  const oldFormatAllClear = !isNewFormat && (['eyes','ears','nose','mouth','paws','skin'] as const).every(p => hc[p] === true)
                                  const allClear = oldFormatAllClear || (cleared.length === 6 && totalIssues === 0)
                                  return (
                                    <div className="mt-2 flex items-center gap-1.5">
                                      <span className="text-xs font-medium text-sky-600">Initial check:</span>
                                      {allClear ? (
                                        <span className="text-xs bg-green-100 text-green-700 rounded px-1.5 py-0.5">✅ All Normal</span>
                                      ) : totalIssues > 0 ? (
                                        <span className="text-xs bg-rose-100 text-rose-700 rounded px-1.5 py-0.5">⚠️ {totalIssues} issue{totalIssues > 1 ? 's' : ''}</span>
                                      ) : (
                                        <span className="text-xs bg-gray-100 text-gray-500 rounded px-1.5 py-0.5">Completed</span>
                                      )}
                                    </div>
                                  )
                                })()}
                                {/* Quality Check Summary */}
                                {(a as any).grooming_quality && (() => {
                                  const q = (a as any).grooming_quality
                                  const checks = [
                                    { key: 'nails_trimmed',  emoji: '✂️', oldKey: 'nails_trimmed' },
                                    { key: 'ears_cleaned',   emoji: '👂', oldKey: 'ears_cleaned' },
                                    { key: 'tangles_free',   emoji: '🪮', oldKey: 'coat_brushed' },
                                    { key: 'sanitary_trim',  emoji: '🧼', oldKey: 'bath_completed' },
                                    { key: 'paw_pad_trim',   emoji: '🐾', oldKey: 'paw_pads_cleared' },
                                    { key: 'perfume_spray',  emoji: '🌸', oldKey: 'styling_finished' },
                                  ]
                                  const done = checks.filter(c => q[c.key] || q[c.oldKey])
                                  return (
                                    <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                                      <span className="text-xs font-medium text-emerald-600">Quality:</span>
                                      <span className="text-xs text-gray-600 flex items-center gap-0.5">
                                        {done.length === checks.length ? (
                                          <span className="text-xs bg-green-100 text-green-700 rounded px-1.5 py-0.5">✅ All Done</span>
                                        ) : done.length > 0 ? (
                                          done.map(c => <span key={c.key}>{c.emoji}✓</span>)
                                        ) : (
                                          <span className="text-xs text-gray-400">—</span>
                                        )}
                                      </span>
                                    </div>
                                  )
                                })()}
                              </div>
                              <div className="text-right flex-shrink-0">
                                {a.payment_amount && <p className="text-sm font-bold text-gray-700">${a.payment_amount}</p>}
                                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[a.status] ?? 'bg-gray-100 text-gray-500'}`}>{a.status}</span>
                              </div>
                              <button
                                onClick={() => setExpandedHistoryId(prev => prev === a.id ? null : a.id)}
                                className={`px-3 py-1 text-xs font-semibold rounded-lg flex-shrink-0 transition-colors ${expandedHistoryId === a.id ? 'bg-slate-200 hover:bg-slate-300 text-slate-700' : 'bg-sky-100 hover:bg-sky-200 text-sky-700'}`}
                              >
                                {expandedHistoryId === a.id ? 'Hide' : 'View'}
                              </button>
                            </div>
                            {expandedHistoryId === a.id && (() => {
                              const hc = (a as any).health_check
                              const q = (a as any).grooming_quality
                              const HC_SECTIONS = [
                                { key: 'eyes',  emoji: '👁️', label: 'Eyes' },
                                { key: 'ears',  emoji: '👂', label: 'Ears' },
                                { key: 'nose',  emoji: '👃', label: 'Nose' },
                                { key: 'mouth', emoji: '😬', label: 'Mouth / Teeth' },
                                { key: 'paws',  emoji: '🐾', label: 'Paw Pads' },
                                { key: 'skin',  emoji: '🧴', label: 'Skin & Coat' },
                              ]
                              const Q_CHECKS = [
                                { key: 'nails_trimmed', oldKey: 'nails_trimmed', emoji: '✂️', label: 'Nails Trimmed' },
                                { key: 'ears_cleaned',  oldKey: 'ears_cleaned',  emoji: '👂', label: 'Ears Cleaned' },
                                { key: 'tangles_free',  oldKey: 'coat_brushed',  emoji: '🪮', label: 'Tangles Free' },
                                { key: 'sanitary_trim', oldKey: 'bath_completed',emoji: '🧼', label: 'Sanitary Trim' },
                                { key: 'paw_pad_trim',  oldKey: 'paw_pads_cleared', emoji: '🐾', label: 'Paw Pad Trim' },
                                { key: 'perfume_spray', oldKey: 'styling_finished', emoji: '🌸', label: 'Perfume Spray' },
                              ]
                              const addOns = (a.notes_list ?? []).filter(n => n.is_addon)
                              const groomerNotes = (a.notes_list ?? []).filter(n => !n.is_addon)
                              return (
                                <div className="px-4 pb-4 bg-sky-50/50 border-t border-sky-100 space-y-3">
                                  {/* Payment */}
                                  {(a.payment_amount || a.tip_amount) && (
                                    <div className="grid grid-cols-3 divide-x divide-white bg-white rounded-xl border border-gray-100 mt-3 overflow-hidden">
                                      <div className="px-3 py-2">
                                        <p className="text-[10px] text-gray-400">Amount</p>
                                        <p className="text-sm font-semibold text-gray-700">{a.payment_amount ? `$${a.payment_amount}` : '—'}</p>
                                      </div>
                                      <div className="px-3 py-2">
                                        <p className="text-[10px] text-gray-400">Method</p>
                                        <p className="text-sm font-semibold text-gray-700">{a.payment_method || '—'}</p>
                                      </div>
                                      <div className="px-3 py-2">
                                        <p className="text-[10px] text-gray-400">Tip</p>
                                        <p className="text-sm font-semibold text-emerald-700">{a.tip_amount ? `$${a.tip_amount}` : '—'}</p>
                                      </div>
                                    </div>
                                  )}
                                  {/* Health check detail */}
                                  {hc && (
                                    <div className="bg-white rounded-xl border border-gray-100 p-3 space-y-2">
                                      <p className="text-xs font-semibold text-sky-700 mb-2">🩺 Initial Health Check</p>
                                      <div className="grid grid-cols-2 gap-1.5">
                                        {HC_SECTIONS.map(s => {
                                          const val = hc[s.key]
                                          const hasIssue = Array.isArray(val) ? val.length > 0 : val === false
                                          const issueText = Array.isArray(val) ? val.join(', ') : ''
                                          return (
                                            <div key={s.key} className={`text-xs rounded-lg px-2 py-1 ${hasIssue ? 'bg-rose-50 text-rose-700' : 'bg-green-50 text-green-700'}`}>
                                              {s.emoji} {s.label}: {hasIssue ? (issueText || '⚠️ Issue') : '✓ Normal'}
                                            </div>
                                          )
                                        })}
                                      </div>
                                      {/* Health concerns note (added by groomer during initial check) */}
                                      {hc.groomer_notes_english && (
                                        <div className="bg-rose-50 border border-rose-100 rounded-xl px-3 py-2 space-y-0.5">
                                          <p className="text-xs font-semibold text-rose-600">🏥 Health Concerns / 健康狀況</p>
                                          <p className="text-xs text-gray-600">{hc.groomer_notes_english}</p>
                                          {hc.groomer_notes_chinese && <p className="text-xs text-gray-400">{hc.groomer_notes_chinese}</p>}
                                        </div>
                                      )}
                                    </div>
                                  )}
                                  {/* Quality check detail */}
                                  {q && (
                                    <div className="bg-white rounded-xl border border-gray-100 p-3 space-y-2">
                                      <p className="text-xs font-semibold text-emerald-700 mb-2">🎯 Grooming Quality Check</p>
                                      <div className="grid grid-cols-2 gap-1.5">
                                        {Q_CHECKS.map(c => {
                                          const done = !!(q[c.key] || q[c.oldKey])
                                          return (
                                            <div key={c.key} className={`text-xs rounded-lg px-2 py-1 ${done ? 'bg-green-50 text-green-700' : 'bg-gray-50 text-gray-400'}`}>
                                              {c.emoji} {c.label} {done ? '✓' : '—'}
                                            </div>
                                          )
                                        })}
                                      </div>
                                      {/* Groomer's note left for the customer */}
                                      {q.customer_note_english && (
                                        <div className="bg-white border border-emerald-100 rounded-xl px-3 py-2 space-y-0.5">
                                          <p className="text-xs font-semibold text-emerald-600">💌 Note to Customer</p>
                                          <p className="text-xs text-gray-600">{q.customer_note_english}</p>
                                          {q.customer_note_traditional && <p className="text-xs text-gray-400">{q.customer_note_traditional}</p>}
                                        </div>
                                      )}
                                    </div>
                                  )}
                                  {/* Groomer's diary note for this visit — read-only here. Only
                                      the groomer can write/edit this (from the groomer dashboard);
                                      admin/desk and admin/mobile just display it, blank if empty. */}
                                  {(() => {
                                    const hasNote = !!(q?.groomer_diary || q?.groomer_diary_english)
                                    return (
                                      <div className="bg-purple-50 border border-purple-100 rounded-xl px-3 py-2 space-y-1.5">
                                        <p className="text-xs font-semibold text-purple-600">📓 Groomer Notes / 美容師工作日記</p>
                                        {hasNote ? (
                                          <>
                                            <p className="text-xs text-gray-600 mt-0.5">{q?.groomer_diary_english || q?.groomer_diary}</p>
                                            {q?.groomer_diary_traditional && q.groomer_diary_traditional !== (q?.groomer_diary_english || q?.groomer_diary) && (
                                              <p className="text-xs text-gray-400">{q.groomer_diary_traditional}</p>
                                            )}
                                            {q?.groomer_diary_author && (
                                              <p className="text-[11px] text-purple-300">— {q.groomer_diary_author}</p>
                                            )}
                                          </>
                                        ) : (
                                          <p className="text-xs text-gray-400 italic">No note yet</p>
                                        )}
                                      </div>
                                    )
                                  })()}
                                  {/* Supervisor note for this visit — admin's own note, separate
                                      from the groomer's diary above. Admin can add/edit any time. */}
                                  {(() => {
                                    const hasNote = !!q?.supervisor_note
                                    const isEditingThis = editingHistorySupervisorId === a.id
                                    return (
                                      <div className="bg-sky-50 border border-sky-100 rounded-xl px-3 py-2 space-y-1.5">
                                        <div className="flex items-center justify-between">
                                          <p className="text-xs font-semibold text-sky-600">👔 Supervisor Note / 店長備註</p>
                                          {!isEditingThis && (
                                            <button
                                              onClick={() => { setEditingHistorySupervisorId(a.id); setHistorySupervisorDraft(q?.supervisor_note || '') }}
                                              className="text-xs font-semibold text-sky-600 hover:text-sky-700 px-2 py-0.5 rounded hover:bg-sky-100"
                                            >✏️ {hasNote ? 'Edit' : 'Add'}</button>
                                          )}
                                        </div>
                                        {isEditingThis ? (
                                          <div className="space-y-2">
                                            <textarea
                                              autoFocus
                                              value={historySupervisorDraft}
                                              onChange={e => setHistorySupervisorDraft(e.target.value)}
                                              className="w-full border border-sky-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-sky-300 resize-none bg-white"
                                              rows={3}
                                            />
                                            <div className="flex gap-2">
                                              <button
                                                onClick={() => setEditingHistorySupervisorId(null)}
                                                className="flex-1 py-1.5 text-xs font-semibold text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 bg-white"
                                              >Cancel</button>
                                              <button
                                                onClick={() => saveHistorySupervisor(a.id)}
                                                disabled={savingHistorySupervisor}
                                                className="flex-1 py-1.5 bg-sky-500 hover:bg-sky-600 text-white text-xs font-semibold rounded-lg disabled:opacity-50"
                                              >{savingHistorySupervisor ? 'Saving…' : '💾 Save'}</button>
                                            </div>
                                          </div>
                                        ) : hasNote ? (
                                          <>
                                            <p className="text-xs text-gray-600 mt-0.5">{q.supervisor_note}</p>
                                            {q.supervisor_note_author && (
                                              <p className="text-[11px] text-sky-300">— {q.supervisor_note_author}</p>
                                            )}
                                          </>
                                        ) : (
                                          <p className="text-xs text-gray-400 italic">No note yet</p>
                                        )}
                                      </div>
                                    )
                                  })()}
                                  {/* Add-ons */}
                                  {addOns.length > 0 && (
                                    <div className="bg-white rounded-xl border border-gray-100 p-3">
                                      <p className="text-xs font-semibold text-amber-700 mb-1.5">➕ Add-ons</p>
                                      <div className="space-y-1">
                                        {addOns.map(n => (
                                          <div key={n.id} className="flex items-center justify-between text-xs text-gray-600">
                                            <span>{n.text}</span>
                                            {n.price && <span className="font-semibold">${n.price}</span>}
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                  {/* Staff notes (timeline notes, distinct from the groomer diary above) */}
                                  {(a.notes || groomerNotes.length > 0) && (
                                    <div className="bg-white rounded-xl border border-gray-100 p-3">
                                      <p className="text-xs font-semibold text-gray-500 mb-1.5">📝 Staff Notes</p>
                                      {a.notes && <p className="text-xs text-gray-600 whitespace-pre-wrap mb-1">{a.notes}</p>}
                                      {groomerNotes.map(n => (
                                        <p key={n.id} className="text-xs text-gray-600">
                                          {n.text} {n.author && <span className="text-gray-400">— {n.author}</span>}
                                        </p>
                                      ))}
                                    </div>
                                  )}
                                  {!hc && !q && addOns.length === 0 && !a.notes && groomerNotes.length === 0 && !a.payment_amount && (
                                    <p className="text-xs text-gray-400 text-center py-2">No further details recorded for this visit</p>
                                  )}
                                </div>
                              )
                            })()}
                            </div>
                          ))}
                      </div>
                    ) : (
                      <div className="px-4 py-5 bg-white text-center">
                        <p className="text-sm text-gray-400">No service history found</p>
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* ── FUTURE APPOINTMENTS TAB ──────────────── */}
              {detailTab === 'future' && (
                <>
                  <p className="text-xs text-gray-400">Upcoming confirmed & pending appointments for {detailAppt.clients?.name}</p>
                  {detailFutureLoading
                    ? <p className="text-gray-400 text-sm">Loading…</p>
                    : detailFutureAppts.length === 0
                      ? <div className="bg-gray-50 rounded-2xl p-8 text-center text-gray-400 text-sm">No upcoming appointments</div>
                      : <div className="space-y-2">
                          {detailFutureAppts.map(a => (
                            <div key={a.id} className="bg-gray-50 rounded-2xl p-3 flex items-center gap-3 cursor-pointer hover:bg-sky-50 transition-colors" onClick={() => viewHistoryAppt(a)}>
                              {a.pets?.photo_url
                                ? <img src={a.pets.photo_url} className="w-9 h-9 rounded-full object-cover flex-shrink-0" alt="" />
                                : <div className="w-9 h-9 rounded-full bg-sky-100 flex items-center justify-center text-sm flex-shrink-0">🐶</div>}
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-gray-800">{a.pets?.name}</p>
                                <p className="text-xs text-gray-500">{serviceMap[a.service]??a.service} · {formatDate(a.appointment_date)} · {a.appointment_time}</p>
                              </div>
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${STATUS_COLORS[a.status]??'bg-gray-100 text-gray-500'}`}>{a.status}</span>
                            </div>
                          ))}
                        </div>
                  }
                </>
              )}

              {/* ── NOTES TAB ────────────────────────────── */}
              {detailTab === 'notes' && (
                <div className="space-y-3">

                  {editingNotes ? (
                    /* ── EDIT MODE ── */
                    <div className="bg-white rounded-2xl border border-gray-200 p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-bold text-gray-700">✏️ {detailAppt.notes ? 'Edit Note' : 'Add Note'}</p>
                        <span className="text-xs text-gray-400 flex items-center gap-1">
                          {translatingNotes && <span className="inline-block w-3 h-3 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" />}
                          {translatingNotes ? 'Translating…' : noteTranslations ? '✨ Translated' : 'Type in any language'}
                        </span>
                      </div>

                      {/* Staff selector */}
                      <div className="flex items-center gap-2">
                        <label className="text-xs font-semibold text-gray-500 shrink-0">Staff:</label>
                        <select
                          value={noteAuthor}
                          onChange={e => setNoteAuthor(e.target.value)}
                          className="flex-1 border border-gray-200 rounded-xl px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300 bg-white"
                        >
                          <option value="">— Select staff —</option>
                          {staff.filter(s => s.is_active).map(s => (
                            <option key={s.id} value={s.name}>{s.first_name || s.name.split(' ')[0]}</option>
                          ))}
                        </select>
                      </div>

                      <textarea
                        ref={noteInputRef}
                        onChange={e => {
                          if (!noteIsComposingRef.current) triggerAutoTranslate(e.target.value)
                        }}
                        onCompositionStart={() => { noteIsComposingRef.current = true }}
                        onCompositionEnd={e => {
                          noteIsComposingRef.current = false
                          const val = (e.target as HTMLTextAreaElement).value
                          triggerAutoTranslate(val)
                        }}
                        placeholder="Type in English, 繁體中文, or 简体中文…"
                        rows={4}
                        autoFocus
                        className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-sky-300 resize-none"
                      />

                      {noteTranslations && (
                        <div className="bg-violet-50 border border-violet-100 rounded-xl p-3 space-y-1.5">
                          <p className="text-xs font-semibold text-violet-500">✨ Will save in all languages</p>
                          {noteTranslations.detected !== 'english' && noteTranslations.english && (
                            <div className="text-xs text-gray-600"><span className="font-semibold text-gray-400">🇺🇸 </span>{noteTranslations.english}</div>
                          )}
                          {noteTranslations.detected !== 'traditional' && noteTranslations.traditional && (
                            <div className="text-xs text-gray-600"><span className="font-semibold text-gray-400">🇹🇼 </span>{noteTranslations.traditional}</div>
                          )}
                          {noteTranslations.detected !== 'simplified' && noteTranslations.simplified && (
                            <div className="text-xs text-gray-600"><span className="font-semibold text-gray-400">🇨🇳 </span>{noteTranslations.simplified}</div>
                          )}
                        </div>
                      )}

                      <div className="flex gap-2">
                        <button onClick={saveDetailNotes} disabled={savingDetailNotes || !noteAuthor || translatingNotes}
                          className="flex-1 px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white text-sm font-semibold rounded-xl disabled:opacity-50 transition-colors">
                          {savingDetailNotes ? 'Saving…' : translatingNotes ? '✨ Translating…' : '💾 Save Note'}
                        </button>
                        <button onClick={() => { setEditingNotes(false); setNoteTranslations(null) }}
                          className="px-4 py-2 text-gray-500 text-sm font-medium rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors">
                          Cancel
                        </button>
                      </div>
                    </div>

                  ) : (() => {
                    // Build combined notes list: ALWAYS include both legacy notes + notes_list (don't hide old notes)
                    const notesList: NoteEntry[] = [
                      // Legacy note first (if exists)
                      ...(detailAppt.notes ? [{ id: '__legacy__', text: detailAppt.notes, notes_english: detailAppt.notes_english, notes_chinese: detailAppt.notes_chinese, author: detailAppt.notes_author ?? 'Customer', created_at: detailAppt.notes_updated_at ?? detailAppt.appointment_date }] : []),
                      // Then all new notes from notes_list (exclude add-on entries — those show in pricing section)
                      ...(detailAppt.notes_list ?? []).filter(n => !n.is_addon),
                    ]

                    return notesList.length > 0 ? (
                      /* ── NOTE CARDS LIST ── */
                      <div className="space-y-2">
                        {notesList.map(note => (
                          <div key={note.id} className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                            {/* Card header */}
                            <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-100">
                              <div className="flex items-center gap-2">
                                <div className={`w-6 h-6 rounded-full ${avatarColor(note.author)} flex items-center justify-center text-white text-xs font-bold flex-shrink-0`}>
                                  {note.author[0].toUpperCase()}
                                </div>
                                <span className="text-sm font-semibold text-gray-700">{note.author}</span>
                                <span className="text-gray-300">·</span>
                                <span className="text-xs text-gray-400">
                                  {new Date(note.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                  {' · '}
                                  {new Date(note.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: SALON_TZ })}
                                </span>
                              </div>
                              <button
                                onClick={() => { if (confirm('Delete this note?')) deleteNote(note.id) }}
                                disabled={savingDetailNotes}
                                className="text-xs font-semibold text-red-400 hover:text-red-600 px-2.5 py-1 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
                              >🗑️</button>
                            </div>
                            {/* Note body */}
                            <div className="px-4 py-4 space-y-3">
                              <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap font-medium">{note.text}</p>
                              {(note.notes_english || note.notes_chinese) && (
                                <div className="border-t border-gray-100 pt-3 space-y-2">
                                  <div className="flex items-center justify-between">
                                    <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide">Translations</p>
                                    <button
                                      onClick={() => retranslateNote(note.id, note.text)}
                                      disabled={savingDetailNotes}
                                      className="text-xs text-sky-500 hover:text-sky-700 font-medium disabled:opacity-50"
                                      title="Re-translate this note"
                                    >🔄 Re-translate</button>
                                  </div>
                                  {note.notes_english && (
                                    <div className="flex gap-2 items-start">
                                      <span className="text-base leading-tight flex-shrink-0">🇺🇸</span>
                                      <p className="text-xs text-gray-600 leading-relaxed">{note.notes_english}</p>
                                    </div>
                                  )}
                                  {note.notes_chinese && (
                                    <div className="flex gap-2 items-start">
                                      <span className="text-base leading-tight flex-shrink-0">🇹🇼</span>
                                      <p className="text-xs text-gray-600 leading-relaxed">{note.notes_chinese}</p>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      /* ── EMPTY STATE ── */
                      <div className="bg-gray-50 rounded-2xl border-2 border-dashed border-gray-200 p-8 text-center">
                        <p className="text-3xl mb-2">📝</p>
                        <p className="text-sm font-semibold text-gray-500 mb-1">No notes yet</p>
                        <p className="text-xs text-gray-400 mb-4">Type in English or Chinese — AI will translate automatically</p>
                        <button
                          onClick={() => { if (noteTranslateTimerRef.current) clearTimeout(noteTranslateTimerRef.current); noteIsComposingRef.current = false; setEditingNotes(true); setDetailNotes(''); setNoteAuthor(staff.find(s => s.is_active)?.name ?? ''); setNoteTranslations(null) }}
                          className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white text-sm font-semibold rounded-xl transition-colors"
                        >+ Add Note</button>
                      </div>
                    )
                  })()}

                  {/* ── ADD NOTE button (always visible when not editing) ── */}
                  {!editingNotes && (
                    <button
                      onClick={() => { setEditingNotes(true); setDetailNotes(''); setNoteAuthor(staff.find(s => s.is_active)?.name ?? ''); setNoteTranslations(null) }}
                      className="w-full py-2.5 rounded-xl text-sm font-semibold border-2 border-dashed border-gray-200 text-gray-400 hover:border-sky-300 hover:text-sky-600 hover:bg-sky-50 transition-colors"
                    >+ Add Note</button>
                  )}
                </div>
              )}

            </div>

            {/* ── Sticky Footer: Reschedule (left) + Delete (right) — Appointment tab only ── */}
            {detailTab === 'appt' && <div className="border-t border-gray-100 bg-white px-4 py-3">
              {showRescheduleInputs ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <p className="text-xs text-gray-500 mb-1">New Date</p>
                      <input type="date" value={detailRescheduleDate}
                        onChange={e => setDetailRescheduleDate(e.target.value)}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 bg-white" />
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-1">New Time</p>
                      <select value={detailRescheduleTime}
                        onChange={e => setDetailRescheduleTime(e.target.value)}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 bg-white">
                        {TIME_OPTIONS.filter(t => {
                          const toMins = (s: string) => {
                            const upper = s.trim().toUpperCase()
                            const [time, period] = upper.split(' ')
                            const [hStr, mStr] = time.split(':')
                            let h = parseInt(hStr); const m = parseInt(mStr)
                            if (period === 'PM' && h !== 12) h += 12
                            if (period === 'AM' && h === 12) h = 0
                            return h * 60 + m
                          }
                          return toMins(t) >= toMins(openTime) && toMins(t) <= toMins(closeTime)
                        }).map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setShowRescheduleInputs(false)}
                      className="flex-1 py-2 text-sm font-semibold rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors">
                      Cancel
                    </button>
                    <button onClick={rescheduleAppointment}
                      disabled={savingReschedule || (detailRescheduleDate === detailAppt.appointment_date && detailRescheduleTime === detailAppt.appointment_time)}
                      className="flex-1 py-2 text-sm font-bold rounded-xl bg-amber-500 hover:bg-amber-600 text-white disabled:opacity-40 transition-colors">
                      {savingReschedule ? 'Saving…' : '✓ Confirm'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2">
                  <button onClick={() => { setShowRescheduleInputs(true); setDetailRescheduleDate(detailAppt.appointment_date); setDetailRescheduleTime(detailAppt.appointment_time) }}
                    className="flex-1 py-2.5 text-sm font-semibold rounded-xl border-2 border-amber-400 text-amber-600 hover:bg-amber-50 transition-colors">
                    📅 Reschedule
                  </button>
                  <button
                    onClick={() => {
                      if (confirm(`Delete ${detailAppt.pets?.name ?? 'this'}'s appointment on ${formatDate(detailAppt.appointment_date)}? This cannot be undone.`)) {
                        deleteAppointment(detailAppt.id)
                      }
                    }}
                    disabled={!!deletingApptId}
                    className="flex-1 py-2.5 text-sm font-semibold rounded-xl border-2 border-rose-300 text-rose-500 hover:bg-rose-50 disabled:opacity-50 transition-colors">
                    {deletingApptId === detailAppt.id ? '⏳…' : '🗑 Delete'}
                  </button>
                </div>
              )}
            </div>}

          </div>
        </>
      )}

      {/* ── Left Sidebar ─────────────────────────────────────────────────── */}
      {/* Mobile sidebar backdrop */}
      {!isBookMode && sidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-30 md:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {!isBookMode && <div className={`w-64 bg-sky-50 border-r border-sky-100 flex flex-col min-h-screen fixed left-0 top-0 bottom-0 z-40 transition-transform duration-300 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
        {/* Facility header */}
        <div className="px-4 py-4 border-b border-sky-100">
          <div className="flex items-center gap-3">
            <Image src="/logo.png" alt="Kokoni" width={40} height={40} className="rounded-full shrink-0" />
            <div className="min-w-0">
              <p className="text-sky-900 font-bold text-sm leading-tight truncate">Kokoni Pet Grooming Salon</p>
              <span className="text-xs bg-emerald-500 text-white px-2 py-0.5 rounded-full font-medium">Active</span>
            </div>
          </div>
        </div>

        {/* Nav items */}
        <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
          {NAV.filter(({ key }) => (!isBookMode || key === 'calendar') && (!allowedTabs || allowedTabs.includes(key))).map(({ key, label, icon }) => (
            key === 'settings' ? (
              <a key={key} href="/admin/settings"
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-left relative text-sky-600 hover:bg-sky-100 hover:text-sky-900`}
              >
                <span className="text-base leading-none w-5 text-center">{icon}</span>
                <span>{label}</span>
              </a>
            ) : (
            <button key={key} onClick={() => { setTab(key); setSidebarOpen(false) }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-left relative ${
                tab === key
                  ? 'bg-sky-200 text-sky-900'
                  : 'text-sky-600 hover:bg-sky-100 hover:text-sky-900'
              }`}
            >
              {tab === key && <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-sky-500 rounded-r-full" />}
              <span className="text-base leading-none w-5 text-center">{icon}</span>
              <span className="flex-1">{label}</span>
              {key === 'requests' && pendingCount > 0 && (
                <span className="bg-rose-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center">
                  {pendingCount}
                </span>
              )}
              {key === 'vaccines' && vaccineCount > 0 && (
                <span className="bg-rose-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center">
                  {vaccineCount}
                </span>
              )}
              {key === 'intake' && pendingCount > 0 && (
                <span className="bg-rose-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center">
                  {pendingCount}
                </span>
              )}
            </button>
            )
          ))}

          {/* Divider */}
          <div className="border-t border-sky-200 my-2" />

          {/* Kiosk link */}
          <a href="/kiosk" target="_blank" rel="noopener noreferrer"
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-sky-600 hover:bg-sky-100 hover:text-sky-900 transition-colors text-left"
            onClick={() => setSidebarOpen(false)}
          >
            <span className="text-base leading-none w-5 text-center">🖥️</span>
            <span className="flex-1">Kiosk Screen</span>
            <span className="text-sky-400 text-xs font-bold">↗</span>
          </a>

          {/* Front Desk launcher */}
          <a href="/front-desk" target="_blank" rel="noopener noreferrer"
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-sky-600 hover:bg-sky-100 hover:text-sky-900 transition-colors text-left"
            onClick={() => setSidebarOpen(false)}
          >
            <span className="text-base leading-none w-5 text-center">🏠</span>
            <span className="flex-1">Front Desk</span>
            <span className="text-sky-400 text-xs font-bold">↗</span>
          </a>

          {/* Chat — two-way SMS with customers */}
          <ChatSidebarLink onClick={() => setSidebarOpen(false)} />

          {/* Reviews — standalone page, gated by the 'reviews' permission key. */}
          {(!allowedTabs || allowedTabs.includes('reviews')) && (
          <a
            href="/admin/reviews"
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-sky-600 hover:bg-sky-100 hover:text-sky-900 transition-colors text-left"
            onClick={() => setSidebarOpen(false)}
          >
            <span className="text-base leading-none w-5 text-center">⭐</span>
            <span className="flex-1">Reviews</span>
          </a>
          )}

          {/* Time Tracking — standalone page, gated by the 'timesheet' permission key. */}
          {(!allowedTabs || allowedTabs.includes('timesheet')) && (
          <a
            href="/admin/timesheet"
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-sky-600 hover:bg-sky-100 hover:text-sky-900 transition-colors text-left"
            onClick={() => setSidebarOpen(false)}
          >
            <span className="text-base leading-none w-5 text-center">🕐</span>
            <span className="flex-1">Timesheet</span>
          </a>
          )}
          <a
            href="/clock"
            target="_blank"
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-sky-600 hover:bg-sky-100 hover:text-sky-900 transition-colors text-left"
            onClick={() => setSidebarOpen(false)}
          >
            <span className="text-base leading-none w-5 text-center">⏱️</span>
            <span className="flex-1">Clock Kiosk</span>
            <span className="text-sky-400 text-xs font-bold">↗</span>
          </a>
        </nav>

        {/* User footer */}
        <div className="px-4 py-3 border-t border-sky-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-sky-400 flex items-center justify-center text-white text-sm font-bold">{loggedInName.charAt(0).toUpperCase()}</div>
              <span className="text-sky-800 text-sm font-medium">{loggedInName}</span>
            </div>
            <button onClick={() => { clearAuth('admin'); setAuthed(false); router.push('/login') }}
              className="text-sky-400 hover:text-sky-700 text-xs">Sign out</button>
          </div>
        </div>
      </div>}

      {/* ── Main content ──────────────────────────────────────────────────── */}
      <div className={`${isBookMode ? '' : 'md:ml-64'} flex-1 flex flex-col min-h-screen`}>
        {/* Top bar */}
        <div className="bg-white border-b border-gray-200 px-4 md:px-6 flex items-center justify-between sticky top-0 z-30" style={{paddingTop: 'calc(env(safe-area-inset-top) + 12px)', paddingBottom: '12px'}}>
          <div className="flex items-center gap-3">
            {/* Hamburger — mobile only, hidden in book mode */}
            {!isBookMode && (
              <button
                className="md:hidden p-2 rounded-lg hover:bg-gray-100 text-gray-600 flex-shrink-0"
                onClick={() => setSidebarOpen(o => !o)}
                aria-label="Open menu"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
            )}
            {isBookMode && (
              <a href="/front-desk" className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 font-medium transition-colors">
                ← Back
              </a>
            )}
            <h1 className="font-bold text-gray-800 text-lg">
              {isBookMode ? '📅 Calendar' : (NAV.find(n => n.key === tab)?.label ?? tab)}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden md:block text-sm text-gray-400">{new Date().toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric',timeZone:'America/Los_Angeles'})}</span>
            {!isBookMode && <ChatIconButton />}
            {!isBookMode && (
              <a href="/admin" className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-600 px-3 py-1.5 rounded-full transition-colors font-medium">
                📱 Mobile View
              </a>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 p-3 md:p-6">

          {/* ── TODAY ──────────────────────────────────────────────────── */}
          {tab === 'today' && (
            <div>
              {/* Day navigator — step back through history with the same timeline detail */}
              {(() => {
                const todayStr = salonDayStr()
                const shift = (days: number) => { const d = new Date(todayViewDate + 'T12:00:00'); d.setDate(d.getDate() + days); setTodayViewDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`) }
                const isToday = todayViewDate === todayStr
                const label = new Date(todayViewDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
                return (
                  <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
                    <div className="flex items-center gap-2">
                      <button onClick={() => shift(-1)} className="w-9 h-9 flex items-center justify-center rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 text-lg">‹</button>
                      <div className="relative">
                        <span className="text-base font-bold text-gray-800">{isToday ? 'Today' : label}</span>
                        {!isToday && <span className="block text-[11px] text-gray-400 -mt-0.5">{label}</span>}
                        <input type="date" value={todayViewDate} max={todayStr}
                          onChange={e => e.target.value && setTodayViewDate(e.target.value)}
                          className="absolute inset-0 opacity-0 cursor-pointer w-full" title="Pick a date" />
                      </div>
                      <button onClick={() => shift(1)} disabled={isToday}
                        className="w-9 h-9 flex items-center justify-center rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 text-lg disabled:opacity-30 disabled:cursor-not-allowed">›</button>
                    </div>
                    {!isToday && (
                      <button onClick={() => setTodayViewDate(todayStr)}
                        className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-sky-600 text-white hover:bg-sky-700">Jump to Today</button>
                    )}
                  </div>
                )
              })()}
              {loading && <p className="text-gray-400 text-sm">Loading...</p>}
              {!loading && (
                <div className="space-y-4">
                  {/* Per-day recap — shown when browsing a past day */}
                  {todayViewDate !== salonDayStr() && (() => {
                    const groomed = appointments.filter(a => a.grooming_status === 'done' || a.status === 'completed').length
                    const paid = appointments.filter(a => a.payment_status === 'paid')
                    const revenue = paid.reduce((s, a) => s + parseFloat(a.payment_amount || '0'), 0)
                    const tips = paid.reduce((s, a) => s + parseFloat(a.tip_amount || '0'), 0)
                    const items = [
                      { label: 'Pets Groomed', value: String(groomed), color: 'text-gray-800' },
                      { label: 'Revenue', value: `$${revenue.toFixed(2)}`, color: 'text-emerald-600' },
                      { label: 'Tips', value: `$${tips.toFixed(2)}`, color: 'text-emerald-500' },
                      { label: 'Appointments', value: String(appointments.length), color: 'text-gray-800' },
                    ]
                    return (
                      <div className="rounded-2xl border border-gray-200 bg-white px-4 py-3 grid grid-cols-2 md:grid-cols-4 gap-3">
                        {items.map(it => (
                          <div key={it.label}>
                            <p className={`text-2xl font-bold ${it.color}`}>{it.value}</p>
                            <p className="text-xs font-medium text-gray-400 mt-0.5">{it.label}</p>
                          </div>
                        ))}
                      </div>
                    )
                  })()}
                  {/* Stats row */}
                  {(() => {
                    const nowMs = Date.now()
                    const isOverdue = (a: Appointment) => !a.grooming_status && parseApptTime(a.appointment_date, a.appointment_time).getTime() < nowMs - 5 * 60000
                    const lateCount    = appointments.filter(isOverdue).length
                    const comingCount  = appointments.filter(a => !a.grooming_status && !isOverdue(a)).length + lateCount
                    const inSalonCount = appointments.filter(a => a.grooming_status === 'waiting' || a.grooming_status === 'incare' || a.grooming_status === 'ready').length
                    const doneCount    = appointments.filter(a => a.grooming_status === 'done' || a.status === 'completed').length
                    return (
                      <>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
                          {[
                            { label:'Coming',   value: comingCount,  color:'bg-sky-50 text-sky-700 border-sky-100' },
                            { label:'Late',     value: lateCount,    color: lateCount > 0 ? 'bg-red-50 text-red-700 border-red-100' : 'bg-gray-50 text-gray-400 border-gray-100' },
                            { label:'In Salon', value: inSalonCount, color:'bg-amber-50 text-amber-700 border-amber-100' },
                            { label:'Done',     value: doneCount,    color:'bg-emerald-50 text-emerald-700 border-emerald-100' },
                          ].map(s => (
                            <div key={s.label} className={`rounded-2xl border p-4 ${s.color}`}>
                              <p className="text-3xl font-bold">{s.value}</p>
                              <p className="text-sm font-medium mt-1">{s.label}</p>
                            </div>
                          ))}
                        </div>

                        {/* View toggle */}
                        <div className="flex items-center justify-end gap-2">
                          <span className="text-xs text-gray-400">View by:</span>
                          <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs font-semibold">
                            <button onClick={() => setTodayGroupByStaff(false)}
                              className={`px-3 py-1.5 transition-colors ${!todayGroupByStaff ? 'bg-sky-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>
                              Time
                            </button>
                            <button onClick={() => setTodayGroupByStaff(true)}
                              className={`px-3 py-1.5 transition-colors ${todayGroupByStaff ? 'bg-sky-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>
                              Staff
                            </button>
                          </div>
                        </div>

                        {/* Appointment table */}
                        {(() => {
                          const GRID = '90px 1fr 110px 90px 230px 90px'

                          const fmtTs = (iso: string | null) => {
                            if (!iso) return null
                            return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: SALON_TZ })
                          }

                          const ApptRow = ({ appt, showNoShow, showReschedule }: { appt: Appointment; showNoShow?: boolean; showReschedule?: boolean }) => {
                            const gs = appt.grooming_status
                            const isDone   = gs === 'done' || appt.status === 'completed'
                            const isInCare = gs === 'incare'
                            const isReady  = gs === 'ready'

                            const rowBg = isDone
                              ? 'opacity-60 hover:opacity-90 hover:bg-gray-50/60'
                              : isInCare ? 'bg-sky-50/30 hover:bg-sky-50/50'
                              : isReady  ? 'bg-green-50/20 hover:bg-green-50/40'
                              : 'hover:bg-gray-50/60'

                            const gsPill = gs === 'waiting'
                              ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-md mt-1">⏳ Waiting</span>
                              : gs === 'incare'
                              ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-sky-700 bg-sky-100 border border-sky-200 px-1.5 py-0.5 rounded-md mt-1">✂️ In Care</span>
                              : gs === 'ready'
                              ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-700 bg-green-50 border border-green-200 px-1.5 py-0.5 rounded-md mt-1">🔔 Ready</span>
                              : gs === 'done'
                              ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-pink-600 bg-pink-50 border border-pink-100 px-1.5 py-0.5 rounded-md mt-1">🎉 Done</span>
                              : <span className={`text-xs px-1.5 py-0.5 rounded-md mt-1 inline-block ${STATUS_COLORS[appt.status] ?? 'bg-gray-100 text-gray-500'}`}>{appt.status.replace('_',' ')}</span>

                            let lateBadge: ReactNode = null
                            if (appt.checked_in_at) {
                              const scheduled = parseApptTime(appt.appointment_date, appt.appointment_time)
                              const actual    = new Date(appt.checked_in_at)
                              const diff      = Math.round((actual.getTime() - scheduled.getTime()) / 60000)
                              lateBadge = diff > 5
                                ? <span className="text-xs font-bold text-red-500 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded-md">Late: {diff} min</span>
                                : <span className="text-xs font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-md">On time ✓</span>
                            }

                            let groomTime: ReactNode = <span className="text-xs text-gray-300 italic">—</span>
                            if (appt.grooming_started_at && appt.grooming_finished_at) {
                              const mins = Math.round((new Date(appt.grooming_finished_at).getTime() - new Date(appt.grooming_started_at).getTime()) / 60000)
                              const h = Math.floor(mins / 60); const m = mins % 60
                              const label = h > 0 ? `${h}h${m > 0 ? ` ${m}m` : ''}` : `${m} min`
                              groomTime = <div><p className="text-sm font-bold text-green-600">{label}</p><p className="text-xs text-green-400">total groom</p></div>
                            } else if (appt.grooming_started_at && isInCare) {
                              const mins = Math.round((Date.now() - new Date(appt.grooming_started_at).getTime()) / 60000)
                              groomTime = <div><p className="text-sm font-bold text-sky-600">{mins} min</p><p className="text-xs text-sky-400">in progress</p></div>
                            }

                            const hasNotes = !!(appt.notes_list?.length || appt.notes || appt.notes_english)

                            const TimeLine = ({ label, time, colorClass, suffix, fallback }: { label: string; time: string | null; colorClass?: string; suffix?: string; fallback?: string }) => (
                              <div className="flex items-center gap-2">
                                <span className="w-20 text-xs text-gray-400 flex-shrink-0">{label}</span>
                                {time
                                  ? <span className={`text-xs font-semibold px-2 py-0.5 rounded-md ${colorClass ?? (isDone ? 'text-gray-500 bg-gray-100' : 'text-gray-700 bg-gray-100')}`}>{time}{suffix ?? ''}</span>
                                  : <span className="text-xs text-gray-300 italic">— {fallback ?? 'not yet'}</span>}
                              </div>
                            )

                            return (
                              <div
                                onClick={() => openApptDetail(appt)}
                                className={`px-5 py-4 border-b border-gray-50 grid items-start gap-3 cursor-pointer transition-all ${rowBg}`}
                                style={{ gridTemplateColumns: GRID }}
                              >
                                {/* Appt time + status */}
                                <div>
                                  <p className={`text-sm font-bold ${isDone ? 'text-gray-400' : isInCare ? 'text-sky-700' : 'text-gray-800'}`}>
                                    {appt.appointment_time}
                                  </p>
                                  {gsPill}
                                </div>

                                {/* Pet / Owner */}
                                <div className="flex items-center gap-2">
                                  {appt.pets?.photo_url
                                    ? <img src={appt.pets.photo_url} className="w-9 h-9 rounded-full object-cover flex-shrink-0" alt="" />
                                    : <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-base flex-shrink-0">🐶</div>}
                                  <div>
                                    <p className="text-sm font-semibold text-gray-800">
                                      {appt.pets?.name ?? '—'}
                                      {hasNotes && <span className="ml-1.5 text-xs bg-amber-100 text-amber-700 font-semibold px-1.5 py-0.5 rounded-md">📝</span>}
                                    </p>
                                    <p className="text-xs text-gray-400">{firstName(appt.clients?.name)} · {appt.client_phone}</p>
                                  </div>
                                </div>

                                {/* Service */}
                                <span className={`text-sm ${isDone ? 'text-gray-400' : 'text-gray-600'}`}>
                                  {serviceMap[appt.service] ?? appt.service}
                                </span>

                                {/* Staff */}
                                <div className={`text-xs space-y-0.5 ${isDone ? 'text-gray-400' : 'text-gray-500'}`}>
                                  {appt.assigned_groomer && <p>✂️ {firstName(appt.assigned_groomer)}</p>}
                                  {appt.assigned_bather  && <p>🛁 {firstName(appt.assigned_bather)}</p>}
                                  {!appt.assigned_groomer && !appt.assigned_bather && <p className="text-gray-300">—</p>}
                                </div>

                                {/* Timeline */}
                                <div className="flex flex-col gap-1.5">
                                  <div className="flex items-center gap-2">
                                    <span className="w-20 text-xs text-gray-400 flex-shrink-0">Check-in</span>
                                    {appt.checked_in_at
                                      ? <><span className={`text-xs font-semibold px-2 py-0.5 rounded-md ${isDone ? 'text-gray-500 bg-gray-100' : 'text-gray-700 bg-gray-100'}`}>{fmtTs(appt.checked_in_at)}</span>{lateBadge}</>
                                      : <span className="text-xs text-gray-300 italic">— not yet</span>}
                                  </div>
                                  <TimeLine label="Started"     time={fmtTs(appt.grooming_started_at)}  colorClass={isDone ? 'text-gray-500 bg-gray-100' : 'text-sky-700 bg-sky-50'} />
                                  <TimeLine label="Finished"    time={fmtTs(appt.grooming_finished_at)} colorClass={isDone ? 'text-gray-500 bg-gray-100' : 'text-green-700 bg-green-50'} fallback={isInCare ? 'in progress' : 'not yet'} />
                                  {appt.clients?.sms_consent === false ? (
                                    <div className="flex items-center gap-2">
                                      <span className="w-20 text-xs text-gray-400 flex-shrink-0">Msg sent</span>
                                      <span className="text-xs font-semibold px-2 py-0.5 rounded-md text-amber-700 bg-amber-50" title="Client has not opted in to SMS (sms_consent = false) — no message was sent, regardless of owner_notified_at">
                                        ⚠ no consent — not sent
                                      </span>
                                    </div>
                                  ) : (
                                    <TimeLine label="Msg sent"    time={fmtTs(appt.owner_notified_at)}    colorClass={isDone ? 'text-gray-500 bg-gray-100' : 'text-emerald-700 bg-emerald-50'} suffix=" ✓" />
                                  )}
                                  <TimeLine label="Checked out" time={fmtTs(appt.checked_out_at)}       colorClass="text-pink-500 bg-pink-50" suffix=" ✓" fallback={isReady ? 'waiting' : 'not yet'} />
                                </div>

                                {/* Groom Time / No-Show / Reschedule actions */}
                                <div>
                                  {groomTime}
                                  {(showNoShow || showReschedule) && (
                                    <div className="flex flex-wrap gap-1.5 mt-2" onClick={e => e.stopPropagation()}>
                                      {showReschedule && (
                                        <button
                                          onClick={() => { setInlineRescheduleAppt(appt); setInlineRescheduleDate(''); setInlineRescheduleTime(''); setInlineRescheduleSlots([]) }}
                                          className="flex-1 py-1.5 text-xs font-semibold rounded-lg bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 transition-colors"
                                        >
                                          🔄 Reschedule
                                        </button>
                                      )}
                                      {showNoShow && (
                                        <>
                                          <button
                                            onClick={() => handleAction(appt.id, 'cancel-today')}
                                            disabled={actionLoading !== null}
                                            className="flex-1 py-1.5 text-xs font-semibold rounded-lg bg-gray-100 text-gray-600 border border-gray-200 disabled:opacity-50 hover:bg-gray-200 transition-colors"
                                          >
                                            ✕ Cancel
                                          </button>
                                          <button
                                            onClick={() => handleAction(appt.id, 'no-show')}
                                            disabled={actionLoading !== null}
                                            className="flex-1 py-1.5 text-xs font-semibold rounded-lg bg-rose-50 text-rose-600 border border-rose-200 disabled:opacity-50 hover:bg-rose-100 transition-colors"
                                          >
                                            👻 No Show
                                          </button>
                                        </>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </div>
                            )
                          }

                          const tableHeader = (
                            <div
                              className="px-5 py-3 border-b border-gray-100 bg-gray-50 grid text-xs font-semibold text-gray-500 uppercase tracking-wide gap-3"
                              style={{ gridTemplateColumns: GRID }}
                            >
                              <span>Appt</span><span>Pet / Owner</span><span>Service</span><span>Staff</span><span>Timeline</span><span>Groom Time</span>
                            </div>
                          )

                          if (!todayGroupByStaff) {
                            // Section dividers
                            const nowMs2 = Date.now()
                            const isOverdue2 = (a: Appointment) =>
                              !a.grooming_status && parseApptTime(a.appointment_date, a.appointment_time).getTime() < nowMs2 - 5 * 60000
                            const isVeryOverdue2 = (a: Appointment) =>
                              !a.grooming_status && parseApptTime(a.appointment_date, a.appointment_time).getTime() < nowMs2 - 15 * 60000
                            const byTime = (a: Appointment, b: Appointment) =>
                              parseApptTime(a.appointment_date, a.appointment_time).getTime() -
                              parseApptTime(b.appointment_date, b.appointment_time).getTime()

                            const sectionedGroups: { label: string; emoji: string; color: string; items: Appointment[] }[] = [
                              {
                                label: 'Late',
                                emoji: '🔴',
                                color: 'bg-red-50 border-red-100 text-red-700',
                                items: appointments.filter(a => isOverdue2(a)).sort(byTime),
                              },
                              {
                                label: 'Checked In',
                                emoji: '⏳',
                                color: 'bg-amber-50 border-amber-100 text-amber-700',
                                items: appointments.filter(a => a.grooming_status === 'waiting').sort(byTime),
                              },
                              {
                                label: 'Working',
                                emoji: '✂️',
                                color: 'bg-sky-50 border-sky-100 text-sky-700',
                                items: appointments.filter(a => a.grooming_status === 'incare').sort(byTime),
                              },
                              {
                                label: 'Ready',
                                emoji: '🔔',
                                color: 'bg-green-50 border-green-100 text-green-700',
                                items: appointments.filter(a => a.grooming_status === 'ready').sort(byTime),
                              },
                              {
                                label: 'Coming Up',
                                emoji: '📅',
                                color: 'bg-gray-50 border-gray-100 text-gray-500',
                                items: appointments.filter(a => !a.grooming_status && !isOverdue2(a)).sort(byTime),
                              },
                              {
                                label: 'Done',
                                emoji: '🎉',
                                color: 'bg-emerald-50 border-emerald-100 text-emerald-700',
                                items: appointments.filter(a => a.grooming_status === 'done' || (!a.grooming_status && a.status === 'completed')).sort(byTime),
                              },
                            ].filter(g => g.items.length > 0)

                            if (appointments.length === 0) {
                              return (
                                <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                                  <div className="py-16 text-center text-gray-400">No appointments today</div>
                                </div>
                              )
                            }

                            return (
                              <div className="space-y-4">
                                {sectionedGroups.map(group => (
                                  <div key={group.label} className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                                    <div className={`px-5 py-2.5 border-b flex items-center gap-2 ${group.color}`}>
                                      <span className="text-sm font-bold">{group.emoji} {group.label}</span>
                                      <span className="text-xs font-medium opacity-70">{group.items.length} appt{group.items.length !== 1 ? 's' : ''}</span>
                                    </div>
                                    <div className="overflow-x-auto"><div className="min-w-[600px]">
                                      {tableHeader}
                                      {group.items.map(appt => <ApptRow key={appt.id} appt={appt} showNoShow={group.label === 'Late' && isVeryOverdue2(appt)} showReschedule={group.label === 'Late'} />)}
                                    </div></div>
                                  </div>
                                ))}
                              </div>
                            )
                          }

                          // Group by staff
                          const byTime = (a: Appointment, b: Appointment) =>
                            parseApptTime(a.appointment_date, a.appointment_time).getTime() -
                            parseApptTime(b.appointment_date, b.appointment_time).getTime()
                          const staffMap: Record<string, Appointment[]> = {}
                          appointments.forEach(a => {
                            const key = a.assigned_groomer || a.assigned_bather || '— Unassigned'
                            if (!staffMap[key]) staffMap[key] = []
                            staffMap[key].push(a)
                          })
                          const staffKeys = Object.keys(staffMap).sort((a, b) =>
                            a === '— Unassigned' ? 1 : b === '— Unassigned' ? -1 : a.localeCompare(b)
                          )
                          return (
                            <div className="space-y-4">
                              {staffKeys.map(staff => (
                                <div key={staff} className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                                  <div className="px-5 py-2.5 bg-sky-50 border-b border-sky-100 flex items-center gap-2">
                                    <span className="text-sm font-bold text-sky-700">
                                      {staff === '— Unassigned' ? '— Unassigned' : `✂️ ${firstName(staff)}`}
                                    </span>
                                    <span className="text-xs text-sky-400 font-medium">{staffMap[staff].length} appt{staffMap[staff].length !== 1 ? 's' : ''}</span>
                                  </div>
                                  <div className="overflow-x-auto"><div className="min-w-[600px]">
                                    {tableHeader}
                                    {staffMap[staff].sort(byTime).map(appt => <ApptRow key={appt.id} appt={appt} />)}
                                  </div></div>
                                </div>
                              ))}
                            </div>
                          )
                        })()}
                      </>
                    )
                  })()}
                </div>
              )}
            </div>
          )}

          {/* ── GROOMING BOARD ─────────────────────────────────────────── */}
          {tab === 'grooming' && (() => {
            const GSTAGES = [
              { id: 'waiting', label: 'Waiting',          icon: '⏳', bg: 'bg-amber-50',  border: 'border-amber-200', text: 'text-amber-700',  badge: 'bg-amber-400',  btn: 'bg-amber-500 hover:bg-amber-600',  next: 'Start Grooming →' },
              { id: 'incare',  label: 'In Good Hands 🐾', icon: '✂️', bg: 'bg-sky-50',    border: 'border-sky-200',   text: 'text-sky-700',    badge: 'bg-sky-500',    btn: 'bg-sky-500 hover:bg-sky-600',      next: 'Mark Ready →' },
              { id: 'ready',   label: 'Ready to Pick Up', icon: '🔔', bg: 'bg-green-50',  border: 'border-green-200', text: 'text-green-700',  badge: 'bg-green-500',  btn: 'bg-green-500 hover:bg-green-600',  next: 'Check Out' },
              { id: 'done',    label: 'Checked Out',      icon: '🎉', bg: 'bg-pink-50',   border: 'border-pink-200',  text: 'text-pink-700',   badge: 'bg-pink-500',   btn: '',                                 next: '' },
            ]
            const stageOrder = ['waiting','incare','ready','done']

            const advanceGrooming = async (appt: Appointment) => {
              const cur = appt.grooming_status || 'waiting'
              const idx = stageOrder.indexOf(cur)
              if (idx >= 3) return
              const next = stageOrder[idx + 1]
              setGroomingUpdating(appt.id)
              try {
                await fetch(`/api/admin/appointments/${appt.id}`, {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ action: 'grooming-status', grooming_status: next }),
                })
                setGroomingAppts(prev => prev.map(a => a.id === appt.id ? { ...a, grooming_status: next, grooming_status_updated_at: new Date().toISOString() } : a))
                if (next === 'ready') {
                  setGroomingSmsAlert(`📱 Text sent — ${appt.pets?.name ?? 'Pet'} is ready!`)
                  setTimeout(() => setGroomingSmsAlert(null), 4000)
                }
                if (next === 'done') {
                  setGroomingCelebrate({ ...appt, grooming_status: 'done' })
                  setTimeout(() => setGroomingCelebrate(null), 7000)
                }
              } catch { showToast('Update failed') }
              setGroomingUpdating(null)
            }

            const undoGrooming = async (appt: Appointment) => {
              const cur = appt.grooming_status || 'waiting'
              const idx = stageOrder.indexOf(cur)
              if (idx <= 0) return
              const prev = stageOrder[idx - 1]
              setGroomingUpdating(appt.id)
              try {
                await fetch(`/api/admin/appointments/${appt.id}`, {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ action: 'grooming-status', grooming_status: prev }),
                })
                setGroomingAppts(p => p.map(a => a.id === appt.id ? { ...a, grooming_status: prev } : a))
              } catch { showToast('Update failed') }
              setGroomingUpdating(null)
            }

            // Group by stage
            const byStage: Record<string, Appointment[]> = {}
            stageOrder.forEach(s => { byStage[s] = [] })
            groomingAppts.forEach(a => {
              const s = a.grooming_status || 'waiting'
              if (byStage[s]) byStage[s].push(a)
            })

            return (
              <div>
                {/* Header */}
                <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                  <div className="flex items-center gap-3">
                    <h2 className="text-lg font-bold text-gray-800">Grooming Board</h2>
                    <div className="flex items-center gap-1.5 bg-green-50 border border-green-200 rounded-full px-2.5 py-1">
                      <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse inline-block" />
                      <span className="text-xs font-bold text-green-700">Live · auto-refresh</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
                      {(['list','board'] as const).map(v => (
                        <button key={v} onClick={() => setGroomingView(v)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${groomingView===v ? 'bg-white shadow text-violet-700' : 'text-gray-400 hover:text-gray-600'}`}>
                          {v === 'list' ? '📋 List' : '📊 Board'}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* SMS toast */}
                {groomingSmsAlert && (
                  <div className="mb-3 bg-green-600 text-white rounded-2xl px-4 py-3 flex items-center gap-3 text-sm font-semibold shadow-lg">
                    <span className="text-xl">📱</span>{groomingSmsAlert}
                  </div>
                )}

                {/* Celebration overlay */}
                {groomingCelebrate && (
                  <div className="fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden"
                    style={{background:'linear-gradient(135deg,#ec4899,#8b5cf6,#3b82f6,#ec4899)',backgroundSize:'300% 300%',animation:'gradShift 3s ease infinite'}}
                    onClick={() => setGroomingCelebrate(null)}>
                    <style>{`@keyframes gradShift{0%{background-position:0% 50%}50%{background-position:100% 50%}100%{background-position:0% 50%}}`}</style>
                    <div className="text-center px-8">
                      {groomingCelebrate.pets?.photo_url
                        ? <img src={groomingCelebrate.pets.photo_url} className="w-36 h-36 rounded-[32px] object-cover border-4 border-white shadow-2xl mx-auto mb-6" alt="" />
                        : <div className="w-36 h-36 rounded-[32px] bg-white/20 flex items-center justify-center text-7xl mx-auto mb-6">🐾</div>
                      }
                      <h1 className="text-7xl font-black text-white mb-2 drop-shadow-2xl">{groomingCelebrate.pets?.name ?? 'Done!'}</h1>
                      <p className="text-2xl font-bold text-white/90 mb-2">is going home! 🏠</p>
                      <p className="text-base text-white/60">See you next time, {groomingCelebrate.clients?.name}! 💜</p>
                    </div>
                    <p className="absolute bottom-8 text-white/50 text-sm">Tap anywhere to close</p>
                  </div>
                )}

                {/* Stage summary pills */}
                <div className="flex items-center gap-1 mb-4 overflow-x-auto pb-1 flex-wrap">
                  {GSTAGES.map((s, i) => (
                    <div key={s.id} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg ${s.bg} border ${s.border} whitespace-nowrap`}>
                      <span className="text-sm">{s.icon}</span>
                      <span className={`text-xs font-bold ${s.text}`}>{s.label}</span>
                      <span className={`text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center text-white ${s.badge}`}>
                        {byStage[s.id]?.length ?? 0}
                      </span>
                    </div>
                  ))}
                </div>

                {groomingLoading && <p className="text-gray-400 text-sm">Loading...</p>}

                {/* ── LIST VIEW ── */}
                {!groomingLoading && groomingView === 'list' && (
                  <div className="space-y-3">
                    {groomingAppts.length === 0 && (
                      <p className="text-gray-400 text-sm text-center py-8">No appointments today</p>
                    )}
                    {groomingAppts.map(appt => {
                      const gs = appt.grooming_status || 'waiting'
                      const si = stageOrder.indexOf(gs)
                      const stage = GSTAGES[si] || GSTAGES[0]
                      const isDone = gs === 'done'
                      const isUpdating = groomingUpdating === appt.id
                      return (
                        <div key={appt.id} className={`bg-white rounded-2xl border-2 ${stage.border} shadow-sm overflow-hidden`}>
                          <div className="flex items-start gap-3 p-4">
                            {/* Pet photo */}
                            <div className="relative flex-shrink-0">
                              {appt.pets?.photo_url
                                ? <img src={appt.pets.photo_url} className="w-16 h-16 rounded-2xl object-cover border-2 border-white shadow" alt="" />
                                : <div className={`w-16 h-16 rounded-2xl flex items-center justify-center text-3xl ${stage.bg}`}>🐾</div>
                              }
                              <span className={`absolute -bottom-1 -right-1 w-6 h-6 rounded-full ${stage.badge} flex items-center justify-center text-xs border-2 border-white`}>
                                {stage.icon.replace(/\uFE0F/g,'')}
                              </span>
                            </div>
                            {/* Info */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-baseline gap-2 flex-wrap">
                                <span className="text-lg font-black text-gray-800">{appt.pets?.name ?? '—'}</span>
                                <span className="text-sm text-gray-400">{appt.clients?.name}</span>
                              </div>
                              <p className="text-xs text-gray-500 mb-2">{serviceMap[appt.service] ?? appt.service} · {appt.appointment_time}</p>
                              <div className="flex gap-1.5 flex-wrap mb-2">
                                {appt.assigned_groomer && (
                                  <span className="text-xs font-bold bg-violet-50 border border-violet-100 text-violet-700 px-2 py-0.5 rounded-lg">✂️ {firstName(appt.assigned_groomer)}</span>
                                )}
                                {appt.assigned_bather && (
                                  <span className="text-xs font-bold bg-sky-50 border border-sky-100 text-sky-700 px-2 py-0.5 rounded-lg">🛁 {firstName(appt.assigned_bather)}</span>
                                )}
                              </div>
                              {/* Stage + grooming duration */}
                              <div className="flex items-center gap-2 flex-wrap">
                                <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold ${stage.bg} border ${stage.border} ${stage.text}`}>
                                  {stage.icon} {stage.label}
                                  {appt.grooming_status_updated_at && (
                                    <span className="text-xs opacity-60 ml-1">
                                      since {new Date(appt.grooming_status_updated_at).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',timeZone:SALON_TZ})}
                                    </span>
                                  )}
                                </div>
                                {appt.grooming_started_at && (() => {
                                  const dur = groomingDuration(appt.grooming_started_at, appt.grooming_finished_at)
                                  return dur ? (
                                    <span className="text-xs font-semibold text-sky-600 bg-sky-50 border border-sky-100 px-2 py-0.5 rounded-lg">
                                      ✂️ {gs === 'done' ? `took ${dur}` : `${dur}`}
                                    </span>
                                  ) : null
                                })()}
                              </div>
                            </div>
                            {/* Actions */}
                            <div className="flex flex-col gap-1.5 flex-shrink-0 items-end">
                              {isDone ? (
                                <span className="text-xs font-bold text-pink-600 px-3 py-2 bg-pink-50 border border-pink-200 rounded-xl">🎉 Gone home!</span>
                              ) : (
                                <button
                                  disabled={isUpdating}
                                  onClick={() => advanceGrooming(appt)}
                                  className={`${stage.btn} text-white font-bold px-3 py-2 rounded-xl text-xs shadow-sm disabled:opacity-50 whitespace-nowrap`}>
                                  {isUpdating ? '…' : stage.next}
                                </button>
                              )}
                              {si > 0 && !isDone && (
                                <button disabled={isUpdating} onClick={() => undoGrooming(appt)}
                                  className="text-xs text-gray-400 font-semibold px-2.5 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50">
                                  ← Undo
                                </button>
                              )}
                            </div>
                          </div>
                          {/* Progress bar */}
                          <div className="h-1.5 bg-gray-100">
                            <div className={`h-full ${stage.badge} transition-all duration-700`} style={{width:`${((si+1)/4)*100}%`}} />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* ── BOARD VIEW ── */}
                {!groomingLoading && groomingView === 'board' && (
                  <div className="overflow-x-auto -mx-2">
                    <div className="flex gap-3 min-w-max px-2 pb-4">
                      {GSTAGES.map((stage, si) => {
                        const stageDogs = byStage[stage.id] || []
                        return (
                          <div key={stage.id} className="w-52 flex-shrink-0">
                            <div className={`rounded-2xl px-3 py-2.5 mb-2 border-2 ${stage.bg} ${stage.border}`}>
                              <div className="flex items-center justify-between">
                                <span className="text-base">{stage.icon}</span>
                                <span className={`text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center text-white ${stage.badge}`}>{stageDogs.length}</span>
                              </div>
                              <p className={`text-xs font-black mt-0.5 ${stage.text}`}>{stage.label}</p>
                            </div>
                            <div className="space-y-2">
                              {stageDogs.map(appt => (
                                <div key={appt.id} className={`bg-white rounded-2xl border-2 ${stage.border} p-3 shadow-sm`}>
                                  <div className="flex items-center gap-2 mb-2">
                                    {appt.pets?.photo_url
                                      ? <img src={appt.pets.photo_url} className="w-10 h-10 rounded-xl object-cover flex-shrink-0" alt="" />
                                      : <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl ${stage.bg} flex-shrink-0`}>🐾</div>
                                    }
                                    <div className="min-w-0">
                                      <p className="font-black text-sm text-gray-800 truncate">{appt.pets?.name ?? '—'}</p>
                                      <p className="text-xs text-gray-400 truncate">{appt.appointment_time} · {appt.clients?.name}</p>
                                    </div>
                                  </div>
                                  <p className="text-xs text-gray-500 bg-gray-50 px-2 py-1 rounded-lg mb-2">{serviceMap[appt.service] ?? appt.service}</p>
                                  {(appt.assigned_groomer || appt.assigned_bather) && (
                                    <div className="flex gap-1 mb-2 flex-wrap">
                                      {appt.assigned_groomer && <span className="text-xs font-bold text-violet-600">✂️{firstName(appt.assigned_groomer)}</span>}
                                      {appt.assigned_bather && <span className="text-xs font-bold text-sky-600 ml-1">🛁{firstName(appt.assigned_bather)}</span>}
                                    </div>
                                  )}
                                  {si < 4 ? (
                                    <div className="flex gap-1">
                                      {si > 0 && (
                                        <button disabled={groomingUpdating===appt.id} onClick={() => undoGrooming(appt)}
                                          className="flex-none text-xs text-gray-400 font-bold py-1.5 px-2 rounded-lg border border-gray-200 hover:bg-gray-50">←</button>
                                      )}
                                      <button disabled={groomingUpdating===appt.id} onClick={() => advanceGrooming(appt)}
                                        className={`flex-1 ${stage.btn} text-white text-xs font-bold py-2 rounded-xl shadow-sm disabled:opacity-50`}>
                                        {groomingUpdating===appt.id ? '…' : si===3 ? 'Check Out' : 'Next →'}
                                      </button>
                                    </div>
                                  ) : (
                                    <div className="text-center text-xs font-bold text-pink-600 py-1.5 bg-pink-50 rounded-xl border border-pink-200">🎉 Gone home!</div>
                                  )}
                                </div>
                              ))}
                              {stageDogs.length === 0 && (
                                <div className={`border-2 border-dashed ${stage.border} rounded-2xl py-8 text-center`}>
                                  <p className="text-xs text-gray-300">Empty</p>
                                </div>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            )
          })()}

          {/* ── CHECK OUT ─────────────────────────────────────────────────── */}
          {tab === 'checkout' && (
            <div>
              <p className="text-sm text-gray-500 mb-4">Mark appointments complete and record payment for today&apos;s finished appointments.</p>
              {loading && <p className="text-gray-400 text-sm">Loading...</p>}
              {!loading && (
                <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                  <div className="overflow-x-auto"><div className="min-w-[500px]">
                  <div className="px-5 py-3 border-b border-gray-100 bg-gray-50 grid grid-cols-5 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    <span>Pet</span><span>Owner</span><span>Service</span><span>Time</span><span>Action</span>
                  </div>
                  {appointments.filter(a => a.status==='in_progress'||a.status==='completed').length === 0 && (
                    <div className="py-12 text-center text-gray-400 text-sm">No appointments ready for checkout</div>
                  )}
                  {appointments.filter(a => a.status==='in_progress'||a.status==='completed').map(appt => (
                    <div key={appt.id} className="px-5 py-3 border-b border-gray-50 grid grid-cols-5 items-center">
                      <div className="flex items-center gap-2">
                        {appt.pets?.photo_url
                          ? <img src={appt.pets.photo_url} className="w-8 h-8 rounded-full object-cover" alt="" />
                          : <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-sm">🐶</div>}
                        <span className="text-sm font-medium">{appt.pets?.name}</span>
                      </div>
                      <span className="text-sm text-gray-600">{appt.clients?.name}</span>
                      <span className="text-sm text-gray-500">{serviceMap[appt.service] ?? appt.service}</span>
                      <span className="text-sm text-gray-500">{appt.appointment_time}</span>
                      <div>
                        {appt.status==='in_progress' ? (
                          <button onClick={() => handleAction(appt.id,'complete')} disabled={actionLoading!==null}
                            className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-all text-white ${isActionLoading(appt.id+'complete') ? 'bg-emerald-600' : 'bg-emerald-500 hover:bg-emerald-600'}`}>
                            {getButtonText('✓ Check Out', appt.id+'complete', actionLoading!==null)}
                          </button>
                        ) : (
                          <span className="text-xs bg-gray-100 text-gray-500 px-3 py-1.5 rounded-lg font-medium">Checked Out ✓</span>
                        )}
                      </div>
                    </div>
                  ))}
                  </div></div>{/* end min-w / overflow-x-auto */}
                </div>
              )}
            </div>
          )}

          {/* ── SCHEDULE REQUESTS ─────────────────────────────────────────── */}
          {tab === 'requests' && (() => {
            const pendingAppts = appointments.filter(a => a.status === 'pending')
            const rescheduledAppts = appointments.filter(a => a.status === 'rescheduled')
            // Confirmed but no groomer/bather assigned yet
            const needsGroomerAppts = appointments.filter(a => a.status === 'confirmed' && !a.assigned_groomer && !a.assigned_bather)
            // Confirmed + staff assigned + groomer NOT yet confirmed → needs groomer to confirm
            const awaitingGroomerAppts = appointments.filter(a =>
              a.status === 'confirmed' && (a.assigned_groomer || a.assigned_bather) && !a.groomer_confirmed
            )
            // Confirmed + groomer confirmed → show only within 48 hrs of appointment
            const fullyConfirmedAppts = appointments.filter(a => {
              if (a.status !== 'confirmed') return false
              if (!a.assigned_groomer && !a.assigned_bather) return false
              if (!a.groomer_confirmed) return false
              const apptTime = parseApptTime(a.appointment_date, a.appointment_time)
              const hoursUntil = (apptTime.getTime() - Date.now()) / 3600000
              return hoursUntil <= 48
            })
            const alertCount = pendingAppts.length + rescheduledAppts.length + needsGroomerAppts.length + awaitingGroomerAppts.length
            return (
            <div>
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm text-gray-500">
                  {alertCount > 0
                    ? `${alertCount} item${alertCount !== 1 ? 's' : ''} need your attention`
                    : 'All upcoming appointments'}
                </p>
                <div className="flex gap-2">
                  <button onClick={() => playBark()} title="Test bark sound"
                    className="text-xs bg-white border border-gray-200 hover:bg-amber-50 hover:border-amber-300 text-gray-500 hover:text-amber-700 px-3 py-1.5 rounded-lg font-medium transition-colors">
                    🐶 Test
                  </button>
                  <button onClick={() => playChime()} title="Test chime sound"
                    className="text-xs bg-white border border-gray-200 hover:bg-violet-50 hover:border-violet-300 text-gray-500 hover:text-violet-700 px-3 py-1.5 rounded-lg font-medium transition-colors">
                    🔔 Test
                  </button>
                  <button onClick={() => fetchAppointments('requests')} disabled={loading}
                    className="text-xs bg-white border border-gray-200 hover:bg-gray-50 text-gray-600 px-3 py-1.5 rounded-lg font-medium disabled:opacity-50 transition-colors">
                    {loading ? '⏳' : '↻'} Refresh
                  </button>
                </div>
              </div>
              {loading && <p className="text-gray-400 text-sm">Loading...</p>}
              {!loading && appointments.length === 0 && (
                <div className="bg-white rounded-2xl border border-gray-200 py-16 text-center text-gray-400">No upcoming appointments</div>
              )}

              {/* Pending — need confirmation */}
              {!loading && pendingAppts.length > 0 && (
                <>
                  <p className="text-xs font-bold uppercase tracking-widest text-amber-500 mb-2">Needs Confirmation</p>
                  <div className="bg-white rounded-2xl border border-amber-100 overflow-hidden mb-5">
                    <div className="overflow-x-auto"><div className="min-w-[520px]">
                    <div className="px-5 py-3 border-b border-gray-100 bg-amber-50 grid grid-cols-6 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      <span>Date</span><span>Time</span><span>Pet</span><span>Owner</span><span>Service</span><span>Actions</span>
                    </div>
                    {pendingAppts.map(appt => (
                      <div key={appt.id} onClick={() => openApptDetail(appt)} className="px-5 py-3 border-b border-gray-50 grid grid-cols-6 items-center hover:bg-amber-50/60 cursor-pointer">
                        <span className="text-sm font-semibold text-gray-800">{formatDate(appt.appointment_date)}</span>
                        <span className="text-sm text-gray-600">{appt.appointment_time}</span>
                        <div className="flex items-center gap-2">
                          {appt.pets?.photo_url
                            ? <img src={appt.pets.photo_url} className="w-7 h-7 rounded-full object-cover" alt="" />
                            : <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-xs">🐶</div>}
                          <span className="text-sm">{appt.pets?.name}</span>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-800">{appt.clients?.name}</p>
                          <p className="text-xs text-gray-400">{appt.clients?.phone}</p>
                        </div>
                        <span className="text-sm text-gray-500">{serviceMap[appt.service] ?? appt.service}</span>
                        <div className="flex gap-2" onClick={e => e.stopPropagation()}>
                          <button onClick={() => handleAction(appt.id,'confirm')} disabled={actionLoading!==null}
                            className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-all text-white disabled:opacity-50 ${isActionLoading(appt.id+'confirm') ? 'bg-emerald-600' : 'bg-emerald-500 hover:bg-emerald-600'}`}>
                            {getButtonText('✓ Confirm', appt.id+'confirm', actionLoading!==null)}
                          </button>
                          <button onClick={() => handleAction(appt.id,'decline')} disabled={actionLoading!==null}
                            className={`text-xs font-bold px-3 py-1.5 rounded-lg border border-red-200 transition-all ${isActionLoading(appt.id+'decline') ? 'bg-red-200 text-red-700' : 'bg-red-50 hover:bg-red-100 text-red-500'}`}>
                            {getButtonText('Decline', appt.id+'decline', actionLoading!==null)}
                          </button>
                        </div>
                      </div>
                    ))}
                    </div></div>
                  </div>
                </>
              )}

              {/* Rescheduled — awaiting groomer re-acceptance */}
              {!loading && rescheduledAppts.length > 0 && (
                <>
                  <p className="text-xs font-bold uppercase tracking-widest text-orange-500 mb-2">🔄 Rescheduled — Awaiting Groomer</p>
                  <div className="bg-white rounded-2xl border border-orange-100 overflow-hidden mb-5">
                    <div className="overflow-x-auto"><div className="min-w-[520px]">
                    <div className="px-5 py-3 border-b border-gray-100 bg-orange-50 grid grid-cols-6 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      <span>Date</span><span>Time</span><span>Pet</span><span>Owner</span><span>Service</span><span>Status</span>
                    </div>
                    {rescheduledAppts.map(appt => (
                      <div key={appt.id} onClick={() => openApptDetail(appt)} className="px-5 py-3 border-b border-gray-50 grid grid-cols-6 items-center hover:bg-orange-50/60 cursor-pointer">
                        <span className="text-sm font-semibold text-gray-800">{formatDate(appt.appointment_date)}</span>
                        <span className="text-sm text-gray-600">{appt.appointment_time}</span>
                        <div className="flex items-center gap-2">
                          {appt.pets?.photo_url
                            ? <img src={appt.pets.photo_url} className="w-7 h-7 rounded-full object-cover" alt="" />
                            : <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-xs">🐶</div>}
                          <span className="text-sm">{appt.pets?.name}</span>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-800">{appt.clients?.name}</p>
                          <p className="text-xs text-gray-400">{appt.clients?.phone}</p>
                        </div>
                        <span className="text-sm text-gray-500">{serviceMap[appt.service] ?? appt.service}</span>
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-orange-700 bg-orange-100 px-2 py-1 rounded-full w-fit">
                          🔄 Rescheduled
                        </span>
                      </div>
                    ))}
                    </div></div>
                  </div>
                </>
              )}

              {/* Confirmed — needs groomer assignment */}
              {!loading && needsGroomerAppts.length > 0 && (
                <>
                  <p className="text-xs font-bold uppercase tracking-widest text-amber-500 mb-2">Confirmed — Assign Staff</p>
                  <div className="bg-white rounded-2xl border border-amber-200 overflow-hidden mb-5">
                    <div className="overflow-x-auto"><div className="min-w-[520px]">
                    <div className="px-5 py-3 border-b border-gray-100 bg-amber-50 grid grid-cols-6 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      <span>Date</span><span>Time</span><span>Pet</span><span>Owner</span><span>Service</span><span>Action</span>
                    </div>
                    {needsGroomerAppts.map(appt => (
                      <div key={appt.id} onClick={() => openApptDetail(appt)} className="px-5 py-3 border-b border-gray-50 grid grid-cols-6 items-center hover:bg-amber-50/40 cursor-pointer">
                        <span className="text-sm font-semibold text-gray-800">{formatDate(appt.appointment_date)}</span>
                        <span className="text-sm text-gray-600">{appt.appointment_time}</span>
                        <div className="flex items-center gap-2">
                          {appt.pets?.photo_url
                            ? <img src={appt.pets.photo_url} className="w-7 h-7 rounded-full object-cover" alt="" />
                            : <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-xs">🐶</div>}
                          <span className="text-sm">{appt.pets?.name}</span>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-800">{appt.clients?.name}</p>
                          <p className="text-xs text-gray-400">{appt.clients?.phone}</p>
                        </div>
                        <span className="text-sm text-gray-500">{serviceMap[appt.service] ?? appt.service}</span>
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-1 rounded-full w-fit">
                          Assign Staff →
                        </span>
                      </div>
                    ))}
                    </div></div>
                  </div>
                </>
              )}

              {/* Pending groomer confirmation */}
              {!loading && awaitingGroomerAppts.length > 0 && (
                <>
                  <p className="text-xs font-bold uppercase tracking-widest text-violet-500 mb-2">⏳ Pending Groomer Confirmation</p>
                  <div className="bg-white rounded-2xl border border-violet-200 overflow-hidden mb-5">
                    <div className="overflow-x-auto"><div className="min-w-[520px]">
                    <div className="px-5 py-3 border-b border-gray-100 bg-violet-50 grid grid-cols-6 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      <span>Date</span><span>Time</span><span>Pet</span><span>Owner</span><span>Service</span><span>Assigned To</span>
                    </div>
                    {awaitingGroomerAppts.map(appt => (
                      <div key={appt.id} onClick={() => openApptDetail(appt)} className="px-5 py-3 border-b border-gray-50 grid grid-cols-6 items-center hover:bg-violet-50/40 cursor-pointer">
                        <span className="text-sm font-semibold text-gray-800">{formatDate(appt.appointment_date)}</span>
                        <span className="text-sm text-gray-600">{appt.appointment_time}</span>
                        <div className="flex items-center gap-2">
                          {appt.pets?.photo_url
                            ? <img src={appt.pets.photo_url} className="w-7 h-7 rounded-full object-cover" alt="" />
                            : <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-xs">🐶</div>}
                          <span className="text-sm">{appt.pets?.name}</span>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-800">{appt.clients?.name}</p>
                          <p className="text-xs text-gray-400">{appt.clients?.phone}</p>
                        </div>
                        <span className="text-sm text-gray-500">{serviceMap[appt.service] ?? appt.service}</span>
                        <div className="flex flex-col gap-1">
                          {appt.assigned_groomer && <span className="inline-flex items-center gap-1 text-xs font-semibold text-violet-700 bg-violet-50 border border-violet-200 px-2 py-1 rounded-full w-fit">✂️ {firstName(appt.assigned_groomer)}</span>}
                          {appt.assigned_bather && <span className="inline-flex items-center gap-1 text-xs font-semibold text-violet-700 bg-violet-50 border border-violet-200 px-2 py-1 rounded-full w-fit">🛁 {firstName(appt.assigned_bather)}</span>}
                        </div>
                      </div>
                    ))}
                    </div></div>
                  </div>
                </>
              )}

              {/* Fully confirmed — ready, show within 48 hrs */}
              {!loading && fullyConfirmedAppts.length > 0 && (
                <>
                  <p className="text-xs font-bold uppercase tracking-widest text-emerald-600 mb-2">Confirmed &amp; Scheduled</p>
                  <div className="bg-white rounded-2xl border border-emerald-100 overflow-hidden">
                    <div className="overflow-x-auto"><div className="min-w-[520px]">
                    <div className="px-5 py-3 border-b border-gray-100 bg-emerald-50 grid grid-cols-6 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      <span>Date</span><span>Time</span><span>Pet</span><span>Owner</span><span>Service</span><span>Status</span>
                    </div>
                    {fullyConfirmedAppts.map(appt => (
                      <div key={appt.id} onClick={() => openApptDetail(appt)} className="px-5 py-3 border-b border-gray-50 grid grid-cols-6 items-center hover:bg-emerald-50/50 cursor-pointer">
                        <span className="text-sm font-semibold text-gray-800">{formatDate(appt.appointment_date)}</span>
                        <span className="text-sm text-gray-600">{appt.appointment_time}</span>
                        <div className="flex items-center gap-2">
                          {appt.pets?.photo_url
                            ? <img src={appt.pets.photo_url} className="w-7 h-7 rounded-full object-cover" alt="" />
                            : <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-xs">🐶</div>}
                          <span className="text-sm">{appt.pets?.name}</span>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-800">{appt.clients?.name}</p>
                          <p className="text-xs text-gray-400">{appt.clients?.phone}</p>
                        </div>
                        <span className="text-sm text-gray-500">{serviceMap[appt.service] ?? appt.service}</span>
                        <div className="flex flex-col gap-1">
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-100 px-2 py-1 rounded-full w-fit">✓ Confirmed</span>
                          {appt.assigned_groomer && <span className="inline-flex items-center gap-1 text-xs font-semibold text-sky-700 bg-sky-100 px-2 py-1 rounded-full w-fit">✂️ {firstName(appt.assigned_groomer)} ✓</span>}
                          {appt.assigned_bather && <span className="inline-flex items-center gap-1 text-xs font-semibold text-sky-700 bg-sky-100 px-2 py-1 rounded-full w-fit">🛁 {firstName(appt.assigned_bather)} ✓</span>}
                        </div>
                      </div>
                    ))}
                    </div></div>
                  </div>
                </>
              )}
            </div>
            )
          })()}

          {/* ── INTAKE FORM SUBMISSIONS ───────────────────────────────────── */}
          {tab === 'intake' && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm text-gray-500">New booking requests — review profile &amp; confirm.</p>
                {appointments.length > 0 && <span className="text-xs font-semibold bg-amber-100 text-amber-700 px-2.5 py-1 rounded-full">{appointments.length} pending</span>}
              </div>
              {loading && <p className="text-gray-400 text-sm">Loading...</p>}
              {!loading && appointments.length === 0 && (
                <div className="bg-white rounded-2xl border border-gray-200 py-16 text-center text-gray-400">No new client submissions</div>
              )}
              {!loading && appointments.length > 0 && (
                <div className="grid gap-4">
                  {appointments.map(appt => {
                    const vaccineStatus = appt.pets?.vaccine_status
                    const vaccineLabel =
                      vaccineStatus === 'verified' ? '✓ Verified'
                      : vaccineStatus === 'uploaded' ? '📎 Uploaded — pending review'
                      : vaccineStatus === 'email_sent' || vaccineStatus === 'email' ? '📧 Sent via email'
                      : vaccineStatus === 'text' ? '💬 Sent via text'
                      : '⚠️ No records yet'
                    const vaccineColor =
                      vaccineStatus === 'verified' ? 'bg-green-100 text-green-700 border-green-200'
                      : vaccineStatus === 'uploaded' ? 'bg-blue-100 text-blue-700 border-blue-200 hover:bg-blue-200 cursor-pointer'
                      : vaccineStatus === 'email_sent' || vaccineStatus === 'email' || vaccineStatus === 'text' ? 'bg-yellow-100 text-yellow-700 border-yellow-200 hover:bg-yellow-200 cursor-pointer'
                      : 'bg-red-50 text-red-600 border-red-200'
                    const isEditOpen = intakeEditId === appt.id
                    const missingEmail = !appt.clients?.email
                    const missingBreed = !appt.pets?.breed
                    const missingWeight = !appt.pets?.weight
                    const profileIncomplete = missingEmail || missingBreed || missingWeight || vaccineStatus === 'pending'
                    return (
                      <div key={appt.id} className={`bg-white rounded-2xl border overflow-hidden ${profileIncomplete ? 'border-amber-200' : 'border-gray-200'}`}>
                        {/* Header */}
                        <div className="px-5 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold bg-sky-100 text-sky-700 px-2 py-0.5 rounded-full">🆕 New Client</span>
                            {profileIncomplete && <span className="text-xs font-semibold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">⚠️ Profile Incomplete</span>}
                            <span className="text-xs text-gray-400">{new Date(appt.created_at).toLocaleDateString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZone:SALON_TZ})}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-gray-600">📅 {formatDate(appt.appointment_date)} · {appt.appointment_time}</span>
                            <span className="text-xs font-medium bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">{serviceMap[appt.service] ?? appt.service}</span>
                          </div>
                        </div>

                        {/* Info row */}
                        <div className="px-5 py-4 grid grid-cols-2 gap-6">
                          <div>
                            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Owner</p>
                            <p className="font-semibold text-gray-800">{appt.clients?.name || '—'}</p>
                            <p className="text-sm text-gray-500 mt-0.5">{appt.clients?.phone}</p>
                            {appt.clients?.email
                              ? <p className="text-sm text-gray-400">{appt.clients.email}</p>
                              : <p className="text-xs text-amber-500 mt-0.5">No email on file</p>}
                          </div>
                          <div>
                            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Pet</p>
                            <div className="flex items-center gap-3">
                              {appt.pets?.photo_url
                                ? <img src={appt.pets.photo_url} className="w-12 h-12 rounded-full object-cover border-2 border-gray-200 flex-shrink-0" alt="" />
                                : <div className="w-12 h-12 rounded-full bg-sky-100 flex items-center justify-center text-xl flex-shrink-0">🐶</div>}
                              <div>
                                <p className="font-semibold text-gray-800">{appt.pets?.name || '—'}</p>
                                <div className="flex flex-wrap gap-1.5 mt-1">
                                  {appt.pets?.breed ? <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{appt.pets.breed}</span> : <span className="text-xs text-amber-500">No breed</span>}
                                  {appt.pets?.weight ? <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">⚖️ {appt.pets.weight}</span> : <span className="text-xs text-amber-500">No weight</span>}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Vaccine + actions row */}
                        <div className="px-5 pb-3 border-t border-gray-100 pt-3 flex items-center justify-between gap-4 flex-wrap">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Vaccine:</p>
                            <button onClick={() => setTab('vaccines')}
                              className={`text-xs font-semibold px-3 py-1 rounded-full border transition-colors ${vaccineColor} hover:opacity-80`}>
                              {vaccineLabel}
                            </button>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => {
                                if (isEditOpen) { setIntakeEditId(null) } else {
                                  setIntakeEditId(appt.id)
                                  const nameParts = (appt.clients?.name || '').trim().split(' ')
                                  setIntakeFirstName(nameParts[0] || '')
                                  setIntakeLastName(nameParts.slice(1).join(' ') || '')
                                  setIntakeEmail(appt.clients?.email || '')
                                  setIntakeBreed(appt.pets?.breed || '')
                                  setIntakeWeight(appt.pets?.weight || '')
                                  setIntakeVaccine(appt.pets?.vaccine_status || 'pending')
                                  setIntakeNotes('')
                                }
                              }}
                              className="text-xs font-semibold text-sky-600 hover:text-sky-700 px-3 py-1.5 rounded-full border border-sky-200 hover:bg-sky-50 transition-colors">
                              {isEditOpen ? '✕ Close' : '✏️ Complete Profile'}
                            </button>
                            <button
                              onClick={() => handleAction(appt.id, 'confirm')}
                              disabled={actionLoading !== null}
                              className="text-xs font-semibold text-white bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 px-3 py-1.5 rounded-full transition-colors">
                              {isActionLoading(appt.id+'confirm') ? '…' : '✓ Confirm'}
                            </button>
                          </div>
                        </div>

                        {/* ── Inline profile editor ── */}
                        {isEditOpen && (
                          <div className="border-t border-amber-100 bg-amber-50 px-5 py-4 space-y-3">
                            <p className="text-xs font-bold text-amber-700 uppercase tracking-wide">Complete Client Profile</p>
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="text-xs text-gray-500 font-medium block mb-1">First Name</label>
                                <input type="text" value={intakeFirstName} onChange={e => setIntakeFirstName(e.target.value)}
                                  placeholder="First name"
                                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300 bg-white" />
                              </div>
                              <div>
                                <label className="text-xs text-gray-500 font-medium block mb-1">Last Name</label>
                                <input type="text" value={intakeLastName} onChange={e => setIntakeLastName(e.target.value)}
                                  placeholder="Last name"
                                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300 bg-white" />
                              </div>
                              <div>
                                <label className="text-xs text-gray-500 font-medium block mb-1">Owner Email</label>
                                <input type="email" value={intakeEmail} onChange={e => setIntakeEmail(e.target.value)}
                                  placeholder="email@example.com"
                                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300 bg-white" />
                              </div>
                              <div>
                                <label className="text-xs text-gray-500 font-medium block mb-1">Pet Breed</label>
                                <BreedInput value={intakeBreed} onChange={setIntakeBreed}
                                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300 bg-white" />
                              </div>
                              <div>
                                <label className="text-xs text-gray-500 font-medium block mb-1">Size / Weight</label>
                                <select value={intakeWeight} onChange={e => setIntakeWeight(e.target.value)}
                                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300 bg-white">
                                  <option value="">Select size…</option>
                                  {WEIGHT_OPTIONS.map(w => <option key={w} value={w}>{w}</option>)}
                                </select>
                              </div>
                              <div>
                                <label className="text-xs text-gray-500 font-medium block mb-1">Vaccine Records</label>
                                <select value={intakeVaccine} onChange={e => setIntakeVaccine(e.target.value)}
                                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300 bg-white">
                                  <option value="pending">⚠️ Not yet</option>
                                  <option value="text">📱 Sent via text</option>
                                  <option value="email">📧 Sent via email</option>
                                  <option value="uploaded">📎 Uploaded</option>
                                  <option value="verified">✓ Verified</option>
                                </select>
                              </div>
                            </div>
                            <div>
                              <label className="text-xs text-gray-500 font-medium block mb-1">Notes (grooming preferences, allergies, etc.)</label>
                              <textarea value={intakeNotes} onChange={e => setIntakeNotes(e.target.value)}
                                placeholder="e.g. Nervous around other dogs, prefers bandana..."
                                rows={2}
                                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300 bg-white resize-none" />
                            </div>
                            <div className="flex gap-2 pt-1">
                              <button
                                disabled={intakeSaving}
                                onClick={async () => {
                                  setIntakeSaving(true)
                                  try {
                                    // Update client name and/or email
                                    const fullName = `${intakeFirstName.trim()} ${intakeLastName.trim()}`.trim()
                                    const nameChanged = fullName && fullName !== appt.clients?.name
                                    const emailChanged = intakeEmail !== appt.clients?.email
                                    if (nameChanged || emailChanged) {
                                      await fetch('/api/admin/clients', {
                                        method: 'PATCH',
                                        headers: {'Content-Type':'application/json'},
                                        body: JSON.stringify({ phone: appt.client_phone, ...(nameChanged && { name: fullName }), ...(emailChanged && { email: intakeEmail }) })
                                      })
                                    }
                                    // Update pet details
                                    if (appt.pets?.id) {
                                      await fetch(`/api/admin/pets/${appt.pets.id}`, {
                                        method: 'PATCH',
                                        headers: {'Content-Type':'application/json'},
                                        body: JSON.stringify({ breed: intakeBreed, weight: intakeWeight, vaccine_status: intakeVaccine })
                                      })
                                    }
                                    // Add note if provided
                                    if (intakeNotes.trim()) {
                                      await fetch(`/api/admin/appointments/${appt.id}`, {
                                        method: 'PATCH',
                                        headers: {'Content-Type':'application/json'},
                                        body: JSON.stringify({ action: 'add-note', note: { id: Date.now().toString(), text: intakeNotes, author: 'Admin', created_at: new Date().toISOString() } })
                                      })
                                    }
                                    showToast('✓ Profile saved!')
                                    setIntakeEditId(null)
                                    fetchAppointments('pending')
                                  } catch { showToast('⚠️ Save failed') }
                                  finally { setIntakeSaving(false) }
                                }}
                                className="flex-1 bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-white text-sm font-semibold py-2 rounded-xl transition-colors">
                                {intakeSaving ? 'Saving…' : '💾 Save Profile'}
                              </button>
                              <button
                                disabled={intakeSaving || actionLoading !== null}
                                onClick={async () => {
                                  setIntakeSaving(true)
                                  try {
                                    // Save profile first
                                    if (intakeEmail !== appt.clients?.email) {
                                      await fetch('/api/admin/clients', { method: 'PATCH', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ phone: appt.client_phone, email: intakeEmail }) })
                                    }
                                    if (appt.pets?.id) {
                                      await fetch(`/api/admin/pets/${appt.pets.id}`, { method: 'PATCH', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ breed: intakeBreed, weight: intakeWeight, vaccine_status: intakeVaccine }) })
                                    }
                                    if (intakeNotes.trim()) {
                                      await fetch(`/api/admin/appointments/${appt.id}`, { method: 'PATCH', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ action: 'add-note', note: { id: Date.now().toString(), text: intakeNotes, author: 'Admin', created_at: new Date().toISOString() } }) })
                                    }
                                    // Then confirm
                                    const res = await fetch(`/api/admin/appointments/${appt.id}`, { method: 'PATCH', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ action: 'confirm' }) })
                                    if (res.ok) {
                                      showToast('✓ Profile saved & appointment confirmed!')
                                      setIntakeEditId(null)
                                      fetchAppointments('pending')
                                    } else { showToast('⚠️ Confirm failed') }
                                  } catch { showToast('⚠️ Error') }
                                  finally { setIntakeSaving(false) }
                                }}
                                className="flex-1 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white text-sm font-semibold py-2 rounded-xl transition-colors">
                                {intakeSaving ? '…' : '✓ Save & Confirm'}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── PET PARENTS ───────────────────────────────────────────────── */}
          {tab === 'clients' && (
            <div>
              {/* ── Search bar ──────────────────────────────── */}
              <div className="flex items-center gap-4 mb-3">
                <div className="relative flex-1 max-w-sm">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
                  <input type="text" placeholder="Search by name, pet, or phone..."
                    value={clientSearch} onChange={e => setClientSearch(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300 bg-white shadow-sm" />
                </div>
                <span className="text-sm text-gray-400 font-medium">{clients.length} clients</span>
                <button
                  onClick={openDeletedClients}
                  className="text-xs font-semibold text-gray-400 hover:text-rose-500 border border-gray-200 hover:border-rose-300 px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap">
                  🗑️ Deleted Clients
                </button>
              </div>

              {/* ── Tag filter chips ────────────────── */}
              {tags.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap mb-5">
                  <span className="text-xs text-gray-500 font-medium">🏷️ Filter:</span>
                  <button
                    onClick={() => setClientTagFilter([])}
                    className={`px-2.5 py-0.5 rounded-full border text-xs font-medium ${clientTagFilter.length === 0 ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'}`}>
                    All
                  </button>
                  {tags.map(t => {
                    const active = clientTagFilter.includes(t.id)
                    return (
                      <button
                        key={t.id}
                        onClick={() => setClientTagFilter(prev => active ? prev.filter(id => id !== t.id) : [...prev, t.id])}
                        className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${tagClasses(t.color)} ${active ? 'ring-2 ring-offset-1 ring-gray-400' : 'opacity-70 hover:opacity-100'}`}>
                        {t.name}
                      </button>
                    )
                  })}
                  {clientTagFilter.length > 0 && (
                    <button onClick={() => setClientTagFilter([])} className="text-xs text-gray-400 hover:text-gray-700 underline ml-1">clear</button>
                  )}
                </div>
              )}

              {clientsLoading && <p className="text-gray-400 text-sm">Loading...</p>}

              {!clientsLoading && (
                <div className="space-y-3">
                  {clients
                    .filter(c => {
                      const q = clientSearch.toLowerCase().trim()
                      if (!q) return true
                      return (
                        c.name.toLowerCase().includes(q) ||
                        c.phone.includes(clientSearch) ||
                        c.pets.some(p => p.name.toLowerCase().includes(q))
                      )
                    })
                    .filter(c => clientTagFilter.length === 0 || c.pets.some(p => (p.tags || []).some(t => clientTagFilter.includes(t.id))))
                    .map(client => {
                      const isOpen = expandedClient === client.phone
                      // Determine overall vaccine health for color accent
                      const hasExpired = client.pets.some(p => {
                        if (!p.vaccine_expiry) return false
                        const exp = new Date(p.vaccine_expiry + 'T00:00:00')
                        return exp < new Date()
                      })
                      const hasUnverified = client.pets.some(p => p.vaccine_status !== 'verified')
                      const accentColor = hasExpired ? 'border-l-red-400' : hasUnverified ? 'border-l-amber-400' : 'border-l-green-400'

                      return (
                        <div key={client.phone} className={`bg-white rounded-2xl border border-gray-200 border-l-4 ${accentColor} shadow-sm overflow-hidden`}>

                          {/* ── Collapsed row ─────────────────────────── */}
                          <button
                            onClick={() => setExpandedClient(isOpen ? null : client.phone)}
                            className="w-full px-5 py-4 flex items-center gap-4 hover:bg-gray-50/80 transition-colors text-left"
                          >
                            {/* Name + contact — no avatar, just clear text */}
                            <div className="flex-1 min-w-0">
                              <p className="font-bold text-gray-800 text-base leading-tight">{client.name || <span className="text-gray-400 italic">No name</span>}</p>
                              <p className="text-sm text-gray-400 mt-0.5">
                                <span>{client.phone}</span>
                                {client.email && <span className="ml-3 text-gray-400">{client.email}</span>}
                              </p>
                            </div>
                            {/* Pets preview — show up to 3 with names, then overflow as overlapping avatars + "+N" */}
                            <div className="flex items-center gap-2 flex-shrink-0" title={client.pets.map(p => p.name).join(', ')}>
                              {client.pets.slice(0, 3).map(p => (
                                <div key={p.id} className="flex items-center gap-1.5">
                                  {p.photo_url
                                    ? <img src={p.photo_url} className="w-8 h-8 rounded-full object-cover border-2 border-white shadow-sm ring-1 ring-gray-200" alt={p.name} />
                                    : <div className="w-8 h-8 rounded-full bg-sky-100 flex items-center justify-center text-sm border-2 border-white shadow-sm">🐶</div>}
                                  <span className="text-sm text-gray-700 font-medium truncate max-w-[80px]">{p.name}</span>
                                </div>
                              ))}
                              {client.pets.length > 3 && (
                                <div className="flex items-center -space-x-2">
                                  {client.pets.slice(3, 6).map(p => (
                                    p.photo_url
                                      ? <img key={p.id} src={p.photo_url} className="w-7 h-7 rounded-full object-cover border-2 border-white shadow-sm ring-1 ring-gray-200" alt={p.name} />
                                      : <div key={p.id} className="w-7 h-7 rounded-full bg-sky-100 flex items-center justify-center text-xs border-2 border-white shadow-sm">🐶</div>
                                  ))}
                                  {client.pets.length > 6 && (
                                    <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center text-xs font-semibold text-gray-600 border-2 border-white shadow-sm">
                                      +{client.pets.length - 6}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                            {/* Stats */}
                            <div className="flex items-center gap-4 flex-shrink-0 text-sm text-gray-400">
                              <div className="text-center">
                                <p className="font-semibold text-gray-700 text-base">{client.appointments.length}</p>
                                <p className="text-xs">appts</p>
                              </div>
                              <div className="text-center">
                                <p className="font-semibold text-gray-700 text-base">{new Date(client.created_at).toLocaleDateString('en-US',{month:'short',year:'numeric'})}</p>
                                <p className="text-xs">member since</p>
                              </div>
                              <span className={`text-gray-400 text-lg transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}>⌄</span>
                            </div>
                          </button>

                          {/* ── Expanded panel ────────────────────────── */}
                          {isOpen && (
                            <div className="border-t border-gray-100 bg-gray-50/60 px-5 py-5">
                              <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">

                                {/* LEFT: Owner info (2 cols) */}
                                <div className="lg:col-span-2 space-y-4">

                                  {/* Contact Info */}
                                  <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                                    <div className="flex items-center justify-between px-4 py-3 bg-sky-50 border-b border-sky-100">
                                      <p className="text-xs font-bold text-sky-700 uppercase tracking-wide">👤 Owner Info</p>
                                      {editingClient === client.phone
                                        ? <div className="flex gap-2">
                                            <button onClick={() => { setEditingClient(null); setClientEditData(null) }}
                                              className="text-xs px-3 py-1 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50">Cancel</button>
                                            <button onClick={() => saveClientEdit(client.phone)} disabled={savingClient}
                                              className="text-xs px-3 py-1 rounded-lg bg-sky-600 text-white hover:bg-sky-700 disabled:opacity-50">
                                              {savingClient ? 'Saving…' : 'Save'}
                                            </button>
                                          </div>
                                        : <button onClick={() => {
                                              setEditingClient(client.phone)
                                              setClientEditData({ firstName: client.name?.split(' ')[0] || '', lastName: client.name?.split(' ').slice(1).join(' ') || '', phone: client.phone||'', email: client.email||'', address: client.address||'' })
                                            }}
                                            className="text-xs px-3 py-1 rounded-lg border border-sky-200 text-sky-600 hover:bg-sky-100">✏️ Edit</button>
                                      }
                                    </div>
                                    {editingClient === client.phone && clientEditData ? (
                                      <div className="px-4 py-4 space-y-3">
                                        <div className="grid grid-cols-2 gap-3">
                                          <div>
                                            <label className="text-xs text-gray-400 block mb-1">First Name</label>
                                            <input value={clientEditData.firstName} onChange={e => setClientEditData(d => d ? {...d, firstName: e.target.value} : d)}
                                              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300" />
                                          </div>
                                          <div>
                                            <label className="text-xs text-gray-400 block mb-1">Last Name</label>
                                            <input value={clientEditData.lastName} onChange={e => setClientEditData(d => d ? {...d, lastName: e.target.value} : d)}
                                              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300" />
                                          </div>
                                        </div>
                                        {[
                                          { label: 'Phone', key: 'phone' as const },
                                          { label: 'Email', key: 'email' as const },
                                          { label: 'Address', key: 'address' as const },
                                        ].map(f => (
                                          <div key={f.key}>
                                            <label className="text-xs text-gray-400 block mb-1">{f.label}</label>
                                            <input value={clientEditData[f.key]} onChange={e => setClientEditData(d => d ? {...d, [f.key]: e.target.value} : d)}
                                              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300" />
                                          </div>
                                        ))}
                                      </div>
                                    ) : (
                                      <div className="px-4 py-4 space-y-3">
                                        <div className="flex items-start gap-2">
                                          <span className="text-gray-400 mt-0.5">📞</span>
                                          <div>
                                            <p className="text-xs text-gray-400">Phone</p>
                                            <p className="text-sm font-semibold text-gray-700">{client.phone}</p>
                                          </div>
                                        </div>
                                        <div className="flex items-start gap-2">
                                          <span className="text-gray-400 mt-0.5">✉️</span>
                                          <div>
                                            <p className="text-xs text-gray-400">Email</p>
                                            <p className="text-sm text-gray-700">{client.email || <span className="text-gray-300 italic">—</span>}</p>
                                          </div>
                                        </div>
                                        <div className="flex items-start gap-2">
                                          <span className="text-gray-400 mt-0.5">📍</span>
                                          <div>
                                            <p className="text-xs text-gray-400">Address</p>
                                            <p className="text-sm text-gray-700">{client.address || <span className="text-gray-300 italic">—</span>}</p>
                                          </div>
                                        </div>
                                        <div className="flex items-start gap-2">
                                          <span className="text-gray-400 mt-0.5">🗓</span>
                                          <div>
                                            <p className="text-xs text-gray-400">Member Since</p>
                                            <p className="text-sm text-gray-700">{new Date(client.created_at).toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'})}</p>
                                          </div>
                                        </div>
                                        <div className="flex items-start gap-2 pt-2 border-t border-gray-100">
                                          <span className="text-gray-400 mt-0.5">📱</span>
                                          <div className="flex-1 flex items-center justify-between gap-2">
                                            <div>
                                              <p className="text-xs text-gray-400">SMS Consent</p>
                                              {client.sms_consent ? (
                                                <p className="text-sm font-semibold text-emerald-700">✓ Opted in{client.sms_consent_at ? ` · ${new Date(client.sms_consent_at).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}` : ''}</p>
                                              ) : (
                                                <p className="text-sm font-semibold text-amber-700">⚠ Not opted in — no texts sent</p>
                                              )}
                                            </div>
                                            {!client.sms_consent && (
                                              <button
                                                onClick={() => grantSmsConsent(client.phone)}
                                                disabled={smsConsentSaving}
                                                className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-sky-600 text-white disabled:opacity-50 hover:bg-sky-700 flex-shrink-0"
                                                title="Use only after the client has verbally confirmed they want to receive SMS notifications"
                                              >
                                                {smsConsentSaving ? 'Saving…' : 'Mark opted-in'}
                                              </button>
                                            )}
                                          </div>
                                        </div>
                                      </div>
                                    )}
                                  </div>

                                  {/* Authorized Pickups */}
                                  <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                                    <div className="flex items-center justify-between px-4 py-3 bg-violet-50 border-b border-violet-100">
                                      <p className="text-xs font-bold text-violet-700 uppercase tracking-wide">🚗 Authorized Pickups</p>
                                      <button onClick={() => setAddingPickupFor(addingPickupFor===client.phone ? null : client.phone)}
                                        className="text-xs px-3 py-1 rounded-lg border border-violet-200 text-violet-600 hover:bg-violet-100">+ Add</button>
                                    </div>
                                    <div className="px-4 py-3">
                                      {(client.authorized_pickups || []).length === 0 && addingPickupFor !== client.phone
                                        ? <p className="text-xs text-gray-400 italic py-1">No authorized pickup people on file</p>
                                        : <div className="flex flex-wrap gap-2 mb-2">
                                            {(client.authorized_pickups || []).map(p => (
                                              <div key={p.id} className="flex items-center gap-2 bg-violet-50 border border-violet-100 rounded-full px-3 py-1">
                                                <span className="text-sm text-violet-800 font-medium">{p.name}</span>
                                                {p.relationship && <span className="text-xs text-violet-500">· {p.relationship}</span>}
                                                <button onClick={() => removePickup(client.phone, p.id)}
                                                  className="text-violet-400 hover:text-red-500 ml-1 leading-none text-base">×</button>
                                              </div>
                                            ))}
                                          </div>
                                      }
                                      {addingPickupFor === client.phone && (
                                        <div className="space-y-2 mt-2 pt-2 border-t border-gray-100">
                                          <div className="grid grid-cols-2 gap-2">
                                            <div>
                                              <label className="text-xs text-gray-400 block mb-1">Name *</label>
                                              <input value={newPickupName} onChange={e => setNewPickupName(e.target.value)}
                                                placeholder="Full name"
                                                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" />
                                            </div>
                                            <div>
                                              <label className="text-xs text-gray-400 block mb-1">Relationship</label>
                                              <input value={newPickupRel} onChange={e => setNewPickupRel(e.target.value)}
                                                placeholder="e.g. Spouse"
                                                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" />
                                            </div>
                                          </div>
                                          <div className="flex gap-2">
                                            <button onClick={() => addPickup(client.phone)} disabled={!newPickupName.trim()}
                                              className="flex-1 py-1.5 bg-violet-600 text-white text-sm rounded-lg hover:bg-violet-700 disabled:opacity-40">Add</button>
                                            <button onClick={() => { setAddingPickupFor(null); setNewPickupName(''); setNewPickupRel('') }}
                                              className="px-3 py-1.5 border border-gray-200 text-gray-500 text-sm rounded-lg hover:bg-gray-50">Cancel</button>
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>

                                {/* RIGHT: Pets (3 cols) */}
                                <div className="lg:col-span-3 space-y-4">
                                  {client.pets.length === 0 && (
                                    <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center text-gray-400">
                                      <div className="text-4xl mb-2">🐾</div>
                                      <p className="text-sm">No pets on file</p>
                                    </div>
                                  )}
                                  {client.pets.map(pet => {
                                    const petAppts = client.appointments
                                      .filter(a => a.pet_id === pet.id)
                                      .sort((a,b) => b.appointment_date.localeCompare(a.appointment_date))

                                    // Vaccine expiry info
                                    let expiryEl: ReactNode = null
                                    if (pet.vaccine_expiry) {
                                      const today = new Date(); today.setHours(0,0,0,0)
                                      const exp = new Date(pet.vaccine_expiry + 'T00:00:00')
                                      const daysLeft = Math.ceil((exp.getTime() - today.getTime()) / 86400000)
                                      const expired = daysLeft < 0
                                      const expiringSoon = !expired && daysLeft <= 30
                                      expiryEl = (
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                          <span className="text-xs text-gray-400">Expires {exp.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}</span>
                                          {expired && <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-semibold">⚠️ EXPIRED</span>}
                                          {expiringSoon && <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-semibold">⚠️ {daysLeft}d left</span>}
                                        </div>
                                      )
                                    }

                                    const vaccineAccent =
                                      pet.vaccine_status === 'verified' ? 'border-l-green-400 bg-green-50/40' :
                                      pet.vaccine_status === 'email_sent' ? 'border-l-amber-400 bg-amber-50/30' :
                                      'border-l-red-400 bg-red-50/20'

                                    return (
                                      <div key={pet.id} className={`bg-white rounded-2xl border border-gray-100 border-l-4 ${vaccineAccent} overflow-hidden shadow-sm`}>

                                        {/* Pet header */}
                                        <div className="px-4 pt-4 pb-3 flex items-start gap-4">
                                          {/* Photo */}
                                          <div className="relative group flex-shrink-0">
                                            {pet.photo_url
                                              ? <img src={pet.photo_url} className="w-16 h-16 rounded-2xl object-cover border-2 border-white shadow-md" alt={pet.name} />
                                              : <div className="w-16 h-16 rounded-2xl bg-sky-100 flex items-center justify-center text-3xl border-2 border-white shadow-md">🐶</div>}
                                            <label className={`absolute inset-0 rounded-2xl flex items-center justify-center cursor-pointer transition-all
                                              ${uploadingPetId===pet.id ? 'bg-black/50' : uploadDonePetId===pet.id ? 'bg-green-500/80' : 'bg-black/0 group-hover:bg-black/40'}`}>
                                              <input type="file" accept="image/*" className="hidden"
                                                onChange={e => { const f=e.target.files?.[0]; if(f) uploadPetPhoto(pet.id, f) }} />
                                              {uploadingPetId===pet.id
                                                ? <svg className="w-5 h-5 text-white animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
                                                : uploadDonePetId===pet.id
                                                  ? <span className="text-white text-xl font-bold">✓</span>
                                                  : <span className="text-white text-sm opacity-0 group-hover:opacity-100">📷</span>}
                                            </label>
                                          </div>

                                          {/* Info */}
                                          <div className="flex-1 min-w-0">
                                            <div className="flex items-start justify-between gap-2">
                                              <p className="font-bold text-gray-800 text-lg leading-tight">{pet.name}</p>
                                              <button
                                                onClick={() => { if (confirm(`Delete ${pet.name}'s profile? This cannot be undone.`)) deletePet(client.phone, pet.id) }}
                                                disabled={deletingPetId === pet.id}
                                                className="text-xs text-rose-400 hover:text-rose-600 font-medium disabled:opacity-50 flex-shrink-0">
                                                {deletingPetId === pet.id ? '⏳' : '🗑'}
                                              </button>
                                            </div>

                                            {/* Breed row */}
                                            {pet.breed && <p className="text-sm text-gray-500 mt-0.5">{pet.breed}</p>}

                                            {/* Tags */}
                                            <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
                                              {(pet.tags ?? []).map(t => (
                                                <TagPill
                                                  key={t.id}
                                                  tag={t as PetTag}
                                                  onRemove={async () => {
                                                    await fetch('/api/admin/pet-tags', {
                                                      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
                                                      body: JSON.stringify({ pet_id: pet.id, tag_id: t.id }),
                                                    })
                                                    setClients(prev => prev.map(c => c.phone === client.phone
                                                      ? { ...c, pets: c.pets.map(p => p.id === pet.id ? { ...p, tags: (p.tags ?? []).filter(x => x.id !== t.id) } : p) }
                                                      : c))
                                                  }}
                                                />
                                              ))}
                                              <TagPicker
                                                petId={pet.id}
                                                currentTags={(pet.tags ?? []) as PetTag[]}
                                                onChange={(newTags) => {
                                                  setClients(prev => prev.map(c => c.phone === client.phone
                                                    ? { ...c, pets: c.pets.map(p => p.id === pet.id ? { ...p, tags: newTags } : p) }
                                                    : c))
                                                }}
                                              />
                                            </div>

                                            {/* Weight (editable) */}
                                            <div className="flex items-center gap-1 mt-1">
                                              <span className="text-xs text-gray-400">⚖️</span>
                                              {editingWeightId === pet.id ? (
                                                <div className="flex items-center gap-1 flex-wrap">
                                                  {editingWeightValue === '__custom__' ? (
                                                    <>
                                                      <input
                                                        autoFocus
                                                        type="text"
                                                        value={customWeightText}
                                                        onChange={e => setCustomWeightText(e.target.value)}
                                                        placeholder="e.g. 52 lbs"
                                                        className="text-xs border border-sky-300 rounded-lg px-2 py-0.5 w-28 bg-white focus:outline-none focus:ring-1 focus:ring-sky-400"
                                                        onKeyDown={e => { if (e.key === 'Enter' && customWeightText.trim()) updatePetWeight(pet.id, customWeightText.trim(), client.phone) }}
                                                      />
                                                      <button onClick={() => setEditingWeightValue('')} className="text-xs text-gray-400 hover:text-gray-600">← back</button>
                                                    </>
                                                  ) : (
                                                    <select value={editingWeightValue} onChange={e => { setEditingWeightValue(e.target.value); if (e.target.value === '__custom__') setCustomWeightText('') }}
                                                      className="text-xs border border-sky-300 rounded-lg px-1.5 py-0.5 bg-white focus:outline-none focus:ring-1 focus:ring-sky-400">
                                                      <option value="">— select —</option>
                                                      {WEIGHT_OPTIONS.map(w => <option key={w} value={w}>{w}</option>)}
                                                      <option value="__custom__">✏️ Custom…</option>
                                                    </select>
                                                  )}
                                                  {editingWeightValue !== '__custom__' && (
                                                    <button onClick={() => updatePetWeight(pet.id, editingWeightValue, client.phone)}
                                                      disabled={!editingWeightValue || savingWeightId === pet.id}
                                                      className="text-xs bg-sky-600 text-white px-2 py-0.5 rounded-lg disabled:opacity-40">
                                                      {savingWeightId === pet.id ? '…' : 'Save'}
                                                    </button>
                                                  )}
                                                  {editingWeightValue === '__custom__' && (
                                                    <button onClick={() => { if (customWeightText.trim()) updatePetWeight(pet.id, customWeightText.trim(), client.phone) }}
                                                      disabled={!customWeightText.trim() || savingWeightId === pet.id}
                                                      className="text-xs bg-sky-600 text-white px-2 py-0.5 rounded-lg disabled:opacity-40">
                                                      {savingWeightId === pet.id ? '…' : 'Save'}
                                                    </button>
                                                  )}
                                                  <button onClick={() => { setEditingWeightId(null); setCustomWeightText('') }} className="text-xs text-gray-400 hover:text-gray-600">✕</button>
                                                </div>
                                              ) : (
                                                <button onClick={() => { setEditingWeightId(pet.id); setEditingWeightValue(pet.weight && WEIGHT_OPTIONS.includes(pet.weight) ? pet.weight : pet.weight ? '__custom__' : ''); setCustomWeightText(pet.weight && !WEIGHT_OPTIONS.includes(pet.weight) ? pet.weight : '') }}
                                                  className="flex items-center gap-1 text-xs text-gray-500 hover:text-sky-600 group">
                                                  <span>{pet.weight || <span className="text-gray-300 italic">set weight</span>}</span>
                                                  <span className="opacity-0 group-hover:opacity-100 text-gray-400 ml-0.5">✏️</span>
                                                </button>
                                              )}
                                            </div>

                                            {/* Vaccine status (editable) */}
                                            <div className="flex items-center gap-2 mt-2 flex-wrap">
                                              {editingVaccineId === pet.id ? (
                                                <>
                                                  {(['verified','email_sent','pending'] as const).map(s => (
                                                    <button key={s} onClick={() => updateVaccineStatus(client.phone, pet.id, s)}
                                                      disabled={savingVaccineId === pet.id}
                                                      className={`text-xs px-2.5 py-1 rounded-full font-medium border transition-all disabled:opacity-50 ${
                                                        pet.vaccine_status === s
                                                          ? s==='verified' ? 'bg-green-500 text-white border-green-500'
                                                            : s==='email_sent' ? 'bg-amber-500 text-white border-amber-500'
                                                            : 'bg-red-500 text-white border-red-500'
                                                          : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'
                                                      }`}>
                                                      {s==='verified'?'✓ Vaccinated':s==='email_sent'?'Pending':'No Records'}
                                                    </button>
                                                  ))}
                                                  <button onClick={() => setEditingVaccineId(null)} className="text-xs text-gray-400 hover:text-gray-600">✕</button>
                                                </>
                                              ) : (
                                                <button onClick={() => setEditingVaccineId(pet.id)}
                                                  className={`text-xs px-2.5 py-1 rounded-full font-semibold hover:opacity-80 transition-opacity ${
                                                    pet.vaccine_status==='verified' ? 'bg-green-100 text-green-700' :
                                                    pet.vaccine_status==='email_sent' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-600'
                                                  }`}>
                                                  {pet.vaccine_status==='verified'?'✓ Vaccinated':pet.vaccine_status==='email_sent'?'⏳ Records Pending':'✕ No Records'} ✏️
                                                </button>
                                              )}
                                              {expiryEl}
                                            </div>
                                          </div>
                                        </div>

                                        {/* Appointment history — collapsible */}
                                        <div className="border-t border-gray-100 mx-4 mb-3 pt-2">
                                          {petAppts.length === 0 ? (
                                            <p className="text-xs text-gray-400 italic py-2">No appointments yet</p>
                                          ) : (() => {
                                            const histOpen = expandedPetHistoryIds.has(pet.id)
                                            const lastAppt = petAppts[0]
                                            const lastHC = lastAppt?.health_check as any
                                            const lastQC = lastAppt?.grooming_quality as any
                                            const lastHCIssues = lastHC ? (() => {
                                              const isNew = ['eyes','ears','nose','mouth','paws','skin'].some(k => Array.isArray(lastHC[k]))
                                              return ['eyes','ears','nose','mouth','paws','skin'].reduce((sum: number, k: string) => {
                                                const v = lastHC[k]
                                                return sum + (isNew ? (Array.isArray(v) ? v.length : 0) : (v === false ? 1 : 0))
                                              }, 0)
                                            })() : null
                                            return (
                                              <>
                                                {/* Toggle row */}
                                                <button
                                                  onClick={() => setExpandedPetHistoryIds(prev => {
                                                    const next = new Set(prev)
                                                    next.has(pet.id) ? next.delete(pet.id) : next.add(pet.id)
                                                    return next
                                                  })}
                                                  className="w-full flex items-center justify-between py-1.5 text-left group"
                                                >
                                                  <div className="flex items-center gap-2">
                                                    <span className="text-xs font-semibold text-gray-500 group-hover:text-gray-700">📋 History · {petAppts.length} visit{petAppts.length !== 1 ? 's' : ''}</span>
                                                    {/* Last visit quick badges */}
                                                    {!histOpen && lastAppt && (
                                                      <span className="text-xs text-gray-400">{formatDate(lastAppt.appointment_date)}</span>
                                                    )}
                                                    {!histOpen && lastHCIssues !== null && (
                                                      lastHCIssues === 0
                                                        ? <span className="text-[10px] bg-green-100 text-green-700 rounded-full px-1.5 py-0.5">✅ Normal</span>
                                                        : <span className="text-[10px] bg-rose-100 text-rose-700 rounded-full px-1.5 py-0.5">⚠️ {lastHCIssues} issue{lastHCIssues > 1 ? 's' : ''}</span>
                                                    )}
                                                    {!histOpen && lastQC && (
                                                      <span className="text-[10px] bg-emerald-100 text-emerald-700 rounded-full px-1.5 py-0.5">🎯 Quality</span>
                                                    )}
                                                  </div>
                                                  <span className={`text-gray-400 text-sm transition-transform duration-200 ${histOpen ? 'rotate-180' : ''}`}>⌄</span>
                                                </button>

                                                {/* Scrollable history */}
                                                {histOpen && (
                                                  <div className="max-h-[480px] overflow-y-auto space-y-1.5 pb-1 pr-1 -mr-1">
                                                    {petAppts.map(appt => {
                                                      const groomerNotes = (appt.notes_list ?? []).filter(n => !n.is_addon)
                                                      const hasCustomerReq = !!(appt.notes && appt.notes.trim())
                                                      return (
                                                        <div key={appt.id} className="rounded-xl bg-gray-50 hover:bg-gray-100 transition-colors overflow-hidden">
                                                          <div className="flex items-center justify-between gap-2 py-1.5 px-3">
                                                            <div className="min-w-0">
                                                              <p className="text-sm font-medium text-gray-700">{serviceMap[appt.service]??appt.service}</p>
                                                              <p className="text-xs text-gray-400">{formatDate(appt.appointment_date)} · {appt.appointment_time}
                                                                {appt.assigned_groomer && <span className="ml-1">· ✂️ {firstName(appt.assigned_groomer)}</span>}
                                                                {appt.assigned_bather && <span className="ml-1">· 🛁 {firstName(appt.assigned_bather)}</span>}
                                                              </p>
                                                            </div>
                                                            <div className="flex items-center gap-2 flex-shrink-0">
                                                              {appt.payment_amount
                                                                ? <span className="text-xs font-semibold text-green-700 bg-green-50 border border-green-100 px-2 py-0.5 rounded-full">💵 ${appt.payment_amount}</span>
                                                                : <span className="text-xs text-gray-300 italic">unpaid</span>
                                                              }
                                                              <span className={`text-xs px-2.5 py-0.5 rounded-full font-semibold ${STATUS_COLORS[appt.status]??'bg-gray-100 text-gray-500'}`}>
                                                                {appt.status}
                                                              </span>
                                                            </div>
                                                          </div>
                                                          {(hasCustomerReq || groomerNotes.length > 0 || appt.health_check || appt.grooming_quality) && (
                                                            <div className="px-3 pb-2 space-y-1.5">
                                                              {hasCustomerReq && (
                                                                <div className="bg-amber-50/80 border border-amber-100 rounded-lg px-2.5 py-1.5">
                                                                  <p className="text-[10px] font-bold uppercase tracking-wide text-amber-600 mb-0.5">📋 Customer Request</p>
                                                                  <p className="text-xs text-gray-700 leading-snug whitespace-pre-wrap">{appt.notes}</p>
                                                                  {(appt.notes_english || appt.notes_chinese) && (
                                                                    <div className="mt-1 space-y-0.5">
                                                                      {appt.notes_english && <p className="text-[11px] text-gray-500"><span className="opacity-60">🇺🇸</span> {appt.notes_english}</p>}
                                                                      {appt.notes_chinese && <p className="text-[11px] text-gray-500"><span className="opacity-60">🇹🇼</span> {appt.notes_chinese}</p>}
                                                                    </div>
                                                                  )}
                                                                </div>
                                                              )}
                                                              {groomerNotes.length > 0 && (
                                                                <div className="bg-violet-50/60 border border-violet-100 rounded-lg px-2.5 py-1.5">
                                                                  <p className="text-[10px] font-bold uppercase tracking-wide text-violet-600 mb-1">📝 Quick Notes ({groomerNotes.length})</p>
                                                                  <div className="space-y-1.5">
                                                                    {groomerNotes.map(n => (
                                                                      <div key={n.id} className="border-l-2 border-violet-200 pl-2">
                                                                        <p className="text-[10px] text-gray-400 font-medium">
                                                                          {n.author} · {new Date(n.created_at).toLocaleDateString('en-US',{month:'short',day:'numeric',timeZone:SALON_TZ})} {new Date(n.created_at).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',timeZone:SALON_TZ})}
                                                                        </p>
                                                                        <p className="text-xs text-gray-700 leading-snug whitespace-pre-wrap">{n.text}</p>
                                                                        {(n.notes_english || n.notes_chinese) && (
                                                                          <div className="mt-0.5 space-y-0.5">
                                                                            {n.notes_english && <p className="text-[11px] text-gray-500"><span className="opacity-60">🇺🇸</span> {n.notes_english}</p>}
                                                                            {n.notes_chinese && <p className="text-[11px] text-gray-500"><span className="opacity-60">🇹🇼</span> {n.notes_chinese}</p>}
                                                                          </div>
                                                                        )}
                                                                      </div>
                                                                    ))}
                                                                  </div>
                                                                </div>
                                                              )}
                                                              {/* Health Check */}
                                                              {appt.health_check && (() => {
                                                                const hc = appt.health_check as any
                                                                const HC_SECTIONS = [
                                                                  { key: 'eyes',  emoji: '👁️', label: 'Eyes' },
                                                                  { key: 'ears',  emoji: '👂', label: 'Ears' },
                                                                  { key: 'nose',  emoji: '👃', label: 'Nose' },
                                                                  { key: 'mouth', emoji: '😬', label: 'Mouth' },
                                                                  { key: 'paws',  emoji: '🐾', label: 'Paws' },
                                                                  { key: 'skin',  emoji: '🧴', label: 'Skin' },
                                                                ]
                                                                const isNew = HC_SECTIONS.some(s => Array.isArray(hc[s.key]))
                                                                const cleared: string[] = Array.isArray(hc.cleared_sections) ? hc.cleared_sections : []
                                                                const totalIssues = HC_SECTIONS.reduce((sum, s) => {
                                                                  const v = hc[s.key]
                                                                  return sum + (isNew ? (Array.isArray(v) ? v.length : 0) : (v === false ? 1 : 0))
                                                                }, 0)
                                                                const allNormal = isNew ? (cleared.length === 6 && totalIssues === 0) : HC_SECTIONS.every(s => hc[s.key] === true)
                                                                const issuesSections = HC_SECTIONS.filter(s => {
                                                                  const v = hc[s.key]
                                                                  return isNew ? (Array.isArray(v) && v.length > 0) : v === false
                                                                })
                                                                return (
                                                                  <div className="bg-sky-50/70 border border-sky-100 rounded-lg px-2.5 py-1.5">
                                                                    <p className="text-[10px] font-bold uppercase tracking-wide text-sky-600 mb-1">🩺 Health Check</p>
                                                                    {allNormal ? (
                                                                      <p className="text-xs text-green-600 font-medium">✅ All Normal — 一切正常</p>
                                                                    ) : (
                                                                      <div className="space-y-1">
                                                                        {issuesSections.map(s => {
                                                                          const v = hc[s.key]
                                                                          const issues: string[] = isNew ? (Array.isArray(v) ? v : []) : [s.label]
                                                                          return (
                                                                            <div key={s.key}>
                                                                              <span className="text-xs font-semibold text-rose-600">{s.emoji} {s.label}: </span>
                                                                              <span className="text-xs text-rose-500">{issues.map(i => i.replace(/_/g,' ')).join(', ')}</span>
                                                                            </div>
                                                                          )
                                                                        })}
                                                                        {issuesSections.length === 0 && <p className="text-xs text-gray-400">Completed</p>}
                                                                      </div>
                                                                    )}
                                                                    {hc.groomer_notes_english && (
                                                                      <p className="text-[11px] text-gray-500 mt-1 border-t border-sky-100 pt-1">🏥 {hc.groomer_notes_english}</p>
                                                                    )}
                                                                  </div>
                                                                )
                                                              })()}
                                                              {/* Quality Check */}
                                                              {appt.grooming_quality && (() => {
                                                                const q = appt.grooming_quality as any
                                                                const QC_ITEMS = [
                                                                  { key: 'nails_trimmed', old: 'nails_trimmed', emoji: '✂️', label: 'Nails' },
                                                                  { key: 'ears_cleaned',  old: 'ears_cleaned',  emoji: '👂', label: 'Ears' },
                                                                  { key: 'tangles_free',  old: 'coat_brushed',  emoji: '🪮', label: 'Tangles' },
                                                                  { key: 'sanitary_trim', old: 'bath_completed',emoji: '🧼', label: 'Sanitary' },
                                                                  { key: 'paw_pad_trim',  old: 'paw_pads_cleared',emoji:'🐾',label: 'Paw Pad' },
                                                                  { key: 'perfume_spray', old: 'styling_finished',emoji:'🌸',label: 'Perfume' },
                                                                ]
                                                                const done = QC_ITEMS.filter(i => q[i.key] || q[i.old])
                                                                const allDone = done.length === QC_ITEMS.length
                                                                return (
                                                                  <div className="bg-emerald-50/70 border border-emerald-100 rounded-lg px-2.5 py-1.5">
                                                                    <div className="flex items-center justify-between mb-1">
                                                                      <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-600">🎯 Quality Check</p>
                                                                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${allDone ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>{done.length}/{QC_ITEMS.length}</span>
                                                                    </div>
                                                                    {allDone ? (
                                                                      <p className="text-xs text-emerald-600 font-medium">✅ All Done</p>
                                                                    ) : (
                                                                      <p className="text-xs text-gray-600">{done.map(i => `${i.emoji} ${i.label}`).join(' · ') || '—'}</p>
                                                                    )}
                                                                    {q.groomer_diary && (
                                                                      <p className="text-[11px] text-purple-600 mt-1 border-t border-emerald-100 pt-1">📓 {q.groomer_diary}</p>
                                                                    )}
                                                                    {q.customer_note_english && (
                                                                      <p className="text-[11px] text-gray-500 mt-1">💌 {q.customer_note_english}</p>
                                                                    )}
                                                                  </div>
                                                                )
                                                              })()}
                                                            </div>
                                                          )}
                                                        </div>
                                                      )
                                                    })}
                                                  </div>
                                                )}
                                              </>
                                            )
                                          })()}
                                        </div>
                                      </div>
                                    )
                                  })}
                                </div>

                              </div>

                              {/* Delete client */}
                              <div className="mt-4 pt-3 border-t border-gray-200 flex justify-end">
                                {confirmDeleteClient === client.phone ? (
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs text-red-600 font-medium">Delete this client and all their data?</span>
                                    <button onClick={() => handleDeleteClient(client.phone)} disabled={deletingClient === client.phone}
                                      className="text-xs px-3 py-1.5 rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50">
                                      {deletingClient === client.phone ? 'Deleting…' : 'Yes, Delete'}
                                    </button>
                                    <button onClick={() => setConfirmDeleteClient(null)}
                                      className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50">Cancel</button>
                                  </div>
                                ) : (
                                  <button onClick={() => setConfirmDeleteClient(client.phone)}
                                    className="text-xs px-3 py-1.5 rounded-lg border border-red-200 text-red-500 hover:bg-red-50">🗑 Delete Client</button>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                </div>
              )}
            </div>
          )}

          {/* ── VACCINE RECORDS ───────────────────────────────────────── */}
          {tab === 'vaccines' && (
            <div>
              {/* Header + filter */}
              <div className="flex flex-wrap items-center gap-2 mb-5">
                {/* Status toggle */}
                <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
                  <button onClick={() => { setVaccineShowAll(false); fetchVaccineRecords(false) }}
                    className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${!vaccineShowAll ? 'bg-white text-sky-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                    ⏳ Pending
                    {vaccineRecords.filter(r => !r.verified).length > 0 && (
                      <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full font-bold ${!vaccineShowAll ? 'bg-sky-100 text-sky-600' : 'bg-gray-200 text-gray-500'}`}>
                        {vaccineRecords.filter(r => !r.verified).length}
                      </span>
                    )}
                  </button>
                  <button onClick={() => { setVaccineShowAll(true); fetchVaccineRecords(true) }}
                    className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${vaccineShowAll ? 'bg-white text-sky-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                    📋 All
                    {vaccineRecords.length > 0 && (
                      <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full font-bold ${vaccineShowAll ? 'bg-sky-100 text-sky-600' : 'bg-gray-200 text-gray-500'}`}>
                        {vaccineRecords.length}
                      </span>
                    )}
                  </button>
                </div>

                {/* Divider */}
                <div className="w-px h-6 bg-gray-200" />

                {/* Method filter (no redundant "All" — deselect by clicking active) */}
                <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
                  {([
                    { key: 'uploaded', label: '📎 Uploaded' },
                    { key: 'email',    label: '📧 Email' },
                    { key: 'text',     label: '📱 Text' },
                  ] as const).map(f => {
                    const base = vaccineShowAll ? vaccineRecords : vaccineRecords.filter(r => !r.verified)
                    const count = base.filter(r =>
                      f.key === 'uploaded' ? !!r.file_url :
                      f.key === 'email' ? (r.is_email_only && !r.file_url) :
                      false
                    ).length
                    return (
                      <button key={f.key}
                        onClick={() => setVaccineFilter(vaccineFilter === f.key ? 'all' : f.key)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${vaccineFilter===f.key ? 'bg-white text-sky-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                        {f.label}
                        {count > 0 && <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${vaccineFilter===f.key ? 'bg-sky-100 text-sky-600' : 'bg-gray-200 text-gray-500'}`}>{count}</span>}
                      </button>
                    )
                  })}
                </div>

                <button onClick={() => fetchVaccineRecords()}
                  className="ml-auto text-sm px-3 py-1.5 rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-50">
                  ↻ Refresh
                </button>
              </div>

              {vaccineLoading && <p className="text-gray-400 text-sm">Loading…</p>}

              {!vaccineLoading && vaccineError && (
                <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-center">
                  <div className="text-3xl mb-2">⚠️</div>
                  <p className="font-semibold text-red-700 mb-1">Could not load vaccine records</p>
                  <p className="text-xs text-red-500 font-mono">{vaccineError}</p>
                  <button onClick={() => fetchVaccineRecords()} className="mt-3 text-sm px-4 py-1.5 bg-red-100 text-red-700 rounded-lg hover:bg-red-200">Try again</button>
                </div>
              )}

              {!vaccineLoading && !vaccineError && vaccineRecords.length === 0 && (
                <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center">
                  <div className="text-5xl mb-3">{vaccineShowAll ? '📋' : '✅'}</div>
                  <h2 className="font-bold text-gray-800 text-lg mb-1">{vaccineShowAll ? 'No records yet' : 'All caught up!'}</h2>
                  <p className="text-gray-400 text-sm">{vaccineShowAll ? 'No vaccination records have been submitted.' : 'No pending vaccine records to review.'}</p>
                </div>
              )}

              {!vaccineLoading && !vaccineError && vaccineRecords.length > 0 && (() => {
                const base = vaccineShowAll ? vaccineRecords : vaccineRecords.filter(r => !r.verified)
                const filtered = base.filter(r => {
                  if (vaccineFilter === 'all') return true
                  if (vaccineFilter === 'uploaded') return !!r.file_url
                  if (vaccineFilter === 'email') return r.is_email_only && !r.file_url
                  if (vaccineFilter === 'text') return false
                  return true
                })
                return (
                  <div className="space-y-3">
                    {filtered.length === 0
                      ? <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center text-sm text-gray-400">No records match this filter.</div>
                      : filtered.map(rec => {
                          const pet = rec.pets
                          const client = pet?.clients
                          const isUploaded = !!rec.file_url
                          const isApproving = approvingId === rec.id
                          const isExpired = pet?.vaccine_expiry && new Date(pet.vaccine_expiry + 'T12:00:00') < new Date()
                          return (
                            <div key={rec.id} className={`bg-white rounded-2xl border overflow-hidden ${rec.verified ? 'border-gray-100' : 'border-gray-200'}`}>
                              {/* Card header */}
                              <div className={`px-5 py-2.5 flex items-center justify-between ${rec.verified ? 'bg-emerald-50 border-b border-emerald-100' : 'bg-gray-50 border-b border-gray-100'}`}>
                                <div className="flex items-center gap-2">
                                  <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${
                                    rec.verified ? 'bg-emerald-100 text-emerald-700' :
                                    pet?.vaccine_status==='email_sent' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-50 text-red-600'
                                  }`}>
                                    {rec.verified ? '✓ Verified' : pet?.vaccine_status==='email_sent' ? 'Pending Email' : 'Pending'}
                                  </span>
                                  {isExpired && <span className="text-xs bg-red-100 text-red-600 font-semibold px-2 py-0.5 rounded-full">⚠️ Expired</span>}
                                </div>
                                <span className="text-xs text-gray-400">
                                  Submitted {new Date(rec.submitted_at).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:SALON_TZ})} · {new Date(rec.submitted_at).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',timeZone:SALON_TZ})}
                                </span>
                              </div>

                              {/* Card body */}
                              <div className="px-5 py-4 flex items-start gap-6">
                                {/* Pet + owner */}
                                <div className="flex items-center gap-3 min-w-0 w-52 flex-shrink-0">
                                  {pet?.photo_url
                                    ? <img src={pet.photo_url} className="w-12 h-12 rounded-full object-cover border-2 border-gray-100 flex-shrink-0" alt={pet.name} />
                                    : <div className="w-12 h-12 rounded-full bg-sky-100 flex items-center justify-center text-2xl flex-shrink-0">🐶</div>}
                                  <div className="min-w-0">
                                    <p className="font-bold text-gray-800">{pet?.name ?? '—'}</p>
                                    {pet?.breed && <p className="text-xs text-gray-400 truncate">{pet.breed}</p>}
                                    <p className="text-xs text-gray-500 mt-0.5 truncate">{client?.name}</p>
                                    <p className="text-xs text-gray-400 truncate">{client?.phone}</p>
                                  </div>
                                </div>

                                {/* Method */}
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Vaccine Record</p>
                                  {isUploaded ? (
                                    <div className="flex flex-col gap-1">
                                      <span className="text-xs bg-sky-50 text-sky-700 border border-sky-100 px-2.5 py-1 rounded-lg font-medium w-fit">📎 File Uploaded</span>
                                      {rec.signedUrl && (
                                        <a href={rec.signedUrl} target="_blank" rel="noopener noreferrer"
                                          className="text-xs text-sky-600 hover:underline font-medium">View document →</a>
                                      )}
                                    </div>
                                  ) : (
                                    <div className="flex flex-col gap-1">
                                      <span className="text-xs bg-amber-50 text-amber-700 border border-amber-100 px-2.5 py-1 rounded-lg font-medium w-fit">📧 Sent via Email</span>
                                      <p className="text-xs text-gray-400">Check: kokonipets@gmail.com</p>
                                    </div>
                                  )}
                                </div>

                                {/* Expiry date */}
                                <div className="flex-shrink-0 w-40">
                                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Vaccine Expiry</p>
                                  <input
                                    type="date"
                                    value={pet?.id ? (rowExpiryValues[pet.id] ?? pet.vaccine_expiry ?? '') : ''}
                                    onChange={e => {
                                      if (!pet?.id) return
                                      setRowExpiryValues(prev => ({ ...prev, [pet.id]: e.target.value }))
                                    }}
                                    onBlur={async e => {
                                      if (!pet?.id) return
                                      const val = e.target.value
                                      if (val !== (pet.vaccine_expiry || '')) {
                                        await saveVaccineExpiry(pet.id, val)
                                      }
                                    }}
                                    className={`text-sm border rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-sky-300 w-full ${
                                      isExpired ? 'border-red-300 text-red-600' : 'border-gray-200 text-gray-700'
                                    }`}
                                  />
                                </div>

                                {/* Action */}
                                <div className="flex-shrink-0 flex flex-col items-end justify-center self-center">
                                  {rec.verified ? (
                                    <div className="text-center">
                                      <div className="text-2xl mb-0.5">✅</div>
                                      <p className="text-xs text-emerald-600 font-semibold">Verified</p>
                                      {rec.verified_at && <p className="text-xs text-gray-400">{new Date(rec.verified_at).toLocaleDateString('en-US',{month:'short',day:'numeric'})}</p>}
                                    </div>
                                  ) : (
                                    <button
                                      onClick={async () => {
                                        if (pet?.id) {
                                          const rowVal = rowExpiryValues[pet.id] ?? ''
                                          if (rowVal && rowVal !== (pet.vaccine_expiry || '')) {
                                            await saveVaccineExpiry(pet.id, rowVal)
                                          }
                                        }
                                        approveVaccineRecord(rec.id)
                                      }}
                                      disabled={isApproving}
                                      className="flex items-center gap-2 px-5 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-semibold rounded-xl disabled:opacity-50 transition-colors shadow-sm">
                                      {isApproving
                                        ? <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
                                        : '✓'} {isApproving ? 'Saving…' : 'Mark Verified'}
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>
                          )
                        })}
                  </div>
                )
              })()}
            </div>
          )}

          {/* ── PAYROLL ───────────────────────────────────────────────────── */}
          {tab === 'payroll' && (
            <div className="space-y-6">
              {/* Filters */}
              <div className="bg-white rounded-2xl border border-gray-200 p-6">
                <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                  <h2 className="text-lg font-bold text-gray-800">📅 Payroll Period</h2>
                  <div className="flex gap-2">
                    <button
                      onClick={() => { const p = computePayrollPeriod('next'); setPayrollStartDate(p.start); setPayrollEndDate(p.end); setPayrollPayDate(p.pay) }}
                      className="px-3 py-1.5 bg-emerald-100 hover:bg-emerald-200 text-emerald-700 text-xs font-semibold rounded-lg transition-colors"
                    >
                      Next Pay Period
                    </button>
                    <button
                      onClick={() => { const p = computePayrollPeriod('this'); setPayrollStartDate(p.start); setPayrollEndDate(p.end); setPayrollPayDate(p.pay) }}
                      className="px-3 py-1.5 bg-sky-100 hover:bg-sky-200 text-sky-700 text-xs font-semibold rounded-lg transition-colors"
                    >
                      This Pay Period
                    </button>
                    <button
                      onClick={() => { const p = computePayrollPeriod('last'); setPayrollStartDate(p.start); setPayrollEndDate(p.end); setPayrollPayDate(p.pay) }}
                      className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold rounded-lg transition-colors"
                    >
                      Last Pay Period
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
                  <div>
                    <label className="text-xs font-semibold text-gray-600 block mb-1">Start Date</label>
                    <input
                      type="date"
                      value={payrollStartDate}
                      onChange={e => setPayrollStartDate(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-600 block mb-1">End Date</label>
                    <input
                      type="date"
                      value={payrollEndDate}
                      onChange={e => {
                        const v = e.target.value
                        setPayrollEndDate(v)
                        // Keep the pay date in sync with the groomer's rule:
                        // the first Friday after the period ends.
                        if (v) {
                          const pay = new Date(v + 'T12:00:00')
                          do { pay.setDate(pay.getDate() + 1) } while (pay.getDay() !== 5)
                          setPayrollPayDate(`${pay.getFullYear()}-${String(pay.getMonth() + 1).padStart(2, '0')}-${String(pay.getDate()).padStart(2, '0')}`)
                        }
                      }}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-600 block mb-1">Pay Date</label>
                    <input
                      type="date"
                      value={payrollPayDate}
                      onChange={e => setPayrollPayDate(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-600 block mb-1">Groomer</label>
                    <select
                      value={payrollSelectedGroomer}
                      onChange={e => setPayrollSelectedGroomer(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white"
                    >
                      <option value="">All Groomers</option>
                      {staff.filter(s => s.role === 'groomer' || s.role === 'Groomer').map(s => (
                        <option key={s.id} value={s.name}>{s.name}</option>
                      ))}
                      {staff.filter(s => s.role !== 'groomer' && s.role !== 'Groomer' && s.role !== 'admin').map(s => (
                        <option key={s.id} value={s.name}>{s.name} ({s.role})</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <button
                    onClick={generatePayrollReport}
                    disabled={actionLoading === 'payroll'}
                    className="px-4 py-2 bg-emerald-100 hover:bg-emerald-200 disabled:opacity-50 text-emerald-700 text-sm font-semibold rounded-lg transition-colors"
                  >
                    {actionLoading === 'payroll' ? '⏳ Generating…' : '🔄 Refresh'}
                  </button>
                  {payrollReport && (
                    <>
                      <button
                        onClick={exportPayrollCSV}
                        className="px-4 py-2 bg-blue-100 hover:bg-blue-200 text-blue-700 text-sm font-semibold rounded-lg transition-colors"
                      >
                        💾 CSV
                      </button>
                      <button
                        onClick={exportPayrollExcel}
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-lg transition-colors"
                      >
                        ⬇️ Excel
                      </button>
                      <button
                        onClick={exportPayrollPDF}
                        disabled={actionLoading === 'payroll-pdf'}
                        title="One branded PDF statement per groomer (zipped if multiple) — ready to email with payment"
                        className="px-4 py-2 bg-sky-700 hover:bg-sky-800 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors"
                      >
                        {actionLoading === 'payroll-pdf' ? '⏳ PDF…' : '📄 PDF (per groomer)'}
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* ── Report Output ── */}
              {payrollReport && (
                <>
                  {/* Section 1: Daily Transactions */}
                  <div className="bg-white rounded-2xl border border-gray-200 p-6">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h2 className="text-lg font-bold text-gray-800">📋 Daily Transactions</h2>
                        <p className="text-xs text-gray-400 mt-0.5">{payrollStartDate} → {payrollEndDate}{payrollSelectedGroomer ? ` · ${payrollSelectedGroomer}` : ' · All Groomers'}</p>
                      </div>
                    </div>
                    {payrollReport.daily.length === 0 ? (
                      <p className="text-sm text-gray-500 py-4 text-center">No appointments found for this period.</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b-2 border-gray-200">
                              <th className="text-left text-xs font-semibold text-gray-500 pb-2 pr-3">Date</th>
                              <th className="text-right text-xs font-semibold text-gray-500 pb-2 px-2">Appts</th>
                              <th className="text-right text-xs font-semibold text-gray-500 pb-2 px-2">Revenue</th>
                              <th className="text-right text-xs font-semibold text-sky-600 pb-2 px-2">Commission</th>
                              <th className="text-right text-xs font-semibold text-gray-500 pb-2 px-2">Tips</th>
                              <th className="text-right text-xs font-semibold text-emerald-600 pb-2 pl-2">Tip Share</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {payrollReport.daily.map(row => (
                              <tr key={row.date} className="hover:bg-gray-50">
                                <td className="py-2 pr-3 text-gray-800 font-medium whitespace-nowrap">
                                  {new Date(row.date + 'T12:00:00').toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}
                                </td>
                                <td className="py-2 px-2 text-right text-gray-600">{row.appts}</td>
                                <td className="py-2 px-2 text-right text-gray-700">${row.revenue.toFixed(2)}</td>
                                <td className="py-2 px-2 text-right text-sky-700 font-semibold">${row.commission.toFixed(2)}</td>
                                <td className="py-2 px-2 text-right text-gray-500">${row.tips.toFixed(2)}</td>
                                <td className="py-2 pl-2 text-right text-emerald-700 font-semibold">${row.tipShare.toFixed(2)}</td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr className="border-t-2 border-gray-400 bg-gray-50">
                              <td className="py-3 pr-3 text-sm font-bold text-gray-800">Period Total</td>
                              <td className="py-3 px-2 text-right text-sm font-bold text-gray-800">
                                {payrollReport.daily.reduce((s, r) => s + r.appts, 0)}
                              </td>
                              <td className="py-3 px-2 text-right text-sm font-bold text-gray-800">
                                ${payrollReport.daily.reduce((s, r) => s + r.revenue, 0).toFixed(2)}
                              </td>
                              <td className="py-3 px-2 text-right text-sm font-bold text-sky-700">
                                ${payrollReport.daily.reduce((s, r) => s + r.commission, 0).toFixed(2)}
                              </td>
                              <td className="py-3 px-2 text-right text-sm font-bold text-gray-500">
                                ${payrollReport.daily.reduce((s, r) => s + r.tips, 0).toFixed(2)}
                              </td>
                              <td className="py-3 pl-2 text-right text-sm font-bold text-emerald-700">
                                ${payrollReport.daily.reduce((s, r) => s + r.tipShare, 0).toFixed(2)}
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    )}
                  </div>

                  {/* Section 2: Groomer Pay Summary */}
                  {payrollReport.groomers.length > 0 && (
                    <div className="bg-white rounded-2xl border border-gray-200 p-6">
                      <h2 className="text-lg font-bold text-gray-800 mb-1">💰 Groomer Pay Summary</h2>
                      <p className="text-xs text-gray-400 mb-4">What each groomer earns for this period</p>
                      <div className="space-y-4">
                        {payrollReport.groomers.map(g => (
                          <div key={g.name} className="border border-gray-200 rounded-xl overflow-hidden">
                            <div className="bg-gray-50 px-4 py-3 flex items-center justify-between">
                              <div>
                                <span className="font-bold text-gray-800">{g.name}</span>
                                <span className="text-xs text-gray-500 ml-2">{g.appts} appointment{g.appts !== 1 ? 's' : ''}</span>
                              </div>
                              <div className="text-right">
                                <p className="text-xs text-gray-400">Total pay</p>
                                <p className="text-lg font-bold text-purple-700">${(g.commission + g.tipShare).toFixed(2)}</p>
                              </div>
                            </div>
                            <div className="px-4 py-3 grid grid-cols-2 gap-4">
                              <div>
                                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Commission</p>
                                <p className="text-2xl font-bold text-sky-700">${g.commission.toFixed(2)}</p>
                                <p className="text-xs text-gray-400 mt-0.5">${g.revenue.toFixed(2)} revenue × {g.commRate}%</p>
                              </div>
                              <div>
                                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Tip Share</p>
                                <p className="text-2xl font-bold text-emerald-700">${g.tipShare.toFixed(2)}</p>
                                <p className="text-xs text-gray-400 mt-0.5">${g.tips.toFixed(2)} collected × {g.tipRate}%</p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                      {payrollReport.groomers.length > 1 && (
                        <div className="mt-4 p-4 bg-purple-50 border border-purple-200 rounded-xl flex items-center justify-between">
                          <span className="text-sm font-bold text-purple-800">Total Payroll for Period</span>
                          <span className="text-2xl font-bold text-purple-700">
                            ${payrollReport.groomers.reduce((s, g) => s + g.commission + g.tipShare, 0).toFixed(2)}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}

              {/* Staff commission rates reference */}
              <div className="bg-white rounded-2xl border border-gray-200 p-6">
                <p className="text-sm font-semibold text-gray-700 mb-3">👥 Staff Rates</p>
                {staff.length === 0 ? (
                  <p className="text-sm text-gray-500">No staff members. Add staff in Settings.</p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {staff.map(member => (
                      <div key={member.id} className="bg-gray-50 p-3 rounded-lg">
                        <p className="text-sm font-semibold text-gray-800">{member.name}</p>
                        <p className="text-xs text-gray-500 capitalize">{member.role}</p>
                        <div className="mt-1 text-xs text-gray-600 space-y-0.5">
                          <div>Commission: <span className="font-semibold text-sky-700">{member.commission_percent}%</span></div>
                          <div>Tip share: <span className="font-semibold text-emerald-700">{member.tip_percent}%</span></div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── WAITLIST ──────────────────────────────────────────────────── */}
          {tab === 'waitlist' && (
            <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center">
              <div className="text-5xl mb-3">⏳</div>
              <h2 className="font-bold text-gray-800 text-lg mb-2">Waitlist</h2>
              <p className="text-gray-400 text-sm">Clients who requested dates that were fully booked will appear here.</p>
              <p className="text-gray-300 text-xs mt-2">Coming soon — needs a waitlist database table</p>
            </div>
          )}

          {/* ── CASHIER ───────────────────────────────────────────────────── */}
          {tab === 'cashier' && (() => {
            const now = salonNow(); if (now.getHours() < 4) now.setDate(now.getDate() - 1) // salon (LA) time
            const todayStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`
            const weekAgo = new Date(now); weekAgo.setDate(now.getDate() - 6)
            const weekAgoStr = `${weekAgo.getFullYear()}-${String(weekAgo.getMonth()+1).padStart(2,'0')}-${String(weekAgo.getDate()).padStart(2,'0')}`
            const monthStart = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`

            const cashierAppts = reportsAppts.filter(a => {
              if (a.status === 'cancelled') return false
              if (cashierRange === 'today') return a.appointment_date === todayStr
              if (cashierRange === 'week') return a.appointment_date >= weekAgoStr
              if (cashierRange === 'custom') return !!cashierCustomDate && a.appointment_date === cashierCustomDate
              return a.appointment_date >= monthStart
            }).sort((a, b) => a.appointment_date.localeCompare(b.appointment_date) || a.appointment_time.localeCompare(b.appointment_time))

            const unpaid = cashierAppts.filter(a => a.payment_status !== 'paid')
            const paid = cashierAppts.filter(a => a.payment_status === 'paid')
            const totalPaid = paid.reduce((s, a) => s + parseFloat(a.payment_amount || '0'), 0)
            const totalTips = paid.reduce((s, a) => s + parseFloat(a.tip_amount || '0'), 0)
            const totalUnpaid = unpaid.length
            const methodLabels: Record<string, string> = { cash: '💵 Cash', card: '💳 Card', zelle: '🔵 Zelle', venmo: '📱 Venmo', check: '📝 Check' }
            const methodBreakdown = (['cash', 'card', 'zelle', 'venmo'] as const).map(m => ({
              key: m,
              label: methodLabels[m],
              amount: paid.filter(a => a.payment_method === m).reduce((s, a) => s + parseFloat(a.payment_amount || '0'), 0),
              tips: paid.filter(a => a.payment_method === m).reduce((s, a) => s + parseFloat(a.tip_amount || '0'), 0),
              count: paid.filter(a => a.payment_method === m).length,
              color: m === 'cash' ? 'border-green-200 bg-green-50 text-green-700' : m === 'card' ? 'border-sky-200 bg-sky-50 text-sky-700' : m === 'zelle' ? 'border-purple-200 bg-purple-50 text-purple-700' : 'border-blue-200 bg-blue-50 text-blue-700',
            }))

            const savePayment = async (appt: Appointment, method: string) => {
              if (!cashierAmount) return
              setCashierSavingId(appt.id)
              try {
                const res = await fetch(`/api/admin/appointments/${appt.id}`, {
                  method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ action: 'record-payment', payment_amount: cashierAmount, tip_amount: cashierTip || '0', payment_method: method, payment_status: 'paid' }),
                })
                if ((await res.json()).success) {
                  setReportsAppts(prev => prev.map(x => x.id === appt.id
                    ? { ...x, payment_amount: cashierAmount, tip_amount: cashierTip || '0', payment_method: method, payment_status: 'paid' }
                    : x))
                  setCashierExpandedId(null); setCashierMode(null)
                  showToast('✓ Payment recorded!')
                }
              } catch {/**/}
              finally { setCashierSavingId(null) }
            }

            const saveEdit = async (appt: Appointment) => {
              setCashierSavingId(appt.id)
              try {
                const updates: Record<string, string> = { action: 'record-payment', payment_amount: cashierAmount, tip_amount: cashierTip || '0', payment_status: appt.payment_status || 'paid' }
                if (appt.payment_method) updates.payment_method = appt.payment_method
                const res = await fetch(`/api/admin/appointments/${appt.id}`, {
                  method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(updates),
                })
                const svcRes = cashierService && cashierService !== appt.service
                  ? await fetch(`/api/admin/appointments/${appt.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'change-service', service: cashierService }) })
                  : null
                if ((await res.json()).success) {
                  setReportsAppts(prev => prev.map(x => x.id === appt.id
                    ? { ...x, payment_amount: cashierAmount, tip_amount: cashierTip || '0', service: cashierService || x.service }
                    : x))
                  setCashierExpandedId(null); setCashierMode(null)
                  showToast('✓ Updated!')
                }
                void svcRes
              } catch {/**/}
              finally { setCashierSavingId(null) }
            }

            const openPay = (appt: Appointment) => {
              setCashierExpandedId(appt.id); setCashierMode('pay')
              setCashierAmount(appt.payment_amount || ''); setCashierTip(''); setCashierService(appt.service)
            }
            const openEdit = (appt: Appointment) => {
              setCashierExpandedId(appt.id); setCashierMode('edit')
              setCashierAmount(appt.payment_amount || ''); setCashierTip(appt.tip_amount || ''); setCashierService(appt.service)
            }
            const closeExpanded = () => { setCashierExpandedId(null); setCashierMode(null) }

            const ApptRow = ({ appt }: { appt: Appointment }) => {
              const isExpanded = cashierExpandedId === appt.id
              const isPaid = appt.payment_status === 'paid'
              const timeStr = (() => {
                const t = appt.appointment_time
                if (t.toUpperCase().includes('AM') || t.toUpperCase().includes('PM')) return t.trim()
                const [h, m] = t.split(':'); const hr = parseInt(h)
                return `${hr % 12 || 12}:${m} ${hr >= 12 ? 'PM' : 'AM'}`
              })()
              return (
                <div className={`border-b border-gray-50 last:border-0 ${isExpanded ? 'bg-gray-50/60' : ''}`}>
                  <div className={`flex items-center gap-3 px-4 py-2.5 group hover:bg-gray-50/80 transition-colors`}>
                    {(cashierRange === 'week' || cashierRange === 'month') && (
                      <span className="text-[10px] text-gray-400 w-10 shrink-0 font-medium">
                        {new Date(appt.appointment_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </span>
                    )}
                    <span className="text-xs text-gray-400 w-16 shrink-0 tabular-nums">{timeStr}</span>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-semibold text-gray-800">{appt.pets?.name}</span>
                      <span className="text-xs text-gray-400 ml-2">{appt.clients?.name} · {serviceMap[appt.service] ?? appt.service}</span>
                      {appt.assigned_groomer && <span className="text-xs text-gray-300 ml-2">✂️ {firstName(appt.assigned_groomer)}</span>}
                    </div>
                    <div className="flex items-center gap-1.5">
                      {isPaid ? (
                        <>
                          <span className="text-xs font-semibold text-emerald-600">
                            {appt.payment_method ? (methodLabels[appt.payment_method] ?? appt.payment_method) : ''} ${parseFloat(appt.payment_amount || '0').toFixed(2)}
                          </span>
                          {parseFloat(appt.tip_amount || '0') > 0 && (
                            <span className="text-xs text-emerald-400">+${parseFloat(appt.tip_amount || '0').toFixed(2)} tip</span>
                          )}
                          <button onClick={() => isExpanded ? closeExpanded() : openEdit(appt)}
                            className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-300 hover:text-sky-500 text-xs px-1">✏️</button>
                        </>
                      ) : (
                        <>
                          <span className="text-xs font-semibold text-rose-400 bg-rose-50 px-2 py-0.5 rounded-full">Unpaid</span>
                          <button onClick={() => isExpanded && cashierMode === 'pay' ? closeExpanded() : openPay(appt)}
                            className="opacity-0 group-hover:opacity-100 transition-opacity text-xs bg-emerald-500 hover:bg-emerald-600 text-white px-2.5 py-1 rounded-lg font-semibold">
                            Pay
                          </button>
                          <button onClick={() => isExpanded && cashierMode === 'edit' ? closeExpanded() : openEdit(appt)}
                            className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-300 hover:text-sky-500 text-xs px-1">✏️</button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Expanded: Pay row */}
                  {isExpanded && cashierMode === 'pay' && (
                    <div className="flex items-center gap-2 px-4 pb-3 flex-wrap">
                      <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden bg-white">
                        <span className="text-xs text-gray-400 px-2 border-r border-gray-200 py-1.5">$</span>
                        <input type="number" min="0" step="0.01" placeholder="Amount"
                          value={cashierAmount} onChange={e => setCashierAmount(e.target.value)} autoFocus
                          className="w-20 text-sm font-bold text-gray-800 py-1.5 px-2 focus:outline-none" />
                      </div>
                      <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden bg-white">
                        <span className="text-xs text-gray-400 px-2 border-r border-gray-200 py-1.5">Tip $</span>
                        <input type="number" min="0" step="0.01" placeholder="0"
                          value={cashierTip} onChange={e => setCashierTip(e.target.value)}
                          className="w-16 text-sm font-bold text-gray-800 py-1.5 px-2 focus:outline-none" />
                      </div>
                      {(['cash', 'card', 'zelle', 'venmo'] as const).map(m => (
                        <button key={m} disabled={!cashierAmount || cashierSavingId === appt.id}
                          onClick={() => savePayment(appt, m)}
                          className={`text-xs px-3 py-1.5 rounded-lg font-semibold border disabled:opacity-40 transition-colors ${
                            m === 'cash'  ? 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100' :
                            m === 'card'  ? 'bg-sky-50 text-sky-700 border-sky-200 hover:bg-sky-100' :
                            m === 'zelle' ? 'bg-purple-50 text-purple-600 border-purple-200 hover:bg-purple-100' :
                                            'bg-blue-50 text-blue-600 border-blue-200 hover:bg-blue-100'
                          }`}>
                          {cashierSavingId === appt.id ? '…' : methodLabels[m]}
                        </button>
                      ))}
                      <button onClick={closeExpanded} className="text-xs text-gray-300 hover:text-gray-500 px-1">✕</button>
                    </div>
                  )}

                  {/* Expanded: Edit row */}
                  {isExpanded && cashierMode === 'edit' && (
                    <div className="flex items-center gap-2 px-4 pb-3 flex-wrap">
                      <select value={cashierService} onChange={e => setCashierService(e.target.value)}
                        className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-sky-200">
                        {services.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                      <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden bg-white">
                        <span className="text-xs text-gray-400 px-2 border-r border-gray-200 py-1.5">$</span>
                        <input type="number" min="0" step="0.01" placeholder="Amount"
                          value={cashierAmount} onChange={e => setCashierAmount(e.target.value)} autoFocus
                          className="w-20 text-sm font-bold text-gray-800 py-1.5 px-2 focus:outline-none" />
                      </div>
                      <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden bg-white">
                        <span className="text-xs text-gray-400 px-2 border-r border-gray-200 py-1.5">Tip $</span>
                        <input type="number" min="0" step="0.01" placeholder="0"
                          value={cashierTip} onChange={e => setCashierTip(e.target.value)}
                          className="w-16 text-sm font-bold text-gray-800 py-1.5 px-2 focus:outline-none" />
                      </div>
                      <button onClick={() => saveEdit(appt)} disabled={cashierSavingId === appt.id}
                        className="text-xs bg-sky-500 hover:bg-sky-600 text-white px-3 py-1.5 rounded-lg font-semibold disabled:opacity-50">
                        {cashierSavingId === appt.id ? '…' : '✓ Save'}
                      </button>
                      <button onClick={closeExpanded} className="text-xs text-gray-300 hover:text-gray-500 px-1">✕</button>
                    </div>
                  )}
                </div>
              )
            }

            return (
              <div className="max-w-3xl space-y-4">
                {/* Range tabs */}
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {(['today', 'week', 'month'] as const).map(r => (
                      <button key={r} onClick={() => setCashierRange(r)}
                        className={`px-4 py-1.5 rounded-full text-sm font-semibold border transition-colors ${
                          cashierRange === r ? 'bg-sky-600 text-white border-sky-600' : 'bg-white text-gray-600 border-gray-200 hover:border-sky-300'
                        }`}>
                        {r === 'today' ? 'Today' : r === 'week' ? 'This Week' : 'This Month'}
                      </button>
                    ))}
                    <input
                      type="date"
                      value={cashierCustomDate}
                      max={todayStr}
                      onChange={e => { setCashierCustomDate(e.target.value); setCashierRange('custom') }}
                      className={`px-3 py-1.5 rounded-full text-sm font-semibold border transition-colors focus:outline-none ${
                        cashierRange === 'custom' ? 'bg-sky-600 text-white border-sky-600' : 'bg-white text-gray-600 border-gray-200 hover:border-sky-300'
                      }`}
                    />
                  </div>
                  <button onClick={() => fetchReports()} className="text-xs text-gray-400 hover:text-gray-600 border border-gray-200 rounded-lg px-3 py-1.5">⟳ Refresh</button>
                </div>

                {/* Summary — end of day breakdown */}
                <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
                  {/* Top row: Grand total + unpaid */}
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-3xl font-black text-gray-800">${(totalPaid + totalTips).toFixed(2)}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        ${totalPaid.toFixed(2)} services
                        {totalTips > 0 && <span className="ml-1 text-emerald-500">+ ${totalTips.toFixed(2)} tips</span>}
                        {' · '}{paid.length} paid · {cashierAppts.length} total
                      </p>
                    </div>
                    {totalUnpaid > 0 && (
                      <span className="text-xs font-bold text-rose-500 bg-rose-50 border border-rose-100 px-3 py-1.5 rounded-xl">
                        {totalUnpaid} unpaid
                      </span>
                    )}
                  </div>

                  {/* Divider */}
                  <div className="border-t border-gray-100" />

                  {/* Payment method breakdown */}
                  <div className="grid grid-cols-2 gap-2">
                    {methodBreakdown.map(m => (
                      <div key={m.key} className={`rounded-xl border px-3 py-2.5 ${m.count > 0 ? m.color : 'bg-gray-50 border-gray-100 text-gray-300'}`}>
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-semibold">{m.label}</span>
                          <span className="text-sm font-black">{m.count > 0 ? `$${m.amount.toFixed(2)}` : '—'}</span>
                        </div>
                        {m.count > 0 && (
                          <p className="text-[11px] mt-0.5 opacity-70">
                            {m.count} payment{m.count !== 1 ? 's' : ''}
                            {m.tips > 0 && ` · +$${m.tips.toFixed(2)} tip`}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {reportsLoading ? (
                  <div className="text-center py-16 text-gray-400 text-sm">Loading…</div>
                ) : cashierAppts.length === 0 ? (
                  <div className="text-center py-16 text-gray-400 text-sm">No appointments for this period.</div>
                ) : (
                  <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                    {/* Unpaid section */}
                    {unpaid.length > 0 && (
                      <>
                        <div className="px-4 py-2 bg-rose-50/60 border-b border-rose-100/60">
                          <span className="text-[11px] font-bold uppercase tracking-widest text-rose-400">
                            Unpaid · {unpaid.length} appointment{unpaid.length !== 1 ? 's' : ''}
                          </span>
                        </div>
                        {unpaid.map(a => <ApptRow key={a.id} appt={a} />)}
                      </>
                    )}
                    {/* Paid section */}
                    {paid.length > 0 && (
                      <>
                        <div className={`px-4 py-2 bg-emerald-50/60 border-b border-emerald-100/60 ${unpaid.length > 0 ? 'border-t border-gray-100' : ''}`}>
                          <span className="text-[11px] font-bold uppercase tracking-widest text-emerald-500">
                            Paid · ${totalPaid.toFixed(2)}
                          </span>
                        </div>
                        {paid.map(a => <ApptRow key={a.id} appt={a} />)}
                      </>
                    )}
                  </div>
                )}
              </div>
            )
          })()}

          {/* ── SMS REVIEWS ───────────────────────────────────────────────────── */}
          {tab === 'reviews' && (
            <div>
              <div className="mb-6 flex justify-between items-start">
                <div>
                  <h2 className="text-2xl font-bold text-gray-800 mb-2">SMS Review System</h2>
                  <p className="text-gray-500">Automated review collection & response management</p>
                </div>
                {reviewSettingsMode === 'view' && (
                  <button
                    onClick={() => setReviewSettingsMode('edit')}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
                  >
                    ⚙️ Edit Settings
                  </button>
                )}
              </div>

              {reviewSettingsMode === 'view' ? (
                <>
                  {/* View Mode - Status & Info */}
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
                    <p className="font-medium text-green-900">✅ System Active</p>
                    <p className="text-sm text-green-800 mt-1">SMS Review System is fully configured and ready to use.</p>
                  </div>

                  {/* Current Settings Display */}
                  {reviewSettings && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Templates */}
                      <div className="bg-white rounded-lg border border-gray-200 p-4">
                        <h3 className="font-bold text-gray-800 mb-3">📱 Review Request Message</h3>
                        <div className="bg-gray-50 p-3 rounded text-sm text-gray-700 mb-3 max-h-24 overflow-y-auto">
                          {reviewSettings.review_request_template}
                        </div>
                        <p className="text-xs text-gray-500">Sent to customers asking for rating</p>
                      </div>

                      <div className="bg-white rounded-lg border border-gray-200 p-4">
                        <h3 className="font-bold text-gray-800 mb-3">⭐ Positive Review Message</h3>
                        <div className="bg-gray-50 p-3 rounded text-sm text-gray-700 mb-3 max-h-24 overflow-y-auto">
                          {reviewSettings.positive_response_template}
                        </div>
                        <p className="text-xs text-gray-500">Sent when customer rates 4-5 stars</p>
                      </div>

                      <div className="bg-white rounded-lg border border-gray-200 p-4">
                        <h3 className="font-bold text-gray-800 mb-3">😔 Negative Feedback Message</h3>
                        <div className="bg-gray-50 p-3 rounded text-sm text-gray-700 mb-3 max-h-24 overflow-y-auto">
                          {reviewSettings.feedback_request_template || <span className="text-gray-400 italic">Not set</span>}
                        </div>
                        <p className="text-xs text-gray-500">Sent to customer when they rate 1-3 stars</p>
                      </div>

                      {/* Review Links */}
                      <div className="bg-white rounded-lg border border-gray-200 p-4">
                        <h3 className="font-bold text-gray-800 mb-3">🔗 Google Review Link</h3>
                        <div className="bg-gray-50 p-3 rounded text-sm text-blue-600 mb-3 truncate">
                          {reviewSettings.google_review_url || 'Not set'}
                        </div>
                        <p className="text-xs text-gray-500">Sent in positive review message</p>
                      </div>

                      <div className="bg-white rounded-lg border border-gray-200 p-4">
                        <h3 className="font-bold text-gray-800 mb-3">🔗 Yelp Review Link</h3>
                        <div className="bg-gray-50 p-3 rounded text-sm text-blue-600 mb-3 truncate">
                          {reviewSettings.yelp_business_url || 'Not set'}
                        </div>
                        <p className="text-xs text-gray-500">Sent in positive review message</p>
                      </div>

                      {/* Schedule */}
                      <div className="bg-white rounded-lg border border-gray-200 p-4">
                        <h3 className="font-bold text-gray-800 mb-3">⏰ Review Request Time</h3>
                        <div className="bg-gray-50 p-3 rounded text-sm text-gray-700 mb-3">
                          {String(reviewSettings.review_request_hour).padStart(2, '0')}:{String(reviewSettings.review_request_minute).padStart(2, '0')} daily
                        </div>
                        <p className="text-xs text-gray-500">When SMS is sent to customers</p>
                      </div>

                      {/* Alert Phone */}
                      <div className="bg-white rounded-lg border border-gray-200 p-4">
                        <h3 className="font-bold text-gray-800 mb-3">📞 Admin Alert Phone</h3>
                        <div className="bg-gray-50 p-3 rounded text-sm text-gray-700 mb-3">
                          {reviewSettings.admin_alert_phone || 'Not set'}
                        </div>
                        <p className="text-xs text-gray-500">Alerts for negative reviews</p>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <>
                  {/* Edit Mode */}
                  {reviewSettingsEdit && (
                    <div className="space-y-6">
                      {/* Review Request Template */}
                      <div className="bg-white rounded-lg border border-gray-200 p-6">
                        <label className="block font-bold text-gray-800 mb-2">📱 Review Request Message</label>
                        <textarea
                          value={reviewSettingsEdit.review_request_template || ''}
                          onChange={(e) => setReviewSettingsEdit({ ...reviewSettingsEdit, review_request_template: e.target.value })}
                          className="w-full p-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          rows={3}
                        />
                        <p className="text-xs text-gray-500 mt-2">Message sent to customers asking for rating (1-5)</p>
                      </div>

                      {/* Positive Response Template */}
                      <div className="bg-white rounded-lg border border-gray-200 p-6">
                        <label className="block font-bold text-gray-800 mb-2">⭐ Positive Review Message</label>
                        <textarea
                          value={reviewSettingsEdit.positive_response_template || ''}
                          onChange={(e) => setReviewSettingsEdit({ ...reviewSettingsEdit, positive_response_template: e.target.value })}
                          className="w-full p-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          rows={4}
                        />
                        <p className="text-xs text-gray-500 mt-2">Use {'{google_url}'} and {'{yelp_url}'} as placeholders for review links</p>
                      </div>

                      {/* Negative Feedback Template */}
                      <div className="bg-white rounded-lg border border-gray-200 p-6">
                        <label className="block font-bold text-gray-800 mb-2">😔 Negative Feedback Message</label>
                        <textarea
                          value={reviewSettingsEdit.feedback_request_template || ''}
                          onChange={(e) => setReviewSettingsEdit({ ...reviewSettingsEdit, feedback_request_template: e.target.value })}
                          className="w-full p-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          rows={4}
                        />
                        <p className="text-xs text-gray-500 mt-2">Sent to customer when they rate 1-3 stars. Use {'{client_name}'} as placeholder.</p>
                      </div>

                      {/* Google Review URL */}
                      <div className="bg-white rounded-lg border border-gray-200 p-6">
                        <label className="block font-bold text-gray-800 mb-2">🔗 Google Review Link</label>
                        <input
                          type="text"
                          value={reviewSettingsEdit.google_review_url || ''}
                          onChange={(e) => setReviewSettingsEdit({ ...reviewSettingsEdit, google_review_url: e.target.value })}
                          className="w-full p-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          placeholder="https://g.page/r/..."
                        />
                      </div>

                      {/* Yelp Review URL */}
                      <div className="bg-white rounded-lg border border-gray-200 p-6">
                        <label className="block font-bold text-gray-800 mb-2">🔗 Yelp Review Link</label>
                        <input
                          type="text"
                          value={reviewSettingsEdit.yelp_business_url || ''}
                          onChange={(e) => setReviewSettingsEdit({ ...reviewSettingsEdit, yelp_business_url: e.target.value })}
                          className="w-full p-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          placeholder="https://www.yelp.com/biz/..."
                        />
                      </div>

                      {/* Admin Alert Phone */}
                      <div className="bg-white rounded-lg border border-gray-200 p-6">
                        <label className="block font-bold text-gray-800 mb-2">📞 Admin Alert Phone</label>
                        <input
                          type="text"
                          value={reviewSettingsEdit.admin_alert_phone || ''}
                          onChange={(e) => setReviewSettingsEdit({ ...reviewSettingsEdit, admin_alert_phone: e.target.value })}
                          className="w-full p-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          placeholder="+1949..."
                        />
                        <p className="text-xs text-gray-500 mt-2">Where negative review alerts are sent</p>
                      </div>

                      {/* Review Request Time */}
                      <div className="bg-white rounded-lg border border-gray-200 p-6">
                        <label className="block font-bold text-gray-800 mb-2">⏰ Review Request Time (Daily)</label>
                        <div className="flex gap-3">
                          <div className="flex-1">
                            <label className="text-xs text-gray-600">Hour</label>
                            <input
                              type="number"
                              min="0"
                              max="23"
                              value={reviewSettingsEdit.review_request_hour || 18}
                              onChange={(e) => setReviewSettingsEdit({ ...reviewSettingsEdit, review_request_hour: parseInt(e.target.value) })}
                              className="w-full p-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          </div>
                          <div className="flex-1">
                            <label className="text-xs text-gray-600">Minute</label>
                            <input
                              type="number"
                              min="0"
                              max="59"
                              value={reviewSettingsEdit.review_request_minute || 0}
                              onChange={(e) => setReviewSettingsEdit({ ...reviewSettingsEdit, review_request_minute: parseInt(e.target.value) })}
                              className="w-full p-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Save/Cancel Buttons */}
                      <div className="flex gap-3">
                        <button
                          onClick={async () => {
                            setReviewSettingsSaving(true)
                            try {
                              const res = await fetch('/api/admin/reviews/settings', {
                                method: 'PUT',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify(reviewSettingsEdit)
                              })
                              if (!res.ok) {
                                const error = await res.json()
                                throw new Error(error.error || 'Failed to update settings')
                              }
                              const updated = await res.json()
                              setReviewSettings(updated)
                              setReviewSettingsMode('view')
                              setToast('Settings saved successfully!')
                            } catch (error) {
                              console.error('Settings save error:', error)
                              setToast(`Failed to save settings: ${error instanceof Error ? error.message : 'Unknown error'}`)
                            }
                            setReviewSettingsSaving(false)
                          }}
                          disabled={reviewSettingsSaving}
                          className="flex-1 px-4 py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white rounded-lg font-medium transition-colors"
                        >
                          {reviewSettingsSaving ? '💾 Saving...' : '💾 Save Settings'}
                        </button>
                        <button
                          onClick={() => {
                            setReviewSettingsEdit(reviewSettings)
                            setReviewSettingsMode('view')
                          }}
                          className="flex-1 px-4 py-3 bg-gray-300 hover:bg-gray-400 text-gray-800 rounded-lg font-medium transition-colors"
                        >
                          ❌ Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* ── REPORTS ───────────────────────────────────────────────────── */}
          {tab === 'reports' && (() => {
            // Filter appointments by date range
            const now = salonNow(); if (now.getHours() < 4) now.setDate(now.getDate() - 1) // salon (LA) time
            const todayStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`
            const weekAgo = new Date(now); weekAgo.setDate(now.getDate() - 6)
            const weekAgoStr = `${weekAgo.getFullYear()}-${String(weekAgo.getMonth()+1).padStart(2,'0')}-${String(weekAgo.getDate()).padStart(2,'0')}`
            const monthStart = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`
            const lastMonthStart = now.getMonth() === 0
              ? `${now.getFullYear()-1}-12-01`
              : `${now.getFullYear()}-${String(now.getMonth()).padStart(2,'0')}-01`
            const lastMonthEnd = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`

            // Bi-weekly payroll periods (Sun→Sat, anchor matches groomer dashboard: 2026-05-24)
            const fmtLocalDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
            const PAYROLL_ANCHOR = new Date(2026, 4, 24) // May 24, 2026 (Sunday)
            const PERIOD_DAYS = 14
            const daysSinceAnchor = Math.floor((now.getTime() - PAYROLL_ANCHOR.getTime()) / (1000 * 60 * 60 * 24))
            const periodsElapsed = Math.floor(daysSinceAnchor / PERIOD_DAYS)
            const thisPayrollStart = new Date(PAYROLL_ANCHOR); thisPayrollStart.setDate(PAYROLL_ANCHOR.getDate() + (periodsElapsed - 1) * PERIOD_DAYS)
            const thisPayrollEnd = new Date(thisPayrollStart); thisPayrollEnd.setDate(thisPayrollStart.getDate() + PERIOD_DAYS - 1)
            const lastPayrollStart = new Date(thisPayrollStart); lastPayrollStart.setDate(thisPayrollStart.getDate() - PERIOD_DAYS)
            const lastPayrollEnd = new Date(thisPayrollStart); lastPayrollEnd.setDate(thisPayrollStart.getDate() - 1)
            const thisPayrollStartStr = fmtLocalDate(thisPayrollStart)
            const thisPayrollEndStr = fmtLocalDate(thisPayrollEnd)
            const lastPayrollStartStr = fmtLocalDate(lastPayrollStart)
            const lastPayrollEndStr = fmtLocalDate(lastPayrollEnd)

            // ── Income by groomer chart data (own range selector) ──────────
            const chartInRange = (date: string) => {
              if (incomeChartRange === 'today') return date === todayStr
              if (incomeChartRange === 'week') return date >= weekAgoStr
              if (incomeChartRange === 'this_payroll') return date >= thisPayrollStartStr && date <= thisPayrollEndStr
              return date >= lastPayrollStartStr && date <= lastPayrollEndStr
            }
            const chartByGroomer: Record<string, { revenue: number; tips: number }> = {}
            reportsAppts.forEach(a => {
              if (a.status === 'cancelled' || a.payment_status !== 'paid') return
              if (!chartInRange(a.appointment_date)) return
              const k = a.assigned_groomer || '(Unassigned)'
              if (!chartByGroomer[k]) chartByGroomer[k] = { revenue: 0, tips: 0 }
              chartByGroomer[k].revenue += parseFloat(a.payment_amount || '0')
              chartByGroomer[k].tips += parseFloat(a.tip_amount || '0')
            })
            const chartRows = Object.entries(chartByGroomer)
              .map(([name, v]) => ({ name, ...v, total: v.revenue + v.tips }))
              .sort((a, b) => b.total - a.total)
            const chartStoreTotal = chartRows.reduce((sum, r) => sum + r.total, 0)
            const chartMax = Math.max(...chartRows.map(r => r.total), 1)

            // ── Store monthly revenue across the year (2026) ──
            const REVENUE_YEAR = '2026'
            const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
            const monthlyRevenue = Array.from({ length: 12 }, () => 0)
            reportsAppts.forEach(a => {
              if (a.payment_status !== 'paid') return
              const d = a.appointment_date || ''
              if (!d.startsWith(`${REVENUE_YEAR}-`)) return
              if (revenueChartGroomer && a.assigned_groomer !== revenueChartGroomer) return
              const m = parseInt(d.slice(5, 7), 10) - 1
              if (m >= 0 && m < 12) monthlyRevenue[m] += parseFloat(a.payment_amount || '0')
            })
            const monthlyMax = Math.max(...monthlyRevenue, 1)
            const yearRevenueTotal = monthlyRevenue.reduce((s, v) => s + v, 0)
            const monthsWithRevenue = monthlyRevenue.filter(v => v > 0).length
            const bestMonthIdx = monthlyRevenue.indexOf(Math.max(...monthlyRevenue))
            const revGroomerLabel = revenueChartGroomer || 'All groomers'

            // ── Store monthly tips across the year (2026), optionally per groomer ──
            const monthlyTips = Array.from({ length: 12 }, () => 0)
            const monthlyTipBase = Array.from({ length: 12 }, () => 0) // paid revenue, for tip-rate %
            reportsAppts.forEach(a => {
              const d = a.appointment_date || ''
              if (!d.startsWith(`${REVENUE_YEAR}-`)) return
              if (tipsChartGroomer && a.assigned_groomer !== tipsChartGroomer) return
              const m = parseInt(d.slice(5, 7), 10) - 1
              if (m < 0 || m > 11) return
              if (a.payment_status === 'paid') {
                monthlyTips[m] += parseFloat(a.tip_amount || '0')
                monthlyTipBase[m] += parseFloat(a.payment_amount || '0')
              }
            })
            const monthlyTipsMax = Math.max(...monthlyTips, 1)
            const yearTipsTotal = monthlyTips.reduce((s, v) => s + v, 0)
            const yearTipBaseTotal = monthlyTipBase.reduce((s, v) => s + v, 0)
            const yearTipRate = yearTipBaseTotal > 0 ? (yearTipsTotal / yearTipBaseTotal) * 100 : 0
            const bestTipMonthIdx = monthlyTips.indexOf(Math.max(...monthlyTips))
            const tipGroomerLabel = tipsChartGroomer || 'All groomers'

            // ── Performance: single-groomer detail (own range selector) ────
            const groomerNames = Array.from(new Set(
              reportsAppts.map(a => a.assigned_groomer).filter((n): n is string => !!n)
            )).sort()
            const activePerfGroomer = perfGroomer || groomerNames[0] || ''
            const perfInRange = (date: string) => {
              if (perfRange === 'today') return date === todayStr
              if (perfRange === 'week') return date >= weekAgoStr
              if (perfRange === 'this_payroll') return date >= thisPayrollStartStr && date <= thisPayrollEndStr
              if (perfRange === 'last_payroll') return date >= lastPayrollStartStr && date <= lastPayrollEndStr
              if (perfRange === 'month') return date >= monthStart
              return date >= lastMonthStart && date < lastMonthEnd
            }
            const perfAppts = reportsAppts
              .filter(a => a.status !== 'cancelled' && a.assigned_groomer === activePerfGroomer && perfInRange(a.appointment_date))
              .sort((a, b) => a.appointment_date.localeCompare(b.appointment_date) || a.appointment_time.localeCompare(b.appointment_time))
            const perfPaid = perfAppts.filter(a => a.payment_status === 'paid')
            const perfRevenue = perfPaid.reduce((s, a) => s + parseFloat(a.payment_amount || '0'), 0)
            const perfTips = perfPaid.reduce((s, a) => s + parseFloat(a.tip_amount || '0'), 0)
            const perfStaff = staff.find(s => {
              const fullName = s.first_name ? `${s.first_name} ${s.last_name || ''}`.trim() : s.name
              return fullName === activePerfGroomer || s.name === activePerfGroomer
            })
            const perfCommPct = perfStaff?.commission_percent ?? 0
            const perfCommission = perfRevenue * perfCommPct / 100
            const perfRangeLabel: Record<string, string> = { today: 'Today', week: 'This Week', this_payroll: 'This Pay', last_payroll: 'Last Pay', month: 'This Month', last_month: 'Last Month' }

            const inRange = (date: string) => {
              if (reportsRange === 'today') return date === todayStr
              if (reportsRange === 'week') return date >= weekAgoStr
              if (reportsRange === 'this_payroll') return date >= thisPayrollStartStr && date <= thisPayrollEndStr
              if (reportsRange === 'last_payroll') return date >= lastPayrollStartStr && date <= lastPayrollEndStr
              if (reportsRange === 'month') return date >= monthStart
              if (reportsRange === 'last_month') return date >= lastMonthStart && date < lastMonthEnd
              if (reportsRange === 'custom') {
                if (reportsCustomStart && date < reportsCustomStart) return false
                if (reportsCustomEnd && date > reportsCustomEnd) return false
                return true
              }
              return true
            }

            const rangeAppts = reportsAppts.filter(a => {
              if (a.payment_status !== 'paid') return false
              return inRange(a.appointment_date)
            })

            // Group by assigned_groomer name
            const groomerMap: Record<string, { name: string; appts: Appointment[] }> = {}
            rangeAppts.forEach(a => {
              const key = a.assigned_groomer || '(Unassigned)'
              if (!groomerMap[key]) groomerMap[key] = { name: key, appts: [] }
              groomerMap[key].appts.push(a)
            })

            // Build rows
            const rows = Object.values(groomerMap).map(g => {
              const revenue = g.appts.reduce((sum, a) => sum + parseFloat(a.payment_amount || '0'), 0)
              const tips = g.appts.reduce((sum, a) => sum + parseFloat(a.tip_amount || '0'), 0)
              // Find matching staff member for commission %
              const staffMatch = staff.find(s => {
                const fullName = s.first_name ? `${s.first_name} ${s.last_name || ''}`.trim() : s.name
                return fullName === g.name || s.name === g.name
              })
              const commissionPct = staffMatch?.commission_percent ?? 0
              const tipPct = staffMatch?.tip_percent ?? 0
              const commission = revenue * commissionPct / 100
              const tipEarned = tips * tipPct / 100
              return { name: g.name, count: g.appts.length, revenue, tips, commissionPct, tipPct, commission, tipEarned }
            }).sort((a, b) => b.revenue - a.revenue)

            const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0)
            const totalTips = rows.reduce((s, r) => s + r.tips, 0)
            const totalAppts = rows.reduce((s, r) => s + r.count, 0)

            const rangeLabelMap: Record<string, string> = {
              today: 'Today', week: 'This Week',
              this_payroll: `This Pay (${thisPayrollStartStr} → ${thisPayrollEndStr})`,
              last_payroll: `Last Pay (${lastPayrollStartStr} → ${lastPayrollEndStr})`,
              month: 'This Month', last_month: 'Last Month', all: 'All Time',
              custom: reportsCustomStart && reportsCustomEnd ? `${reportsCustomStart} → ${reportsCustomEnd}` : 'Custom Range'
            }

            // ── Excel export ────────────────────────────────────────────────
            const exportToExcel = async () => {
              const XLSX = await import('xlsx')
              const methodLabelsLocal: Record<string, string> = { cash: 'Cash', card: 'Credit Card', zelle: 'Zelle', venmo: 'Venmo', check: 'Check' }

              // Sheet 1: Transaction detail (all appts in range)
              const detailRows = allRangeAppts
                .slice()
                .sort((a, b) => a.appointment_date.localeCompare(b.appointment_date) || a.appointment_time.localeCompare(b.appointment_time))
                .map(a => {
                  const [h, m] = (a.appointment_time || '').split(':')
                  const hour = parseInt(h || '0')
                  const timeStr = `${hour % 12 || 12}:${m || '00'} ${hour >= 12 ? 'PM' : 'AM'}`
                  return {
                    Date: a.appointment_date,
                    Time: timeStr,
                    'Client Name': a.clients?.name ?? '',
                    'Pet Name': a.pets?.name ?? '',
                    Service: serviceMap[a.service] ?? a.service ?? '',
                    Groomer: a.assigned_groomer ?? '',
                    'Payment Method': a.payment_status === 'paid' ? (methodLabelsLocal[a.payment_method || ''] || a.payment_method || '') : 'Unpaid',
                    'Amount ($)': a.payment_status === 'paid' ? parseFloat(a.payment_amount || '0') : 0,
                    'Tip ($)': parseFloat(a.tip_amount || '0'),
                    'Total ($)': (a.payment_status === 'paid' ? parseFloat(a.payment_amount || '0') : 0) + parseFloat(a.tip_amount || '0'),
                    Status: a.payment_status === 'paid' ? 'Paid' : 'Unpaid',
                  }
                })

              // Sheet 2: Payment method summary
              const methodSummary = (['cash', 'card', 'zelle', 'venmo', 'check', 'unpaid'] as const).map(m => {
                const appts = allRangeAppts.filter(a =>
                  m === 'unpaid' ? a.payment_status !== 'paid' : (a.payment_status === 'paid' && a.payment_method === m)
                )
                return {
                  'Payment Method': m === 'unpaid' ? 'Unpaid' : methodLabelsLocal[m],
                  'Appointments': appts.length,
                  'Revenue ($)': appts.reduce((s, a) => s + parseFloat(a.payment_amount || '0'), 0),
                  'Tips ($)': appts.reduce((s, a) => s + parseFloat(a.tip_amount || '0'), 0),
                }
              }).filter(r => r.Appointments > 0)

              // Sheet 3: Per-groomer summary
              const groomerSummaryRows = rows.map(r => ({
                Groomer: r.name,
                Appointments: r.count,
                'Revenue ($)': r.revenue,
                [`Commission (${r.commissionPct}%) ($)`]: r.commission,
                'Tips Collected ($)': r.tips,
                [`Tip Share (${r.tipPct}%) ($)`]: r.tipEarned,
                'Total Pay ($)': r.commission + r.tipEarned,
              }))

              const wb = XLSX.utils.book_new()
              XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detailRows), 'Transactions')
              XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(methodSummary), 'Payment Methods')
              XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(groomerSummaryRows), 'Groomer Pay')

              const label = reportsRange === 'custom'
                ? `${reportsCustomStart}-to-${reportsCustomEnd}`
                : reportsRange
              XLSX.writeFile(wb, `kokoni-report-${label}.xlsx`)
            }

            // ── Range payment breakdown ──────────────────────────────────────
            // All appointments in range (paid + unpaid/completed) for full picture
            const allRangeAppts = reportsAppts.filter(a => inRange(a.appointment_date))
            const rangeMethodTotals: Record<string, { count: number; amount: number; tips: number }> = {
              cash: { count: 0, amount: 0, tips: 0 }, card: { count: 0, amount: 0, tips: 0 },
              zelle: { count: 0, amount: 0, tips: 0 }, venmo: { count: 0, amount: 0, tips: 0 },
              check: { count: 0, amount: 0, tips: 0 }, unpaid: { count: 0, amount: 0, tips: 0 },
            }
            allRangeAppts.forEach(a => {
              const key = (a.payment_status === 'paid' && a.payment_method) ? a.payment_method : 'unpaid'
              if (!rangeMethodTotals[key]) rangeMethodTotals[key] = { count: 0, amount: 0, tips: 0 }
              rangeMethodTotals[key].count += 1
              rangeMethodTotals[key].amount += parseFloat(a.payment_amount || '0')
              rangeMethodTotals[key].tips += parseFloat(a.tip_amount || '0')
            })
            return (
              <div className="space-y-5">
                {/* Date range selector */}
                <div className="bg-white rounded-2xl border border-gray-200 p-4 space-y-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    {(['today', 'this_payroll', 'last_payroll', 'month', 'custom'] as const).map(r => (
                      <button
                        key={r}
                        onClick={() => setReportsRange(r)}
                        className={`px-4 py-1.5 rounded-full text-sm font-semibold border transition-colors ${reportsRange === r ? 'bg-sky-600 text-white border-sky-600' : 'bg-white text-gray-600 border-gray-200 hover:border-sky-300'}`}
                      >
                        {r === 'today' ? 'Today' : r === 'this_payroll' ? '💵 This Pay' : r === 'last_payroll' ? '💵 Last Pay' : r === 'month' ? 'This Month' : '📅 Custom'}
                      </button>
                    ))}
                    <div className="ml-auto flex items-center gap-2">
                      <button
                        onClick={exportToExcel}
                        className="flex items-center gap-1.5 px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-full transition-colors"
                      >
                        ⬇️ Export Excel
                      </button>
                      <button onClick={() => fetchReports()} className="text-sm text-sky-600 hover:text-sky-800 font-medium">↻</button>
                    </div>
                  </div>
                  {reportsRange === 'custom' && (
                    <div className="flex items-center gap-3 flex-wrap pt-1">
                      <div className="flex items-center gap-2">
                        <label className="text-xs font-semibold text-gray-500">From</label>
                        <input
                          type="date"
                          value={reportsCustomStart}
                          onChange={e => setReportsCustomStart(e.target.value)}
                          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="text-xs font-semibold text-gray-500">To</label>
                        <input
                          type="date"
                          value={reportsCustomEnd}
                          onChange={e => setReportsCustomEnd(e.target.value)}
                          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm"
                        />
                      </div>
                      {reportsCustomStart && reportsCustomEnd && (
                        <span className="text-xs text-gray-400">{allRangeAppts.length} appointments in range</span>
                      )}
                    </div>
                  )}
                </div>

                {reportsLoading ? (
                  <div className="text-center py-12 text-gray-400">Loading reports…</div>
                ) : (
                  <>
                    {/* Summary cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div className="bg-sky-50 rounded-2xl p-5 border border-sky-100">
                        <p className="text-3xl font-bold text-sky-700">${totalRevenue.toFixed(2)}</p>
                        <p className="text-sm text-sky-600 font-medium mt-1">Total Revenue</p>
                        <p className="text-xs text-sky-400 mt-0.5">{rangeLabelMap[reportsRange]}</p>
                      </div>
                      <div className="bg-emerald-50 rounded-2xl p-5 border border-emerald-100">
                        <p className="text-3xl font-bold text-emerald-700">${totalTips.toFixed(2)}</p>
                        <p className="text-sm text-emerald-600 font-medium mt-1">Total Tips</p>
                        <p className="text-xs text-emerald-400 mt-0.5">{rangeLabelMap[reportsRange]}</p>
                      </div>
                      <div className="bg-violet-50 rounded-2xl p-5 border border-violet-100">
                        <p className="text-3xl font-bold text-violet-700">{totalAppts}</p>
                        <p className="text-sm text-violet-600 font-medium mt-1">Paid Appointments</p>
                        <p className="text-xs text-violet-400 mt-0.5">{rangeLabelMap[reportsRange]}</p>
                      </div>
                    </div>

                    {/* Payment breakdown for range */}
                    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                      <div className="px-5 py-4 border-b border-gray-100 bg-gray-50">
                        <h3 className="font-bold text-gray-800">Payment Breakdown</h3>
                        <p className="text-xs text-gray-400 mt-0.5">{rangeLabelMap[reportsRange]}</p>
                      </div>
                      <div className="px-5 py-4">
                        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                          {(['cash', 'card', 'zelle', 'venmo', 'check'] as const).map(m => {
                            const colors: Record<string, string> = {
                              cash: 'bg-emerald-50 border-emerald-100 text-emerald-700',
                              card: 'bg-sky-50 border-sky-100 text-sky-700',
                              zelle: 'bg-violet-50 border-violet-100 text-violet-700',
                              venmo: 'bg-blue-50 border-blue-100 text-blue-700',
                              check: 'bg-gray-50 border-gray-100 text-gray-700',
                            }
                            const labels: Record<string, string> = { cash: 'Cash', card: 'Credit Card', zelle: 'Zelle', venmo: 'Venmo', check: 'Check' }
                            const t = rangeMethodTotals[m]
                            return (
                              <div key={m} className={`rounded-xl border px-3 py-2.5 ${colors[m]} ${t.count === 0 ? 'opacity-30' : ''}`}>
                                <p className="text-base font-bold">${t.amount.toFixed(2)}</p>
                                <p className="text-[11px] font-semibold mt-0.5">{labels[m]}</p>
                                <p className="text-[10px] opacity-70">{t.count} appt{t.count !== 1 ? 's' : ''}</p>
                                {t.tips > 0 && <p className="text-[10px] opacity-70">+${t.tips.toFixed(2)} tips</p>}
                              </div>
                            )
                          })}
                          <div className={`rounded-xl border px-3 py-2.5 bg-rose-50 border-rose-100 text-rose-700 ${rangeMethodTotals['unpaid'].count === 0 ? 'opacity-30' : ''}`}>
                            <p className="text-base font-bold">{rangeMethodTotals['unpaid'].count}</p>
                            <p className="text-[11px] font-semibold mt-0.5">Unpaid</p>
                            <p className="text-[10px] opacity-70">appt{rangeMethodTotals['unpaid'].count !== 1 ? 's' : ''}</p>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* ── PERFORMANCE (single groomer detail) ───────────────── */}
                    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                      <div className="px-5 py-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between gap-3 flex-wrap">
                        <h3 className="font-bold text-gray-800">📋 Groomer Report</h3>
                        <div className="flex items-center gap-2">
                          <select
                            value={activePerfGroomer}
                            onChange={e => setPerfGroomer(e.target.value)}
                            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm font-semibold text-gray-600 bg-white"
                          >
                            {groomerNames.length === 0 && <option value="">No groomers</option>}
                            {groomerNames.map(n => <option key={n} value={n}>✂️ {n}</option>)}
                          </select>
                          <select
                            value={perfRange}
                            onChange={e => setPerfRange(e.target.value as typeof perfRange)}
                            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm font-semibold text-gray-600 bg-white"
                          >
                            <option value="today">Today</option>
                            <option value="week">This Week</option>
                            <option value="this_payroll">This Pay</option>
                            <option value="last_payroll">Last Pay</option>
                            <option value="month">This Month</option>
                            <option value="last_month">Last Month</option>
                          </select>
                          <button
                            onClick={async () => {
                              const XLSX = await import('xlsx')
                              const rows = perfAppts.map(a => ({
                                Date: a.appointment_date,
                                Time: a.appointment_time,
                                Pet: a.pets?.name ?? '',
                                Client: a.clients?.name ?? '',
                                Service: serviceMap[a.service] ?? a.service ?? '',
                                Status: a.payment_status === 'paid' ? 'Paid' : 'Unpaid',
                                Method: a.payment_method ?? '',
                                Amount: a.payment_status === 'paid' ? parseFloat(a.payment_amount || '0') : 0,
                                Tip: a.payment_status === 'paid' ? parseFloat(a.tip_amount || '0') : 0,
                              }))
                              rows.push({ Date: '', Time: '', Pet: '', Client: '', Service: 'TOTAL', Status: '', Method: '', Amount: perfRevenue, Tip: perfTips } as typeof rows[number])
                              rows.push({ Date: '', Time: '', Pet: '', Client: '', Service: `Commission (${perfCommPct}%)`, Status: '', Method: '', Amount: perfCommission, Tip: 0 } as typeof rows[number])
                              const ws = XLSX.utils.json_to_sheet(rows)
                              const wb = XLSX.utils.book_new()
                              XLSX.utils.book_append_sheet(wb, ws, 'Groomer Report')
                              XLSX.writeFile(wb, `groomer-report-${activePerfGroomer || 'all'}-${perfRange}.xlsx`)
                            }}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-lg transition-colors whitespace-nowrap"
                          >
                            ⬇️ Export Excel
                          </button>
                        </div>
                      </div>
                      <div className="px-5 py-4">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
                          <div className="bg-gray-50 rounded-xl p-3">
                            <p className="text-xs text-gray-500">Appointments</p>
                            <p className="text-xl font-bold text-gray-800">{perfAppts.length}</p>
                          </div>
                          <div className="bg-gray-50 rounded-xl p-3">
                            <p className="text-xs text-gray-500">Revenue</p>
                            <p className="text-xl font-bold text-gray-800">${perfRevenue.toFixed(2)}</p>
                          </div>
                          <div className="bg-gray-50 rounded-xl p-3">
                            <p className="text-xs text-gray-500">Tips</p>
                            <p className="text-xl font-bold text-gray-800">${perfTips.toFixed(2)}</p>
                          </div>
                          <div className="bg-violet-50 rounded-xl p-3">
                            <p className="text-xs text-violet-500">Commission ({perfCommPct}%)</p>
                            <p className="text-xl font-bold text-violet-700">${perfCommission.toFixed(2)}</p>
                          </div>
                        </div>
                        {perfAppts.length === 0 ? (
                          <p className="text-sm text-gray-400 text-center py-4">No appointments for {activePerfGroomer || 'this groomer'} · {perfRangeLabel[perfRange]}.</p>
                        ) : (
                          <div className="divide-y divide-gray-100">
                            {perfAppts.map(a => {
                              const tStr = (() => {
                                const t = a.appointment_time
                                if (t.toUpperCase().includes('AM') || t.toUpperCase().includes('PM')) return t.trim()
                                const [h, m] = t.split(':'); const hr = parseInt(h)
                                return `${hr % 12 || 12}:${m} ${hr >= 12 ? 'PM' : 'AM'}`
                              })()
                              const isPaid = a.payment_status === 'paid'
                              return (
                                <div key={a.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                                  <div className="flex items-baseline gap-3 min-w-0">
                                    <span className="text-xs text-gray-400 w-16 shrink-0">{tStr}</span>
                                    <span className="truncate">
                                      <span className="font-semibold text-gray-700">{a.pets?.name ?? 'Pet'}</span>
                                      <span className="text-gray-400 text-xs ml-1.5">{serviceMap[a.service] ?? a.service}</span>
                                    </span>
                                  </div>
                                  {isPaid ? (
                                    <span className="text-gray-600 whitespace-nowrap">
                                      ${parseFloat(a.payment_amount || '0').toFixed(2)} {a.payment_method}
                                      {parseFloat(a.tip_amount || '0') > 0 && <span className="text-emerald-600"> +${parseFloat(a.tip_amount || '0').toFixed(2)} tip</span>}
                                    </span>
                                  ) : (
                                    <span className="text-xs font-semibold text-rose-500 bg-rose-50 px-2 py-0.5 rounded-full whitespace-nowrap">Unpaid</span>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* ── INCOME BY GROOMER CHART ───────────────────────────── */}
                    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                      <div className="px-5 py-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between gap-3 flex-wrap">
                        <div>
                          <h3 className="font-bold text-gray-800">📊 Performance</h3>
                          <p className="text-xs text-gray-400 mt-0.5">Service revenue + tips · store total ${chartStoreTotal.toFixed(2)}</p>
                        </div>
                        <select
                          value={incomeChartRange}
                          onChange={e => setIncomeChartRange(e.target.value as typeof incomeChartRange)}
                          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm font-semibold text-gray-600 bg-white"
                        >
                          <option value="today">Today</option>
                          <option value="week">This Week</option>
                          <option value="this_payroll">This Pay</option>
                          <option value="last_payroll">Last Pay</option>
                        </select>
                      </div>
                      <div className="px-5 py-4">
                        {chartRows.length === 0 ? (
                          <p className="text-sm text-gray-400 text-center py-4">No paid appointments in this period.</p>
                        ) : (
                          <>
                            {chartRows.map(r => (
                              <div key={r.name} className="mb-3 last:mb-0">
                                <div className="flex items-center justify-between text-sm mb-1">
                                  <span className="font-semibold text-gray-700">✂️ {r.name}</span>
                                  <span className="text-gray-500">
                                    ${r.total.toFixed(2)}
                                    <span className="text-gray-300 mx-1">·</span>
                                    <span className="text-gray-400">{chartStoreTotal > 0 ? Math.round(r.total / chartStoreTotal * 100) : 0}% of store</span>
                                  </span>
                                </div>
                                <div className="flex h-6 rounded-lg overflow-hidden bg-gray-50">
                                  <div className="bg-sky-500" style={{ width: `${(r.revenue / chartMax) * 100}%` }} />
                                  <div className="bg-emerald-400" style={{ width: `${(r.tips / chartMax) * 100}%` }} />
                                </div>
                              </div>
                            ))}
                            <div className="flex items-center gap-4 mt-3 text-xs text-gray-500">
                              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-sky-500 inline-block" />Service revenue</span>
                              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-400 inline-block" />Tips</span>
                            </div>
                          </>
                        )}
                      </div>
                    </div>

                    {/* ── STORE MONTHLY REVENUE (YEAR) ──────────────────────── */}
                    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                      <div className="px-5 py-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between gap-3 flex-wrap">
                        <div>
                          <h3 className="font-bold text-gray-800">📈 Monthly Revenue · {REVENUE_YEAR}</h3>
                          <p className="text-xs text-gray-400 mt-0.5">
                            {revGroomerLabel} · {REVENUE_YEAR} total ${yearRevenueTotal.toFixed(2)}
                            {yearRevenueTotal > 0 && <> · best {MONTH_LABELS[bestMonthIdx]} ${monthlyRevenue[bestMonthIdx].toFixed(0)}</>}
                            {monthsWithRevenue > 0 && <> · avg ${(yearRevenueTotal / monthsWithRevenue).toFixed(0)}/active mo</>}
                          </p>
                        </div>
                        <select
                          value={revenueChartGroomer}
                          onChange={e => setRevenueChartGroomer(e.target.value)}
                          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm font-semibold text-gray-600 bg-white"
                        >
                          <option value="">All groomers (store)</option>
                          {groomerNames.map(n => (
                            <option key={n} value={n}>{n}</option>
                          ))}
                        </select>
                      </div>
                      <div className="px-5 py-5">
                        {yearRevenueTotal === 0 ? (
                          <p className="text-sm text-gray-400 text-center py-4">No paid revenue recorded for {revGroomerLabel} in {REVENUE_YEAR} yet.</p>
                        ) : (
                          <>
                            <div className="flex items-end gap-1.5 h-44">
                              {monthlyRevenue.map((v, i) => (
                                <div key={i} className="flex-1 flex flex-col items-center justify-end h-full">
                                  <span className="text-[9px] font-semibold text-gray-400 mb-1 leading-none">{v > 0 ? `$${Math.round(v)}` : ''}</span>
                                  <div
                                    className={`w-full rounded-t-md transition-all ${i === bestMonthIdx ? 'bg-sky-600' : 'bg-sky-400'} hover:bg-sky-700`}
                                    style={{ height: `${v > 0 ? Math.max((v / monthlyMax) * 88, 2) : 0}%` }}
                                    title={`${MONTH_LABELS[i]} ${REVENUE_YEAR}: $${v.toFixed(2)}`}
                                  />
                                </div>
                              ))}
                            </div>
                            <div className="flex gap-1.5 mt-1.5">
                              {MONTH_LABELS.map((m, i) => (
                                <span key={i} className={`flex-1 text-center text-[10px] ${i === bestMonthIdx ? 'text-sky-600 font-bold' : 'text-gray-400'}`}>{m}</span>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    </div>

                    {/* ── STORE MONTHLY TIPS (YEAR) · per-groomer ──────────────── */}
                    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                      <div className="px-5 py-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between gap-3 flex-wrap">
                        <div>
                          <h3 className="font-bold text-gray-800">💸 Monthly Tips · {REVENUE_YEAR}</h3>
                          <p className="text-xs text-gray-400 mt-0.5">
                            {tipGroomerLabel} · {REVENUE_YEAR} tips ${yearTipsTotal.toFixed(2)}
                            <span className="text-emerald-500 font-semibold"> · tip rate {yearTipRate.toFixed(1)}%</span>
                          </p>
                        </div>
                        <select
                          value={tipsChartGroomer}
                          onChange={e => setTipsChartGroomer(e.target.value)}
                          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm font-semibold text-gray-600 bg-white"
                        >
                          <option value="">All groomers (store)</option>
                          {groomerNames.map(n => (
                            <option key={n} value={n}>{n}</option>
                          ))}
                        </select>
                      </div>
                      <div className="px-5 py-5">
                        {yearTipsTotal === 0 ? (
                          <p className="text-sm text-gray-400 text-center py-4">No tips recorded for {tipGroomerLabel} in {REVENUE_YEAR} yet.</p>
                        ) : (
                          <>
                            <div className="flex items-end gap-1.5 h-44">
                              {monthlyTips.map((v, i) => {
                                const rate = monthlyTipBase[i] > 0 ? (v / monthlyTipBase[i]) * 100 : 0
                                return (
                                  <div key={i} className="flex-1 flex flex-col items-center justify-end h-full">
                                    <span className="text-[9px] font-semibold text-emerald-500 mb-1 leading-none">{v > 0 ? `${rate.toFixed(0)}%` : ''}</span>
                                    <div
                                      className={`w-full rounded-t-md transition-all ${i === bestTipMonthIdx ? 'bg-emerald-600' : 'bg-emerald-400'} hover:bg-emerald-700`}
                                      style={{ height: `${v > 0 ? Math.max((v / monthlyTipsMax) * 88, 2) : 0}%` }}
                                      title={`${MONTH_LABELS[i]} ${REVENUE_YEAR}: $${v.toFixed(2)} tips · ${rate.toFixed(1)}% of revenue`}
                                    />
                                  </div>
                                )
                              })}
                            </div>
                            <div className="flex gap-1.5 mt-1.5">
                              {MONTH_LABELS.map((m, i) => (
                                <span key={i} className={`flex-1 text-center text-[10px] ${i === bestTipMonthIdx ? 'text-emerald-600 font-bold' : 'text-gray-400'}`}>{m}</span>
                              ))}
                            </div>
                            <p className="text-[11px] text-gray-400 mt-3">Bars show monthly tips; the % above each bar is tips ÷ paid revenue for that month.</p>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Detail report toggle */}
                    <button
                      onClick={() => setReportsShowDetails(v => !v)}
                      className="w-full flex items-center justify-center gap-2 py-2.5 rounded-2xl border-2 border-dashed border-gray-200 text-sm font-semibold text-gray-500 hover:border-sky-300 hover:text-sky-600 transition-colors"
                    >
                      {reportsShowDetails ? '▲ Hide detail report' : '▼ Show detail report'}
                    </button>

                    {reportsShowDetails && (<>
                    {/* ── PET COUNT SUMMARY ──────────────────────────────────── */}
                    {(() => {
                      const allPetsInRange = allRangeAppts.length
                      const paidPetsInRange = allRangeAppts.filter(a => a.payment_status === 'paid').length
                      const unpaidPetsInRange = allRangeAppts.filter(a => a.payment_status !== 'paid').length
                      const uniqueClients = new Set(allRangeAppts.map(a => a.client_phone)).size
                      const uniquePets = new Set(allRangeAppts.filter(a => a.pets?.name).map(a => a.pet_id || a.pets?.name)).size
                      const avgSpend = paidPetsInRange > 0 ? totalRevenue / paidPetsInRange : 0
                      // New vs returning clients
                      const clientFirstAppt: Record<string, string> = {}
                      reportsAppts.forEach(a => {
                        if (!clientFirstAppt[a.client_phone] || a.appointment_date < clientFirstAppt[a.client_phone]) {
                          clientFirstAppt[a.client_phone] = a.appointment_date
                        }
                      })
                      const rangeStart = reportsRange === 'week' ? weekAgoStr : reportsRange === 'this_payroll' ? thisPayrollStartStr : reportsRange === 'last_payroll' ? lastPayrollStartStr : reportsRange === 'month' ? monthStart : '2000-01-01'
                      const newClients = allRangeAppts.filter(a => clientFirstAppt[a.client_phone] >= rangeStart)
                      const newClientCount = new Set(newClients.map(a => a.client_phone)).size

                      return (
                        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                          <div className="px-5 py-4 border-b border-gray-100 bg-amber-50/60">
                            <h3 className="font-bold text-gray-800">🐾 Pet Count Summary</h3>
                            <p className="text-xs text-gray-400 mt-0.5">{rangeLabelMap[reportsRange]}</p>
                          </div>
                          <div className="px-5 py-4">
                            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                              <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-center">
                                <p className="text-2xl font-black text-amber-700">{allPetsInRange}</p>
                                <p className="text-[11px] font-semibold text-amber-600 mt-1">Total Pets</p>
                              </div>
                              <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-center">
                                <p className="text-2xl font-black text-emerald-700">{paidPetsInRange}</p>
                                <p className="text-[11px] font-semibold text-emerald-600 mt-1">Paid</p>
                              </div>
                              <div className="rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-center">
                                <p className="text-2xl font-black text-rose-600">{unpaidPetsInRange}</p>
                                <p className="text-[11px] font-semibold text-rose-500 mt-1">Unpaid</p>
                              </div>
                              <div className="rounded-xl border border-violet-100 bg-violet-50 px-4 py-3 text-center">
                                <p className="text-2xl font-black text-violet-700">{newClientCount}</p>
                                <p className="text-[11px] font-semibold text-violet-600 mt-1">New Clients</p>
                              </div>
                              <div className="rounded-xl border border-sky-100 bg-sky-50 px-4 py-3 text-center">
                                <p className="text-2xl font-black text-sky-700">${avgSpend.toFixed(0)}</p>
                                <p className="text-[11px] font-semibold text-sky-600 mt-1">Avg / Pet</p>
                              </div>
                            </div>
                            <div className="mt-3 flex items-center gap-4 text-xs text-gray-400">
                              <span>{uniqueClients} unique client{uniqueClients !== 1 ? 's' : ''}</span>
                              <span>{uniquePets} unique pet{uniquePets !== 1 ? 's' : ''}</span>
                            </div>
                          </div>
                        </div>
                      )
                    })()}

                    {/* ── BREED TRACKER ─────────────────────────────────────── */}
                    {(() => {
                      const breedCount: Record<string, { count: number; revenue: number; pets: Set<string> }> = {}
                      allRangeAppts.forEach(a => {
                        const breed = a.pets?.breed || 'Unknown'
                        if (!breedCount[breed]) breedCount[breed] = { count: 0, revenue: 0, pets: new Set() }
                        breedCount[breed].count += 1
                        if (a.payment_status === 'paid') {
                          breedCount[breed].revenue += parseFloat(a.payment_amount || '0')
                        }
                        if (a.pets?.name) breedCount[breed].pets.add(a.pets.name)
                      })
                      const breedRows = Object.entries(breedCount)
                        .map(([breed, v]) => ({ breed, ...v, uniquePets: v.pets.size }))
                        .sort((a, b) => b.count - a.count)
                        .slice(0, 15)

                      return breedRows.length > 0 ? (
                        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                          <div className="px-5 py-4 border-b border-gray-100 bg-pink-50/60">
                            <h3 className="font-bold text-gray-800">🐕 Top Breeds</h3>
                            <p className="text-xs text-gray-400 mt-0.5">{rangeLabelMap[reportsRange]} · Top {breedRows.length} breeds</p>
                          </div>
                          <div className="px-5 py-4">
                            <div className="flex flex-wrap gap-2">
                              {breedRows.map(row => (
                                <div key={row.breed} className="flex items-center gap-2 bg-gray-50 border border-gray-100 rounded-xl px-3 py-2">
                                  <span className="text-sm font-semibold text-gray-700">{row.breed}</span>
                                  <span className="text-xs font-bold text-white bg-pink-400 rounded-full w-6 h-6 flex items-center justify-center">{row.count}</span>
                                  {row.revenue > 0 && <span className="text-xs text-gray-400">${row.revenue.toFixed(0)}</span>}
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      ) : null
                    })()}
                    </>)}

                  </>
                )}
              </div>
            )
          })()}

          {/* ── CALENDAR ─────────────────────────────────────────────────── */}
          {tab === 'calendar' && (() => {
            const [year, month] = calendarMonth.split('-').map(Number)
            const firstDay = new Date(year, month-1, 1).getDay()
            const daysInMonth = new Date(year, month, 0).getDate()
            const _td = new Date(); const today = `${_td.getFullYear()}-${String(_td.getMonth()+1).padStart(2,'0')}-${String(_td.getDate()).padStart(2,'0')}`
            const monthName = new Date(year, month-1).toLocaleDateString('en-US',{month:'long',year:'numeric'})
            const byDate: Record<string, Appointment[]> = {}
            calendarAppts.forEach(a => { if(!byDate[a.appointment_date]) byDate[a.appointment_date]=[]; byDate[a.appointment_date].push(a) })
            const prevMonth = () => { const d=new Date(year,month-2); setCalendarMonth(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`); setSelectedDay(null) }
            const nextMonth = () => { const d=new Date(year,month); setCalendarMonth(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`); setSelectedDay(null) }
            const totalCells = Math.ceil((firstDay+daysInMonth)/7)*7
            return (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <button onClick={prevMonth} className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-200 text-gray-600 text-xl font-bold">‹</button>
                    <h2 className="font-bold text-gray-800 text-xl">{monthName}</h2>
                    <button onClick={nextMonth} className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-200 text-gray-600 text-xl font-bold">›</button>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="hidden sm:flex items-center gap-3 text-xs font-medium">
                      <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-sky-100 border border-sky-300 inline-block"/>Simply Cute</span>
                      <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-teal-100 border border-teal-300 inline-block"/>Bath &amp; Brush</span>
                      <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-pink-100 border border-pink-300 inline-block"/>Asian Fusion</span>
                      <span className="flex items-center gap-1"><span className="text-amber-500">⭐</span>First Visit</span>
                    </div>
                    <button onClick={fetchCalendar} className="text-sm text-sky-600 hover:text-sky-800 font-medium">↻ Refresh</button>
                  </div>
                </div>
                <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                  <div className="grid grid-cols-7 border-b border-gray-200">
                    {DAY_NAMES.map(d=><div key={d} className="text-center text-xs font-semibold text-gray-500 py-3 border-r border-gray-100 last:border-r-0">{d}</div>)}
                  </div>
                  <div className="grid grid-cols-7">
                    {Array.from({length:totalCells}).map((_,i)=>{
                      const dayNum=i-firstDay+1
                      const isValid=dayNum>=1&&dayNum<=daysInMonth
                      if(!isValid) return <div key={`e-${i}`} className="min-h-28 bg-gray-50 border-r border-b border-gray-100 last:border-r-0"/>
                      const dateStr=`${calendarMonth}-${String(dayNum).padStart(2,'0')}`
                      const dayAppts=byDate[dateStr]||[]
                      const dayBlockedCount=blockedTimes.filter(b=>b.date===dateStr).length
                      const isToday=dateStr===today
                      const isSelected=dateStr===selectedDay
                      return (
                        <div key={dayNum} onClick={()=>setSelectedDay(isSelected?null:dateStr)}
                          className={`min-h-16 md:min-h-28 p-1 md:p-2 border-r border-b border-gray-100 last:border-r-0 transition-colors cursor-pointer ${i%7===6?'border-r-0':''}
                            ${isSelected?'bg-sky-50 ring-2 ring-inset ring-sky-300':isToday?'bg-sky-50/50':'bg-white hover:bg-gray-50'}`}>
                          <div className={`text-sm font-bold w-7 h-7 flex items-center justify-center rounded-full mb-1
                            ${isToday?'bg-sky-600 text-white':isSelected?'bg-sky-500 text-white':'text-gray-700'}`}>
                            {dayNum}
                          </div>
                          {dayAppts.length>0 && (
                            <div className="flex items-center gap-1 mb-0.5">
                              <span className="text-xs text-sky-600 font-semibold">{dayAppts.length} appt{dayAppts.length!==1?'s':''}</span>
                              {dayAppts.some(a => a.is_new_client) && (
                                <span className="text-xs text-amber-500 font-bold leading-none" title="Has first-time client">⭐</span>
                              )}
                            </div>
                          )}
                          {dayBlockedCount>0 && (
                            <div className="text-xs text-rose-400 font-medium mb-0.5">🚫 {dayBlockedCount} blocked</div>
                          )}
                          {[...dayAppts].sort((a,b)=>a.appointment_time.localeCompare(b.appointment_time)).slice(0,2).map((a,idx)=>(
                            <div key={idx} className={`text-xs rounded px-1 py-0.5 mb-0.5 truncate font-medium flex items-center gap-0.5 ${
                              a.service==='simply_cute' ? 'bg-sky-100 text-sky-700' :
                              a.service==='bath_brush'  ? 'bg-teal-100 text-teal-700' :
                              a.service==='asian_fusion'? 'bg-pink-100 text-pink-700' :
                                                          'bg-gray-100 text-gray-600'}`}>
                              {a.is_new_client && <span className="text-amber-500 flex-shrink-0">⭐</span>}
                              {a.appointment_time.replace(':00','').replace(' AM','a').replace(' PM','p')} {a.service==='bath_brush'?'B&B':a.service==='asian_fusion'?'AF':a.service==='simply_cute'?'SC':(serviceMap[a.service]??a.service).slice(0,4)}
                            </div>
                          ))}
                        </div>
                      )
                    })}
                  </div>
                </div>

            {/* ── Day detail MODAL ─────────────────────────────────────────── */}
            {selectedDay && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                {/* Backdrop */}
                <div className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                  onClick={() => { setSelectedDay(null); setBlockingSlot(null); setBlockReason(''); setCalendarStaffFilter('all') }} />

                {/* Modal */}
                <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-xl flex flex-col overflow-hidden"
                  style={{maxHeight: 'min(80vh, 700px)'}}>

                  {/* Header */}
                  <div className="bg-sky-50 border-b border-gray-200 px-5 py-4 flex items-center justify-between flex-shrink-0">
                    <div>
                      <h3 className="font-bold text-sky-800 text-base">
                        {new Date(selectedDay+'T12:00:00').toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'})}
                      </h3>
                      <p className="text-xs text-sky-500 mt-0.5">
                        {(() => {
                          const all = byDate[selectedDay]||[]
                          const filtered = calendarStaffFilter === 'all'
                            ? all
                            : all.filter(a => a.assigned_groomer === calendarStaffFilter || a.assigned_bather === calendarStaffFilter)
                          return `${filtered.length} appointment${filtered.length!==1?'s':''}`
                        })()}
                        {blockedTimes.filter(b=>b.date===selectedDay).length > 0 &&
                          <span className="ml-2 text-rose-400">· {blockedTimes.filter(b=>b.date===selectedDay).length} blocked</span>}
                      </p>
                    </div>
                    <button onClick={() => { setSelectedDay(null); setBlockingSlot(null); setBlockReason(''); setCalendarStaffFilter('all') }}
                      className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-sky-100 text-gray-400 hover:text-gray-700 text-xl font-bold transition-colors">✕</button>
                  </div>

                  {/* Staff filter chips */}
                  {staff.filter(s => s.is_active && s.role !== 'admin').length > 0 && (
                    <div className="px-4 py-2.5 flex items-center gap-2 overflow-x-auto flex-shrink-0 border-b border-gray-100 bg-white">
                      <button
                        onClick={() => setCalendarStaffFilter('all')}
                        className={`shrink-0 text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${
                          calendarStaffFilter === 'all'
                            ? 'bg-sky-500 text-white'
                            : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                        }`}>
                        All
                      </button>
                      {staff.filter(s => s.is_active && s.role !== 'admin').map(s => (
                        <button
                          key={s.id}
                          onClick={() => setCalendarStaffFilter(calendarStaffFilter === s.name ? 'all' : s.name)}
                          className={`shrink-0 text-xs px-3 py-1.5 rounded-full font-medium transition-colors whitespace-nowrap ${
                            calendarStaffFilter === s.name
                              ? s.role === 'groomer' ? 'bg-sky-500 text-white' : 'bg-teal-500 text-white'
                              : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                          }`}>
                          {s.role === 'groomer' ? '✂️' : '🛁'} {s.name.split(' ')[0]}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Time slots timeline */}
                  <div className="divide-y divide-gray-50 overflow-y-auto flex-1">
                    {TIME_OPTIONS.filter(slot => {
                      const openIdx = TIME_OPTIONS.indexOf(openTime)
                      const closeIdx = TIME_OPTIONS.indexOf(closeTime)
                      const slotIdx = TIME_OPTIONS.indexOf(slot)
                      if (openIdx === -1 || closeIdx === -1) return true
                      return slotIdx >= openIdx && slotIdx <= closeIdx
                    }).map(slot => {
                      // Match exact slot OR any time that falls between this slot and the next
                      const slotIdx = TIME_OPTIONS.indexOf(slot)
                      const nextSlot = TIME_OPTIONS[slotIdx + 1]
                      const toMins = (t: string) => {
                        const m = t.match(/(\d+):(\d+)\s*(AM|PM)/i)
                        if (!m) return -1
                        let h = parseInt(m[1]); const min = parseInt(m[2]); const pm = m[3].toUpperCase() === 'PM'
                        if (pm && h !== 12) h += 12; if (!pm && h === 12) h = 0
                        return h * 60 + min
                      }
                      const apptsAll = (byDate[selectedDay]||[]).filter(a => {
                        if (a.appointment_time === slot) return true
                        if (!nextSlot) return false
                        const at = toMins(a.appointment_time), st = toMins(slot), nt = toMins(nextSlot)
                        return at > st && at < nt
                      })
                      const appts = calendarStaffFilter === 'all'
                        ? apptsAll
                        : apptsAll.filter(a => a.assigned_groomer === calendarStaffFilter || a.assigned_bather === calendarStaffFilter)
                      const blocked = blockedTimes.find(b => b.date === selectedDay && b.time === slot)
                      const isBlocking = blockingSlot?.date === selectedDay && blockingSlot?.time === slot

                      return (
                        <div key={slot} className={`flex items-stretch min-h-[56px] group transition-opacity ${
                          appts.length > 0 ? '' : blocked ? 'bg-rose-50/60' : 'hover:bg-gray-50/60'
                        }`}>
                          {/* Time label */}
                          <div className="w-20 flex-shrink-0 flex items-center justify-end pr-3 py-2">
                            <span className="text-xs font-semibold text-gray-400">{slot}</span>
                          </div>

                          {/* Slot content */}
                          <div className="flex-1 border-l border-gray-100 py-2 px-3 flex items-center gap-2">
                            {appts.length > 0 ? (
                              <>
                                {appts.map(appt => (
                                  <button key={appt.id} onClick={() => { openApptDetail(appt); setSelectedDay(null) }}
                                    className={`flex-1 flex items-center gap-3 rounded-xl px-3 py-2 text-left transition-all hover:shadow-sm group/pill ${
                                      appt.is_new_client
                                        ? 'bg-amber-50 border-2 border-amber-300 hover:bg-amber-100'
                                        : appt.service==='simply_cute' ? 'bg-sky-50 border border-sky-200 hover:bg-sky-100' :
                                          appt.service==='bath_brush'  ? 'bg-teal-50 border border-teal-200 hover:bg-teal-100' :
                                          appt.service==='asian_fusion'? 'bg-pink-50 border border-pink-200 hover:bg-pink-100' :
                                          'bg-gray-50 border border-gray-200 hover:bg-gray-100'}`}>
                                    {appt.pets?.photo_url
                                      ? <img src={appt.pets.photo_url} className="w-9 h-9 rounded-full object-cover flex-shrink-0" alt="" />
                                      : <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-base flex-shrink-0">🐶</div>}
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-1.5 flex-wrap">
                                        <p className="font-semibold text-gray-800 text-sm truncate">{appt.pets?.name} <span className="font-normal text-gray-400 text-xs">{appt.pets?.breed}</span></p>
                                        {appt.is_new_client && (
                                          <span className="text-xs px-1.5 py-0.5 rounded-full bg-amber-400 text-white font-bold flex-shrink-0">⭐ First Visit</span>
                                        )}
                                      </div>
                                      <p className="text-xs text-gray-500 truncate">{serviceMap[appt.service]??appt.service} · {appt.clients?.name}</p>
                                      <p className="text-xs text-gray-400 mt-0.5">
                                        <span>✂️ {firstName(appt.assigned_groomer) || <span className="text-gray-300">—</span>}</span>
                                        <span className="mx-1">·</span>
                                        <span>🛁 {firstName(appt.assigned_bather) || <span className="text-gray-300">—</span>}</span>
                                      </p>
                                    </div>
                                    <div className="flex items-center gap-2 flex-shrink-0">
                                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[appt.status]??'bg-gray-100 text-gray-500'}`}>{appt.status}</span>
                                      <span className="text-gray-300 group-hover/pill:text-sky-400 text-lg">›</span>
                                    </div>
                                  </button>
                                ))}
                                {/* Add another appointment at this same time slot */}
                                <button onClick={() => {
                                    const d = selectedDay, t = slot
                                    setSelectedDay(null)
                                    setBlockingSlot(null); setBlockReason('')
                                    setAddApptPhone(''); setAddApptClientName(''); setAddApptEmail('')
                                    setAddApptPetId(''); setAddApptPetName(''); setAddApptBreed(''); setAddApptWeight('')
                                    setAddApptVaccine('pending'); setAddApptClientData(null)
                                    setAddApptService(services[0]?.id ?? 'bath_brush')
                                    setAddingApptSlot({date:d, time:t})
                                  }}
                                  className="flex-shrink-0 text-xs bg-sky-100 hover:bg-sky-500 text-sky-600 hover:text-white w-7 h-7 rounded-lg font-bold flex items-center justify-center"
                                  title="Add another appointment at this time">
                                  +
                                </button>
                              </>
                            ) : blocked ? (
                              <div className="flex-1 flex items-center gap-3">
                                <div className="flex-1 flex items-center gap-2">
                                  <span className="text-xs font-semibold text-rose-400">🚫 Blocked</span>
                                  {blocked.reason && <span className="text-xs text-rose-300">— {blocked.reason}</span>}
                                </div>
                                <button onClick={() => unblockTimeSlot(selectedDay, slot)}
                                  className="text-xs text-gray-400 hover:text-rose-500 font-medium px-2 py-1 rounded-lg hover:bg-rose-50 transition-colors">
                                  ✕ Unblock
                                </button>
                              </div>
                            ) : isBlocking ? (
                              <div className="flex-1 flex items-center gap-2">
                                <input type="text" value={blockReason} onChange={e => setBlockReason(e.target.value)}
                                  placeholder="Reason (optional)"
                                  className="flex-1 text-xs border border-rose-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-rose-300"
                                  autoFocus
                                  onKeyDown={e => { if (e.key==='Enter') blockTimeSlot(selectedDay,slot,blockReason); if (e.key==='Escape') { setBlockingSlot(null); setBlockReason('') } }} />
                                <button onClick={() => blockTimeSlot(selectedDay,slot,blockReason)} disabled={savingBlock}
                                  className="text-xs bg-rose-500 hover:bg-rose-600 text-white px-2 py-1.5 rounded-lg font-medium disabled:opacity-50">
                                  {savingBlock ? '…' : 'Block'}
                                </button>
                                <button onClick={() => { setBlockingSlot(null); setBlockReason('') }}
                                  className="text-xs text-gray-400 hover:text-gray-600 px-1">Cancel</button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2">
                                <button onClick={() => {
                                  const d = selectedDay, t = slot
                                  setSelectedDay(null) // close day popup first so its backdrop doesn't block modal
                                  setBlockingSlot(null); setBlockReason('')
                                  setAddApptPhone(''); setAddApptClientName(''); setAddApptEmail('')
                                  setAddApptPetId(''); setAddApptPetName(''); setAddApptBreed(''); setAddApptWeight('')
                                  setAddApptVaccine('pending'); setAddApptClientData(null)
                                  setAddApptService(services[0]?.id ?? 'bath_brush')
                                  setAddingApptSlot({date:d, time:t})
                                }}
                                  className="text-xs bg-sky-500 hover:bg-sky-600 text-white px-2.5 py-1 rounded-lg font-medium transition-colors">
                                  + Appointment
                                </button>
                                <button onClick={() => { setBlockingSlot({date:selectedDay,time:slot}); setBlockReason('') }}
                                  className="text-xs text-gray-300 hover:text-rose-400 hover:bg-rose-50 px-2 py-1 rounded-lg transition-colors font-medium">
                                  Block
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            )}
              </div>
            )
          })()}

          {/* ── SETTINGS ─────────────────────────────────────────────────── */}
          {tab === 'settings' && (
            <div className="max-w-3xl space-y-5">
              {settingsLoading ? <p className="text-gray-400">Loading...</p> : (
                <>
                  {/* ── BUSINESS HOURS ───────────────────────────────── */}
                  <div className="bg-white rounded-2xl border border-gray-200 p-5">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="font-bold text-gray-800">Business Hours</h3>
                        <p className="text-xs text-gray-400 mt-0.5">Set which days and hours you accept appointments</p>
                      </div>
                      <button onClick={async () => {
                        try {
                          const responses = await Promise.all([
                            fetch('/api/admin/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: 'open_days', value: JSON.stringify(openDays) }) }),
                            fetch('/api/admin/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: 'open_time', value: openTime }) }),
                            fetch('/api/admin/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: 'close_time', value: closeTime }) }),
                            fetch('/api/admin/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: 'appointment_interval', value: String(appointmentInterval) }) }),
                          ])
                          for (let i = 0; i < responses.length; i++) {
                            if (!responses[i].ok) {
                              const error = await responses[i].json()
                              console.error(`Failed to save business hours setting ${i}:`, error)
                              alert(`Error saving business hours: ${error.error || 'Unknown error'}`)
                              return
                            }
                          }
                          console.log('✓ Business hours saved successfully')
                          setHoursSaved(true); setTimeout(() => setHoursSaved(false), 2000)
                        } catch (error) {
                          console.error('Failed to save business hours:', error)
                          alert(`Error saving business hours: ${error instanceof Error ? error.message : 'Unknown error'}`)
                        }
                      }} className={`text-sm font-semibold px-5 py-2 rounded-xl transition-colors ${hoursSaved ? 'bg-emerald-500 text-white' : 'bg-sky-700 hover:bg-sky-800 text-white'}`}>
                        {hoursSaved ? '✓ Saved!' : 'Save Hours'}
                      </button>
                    </div>
                    <div className="mb-4">
                      <p className="text-xs text-gray-500 font-medium mb-2">Open Days</p>
                      <div className="flex gap-2 flex-wrap">
                        {DAY_NAMES.map((day, idx) => (
                          <button key={idx} onClick={() => setOpenDays(prev => prev.includes(idx) ? prev.filter(d => d !== idx) : [...prev, idx].sort((a, b) => a - b))}
                            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${openDays.includes(idx) ? 'bg-sky-700 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                            {day}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3 mb-4">
                      <div>
                        <p className="text-xs text-gray-500 font-medium mb-1.5">Opening Time</p>
                        <select value={openTime} onChange={e => setOpenTime(e.target.value)}
                          className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300 bg-white">
                          {TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 font-medium mb-1.5">Closing Time</p>
                        <select value={closeTime} onChange={e => setCloseTime(e.target.value)}
                          className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300 bg-white">
                          {TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </div>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 font-medium mb-1.5">Appointment Interval</p>
                      <div className="flex gap-2">
                        {([15, 30] as const).map(val => (
                          <button key={val} onClick={() => setAppointmentInterval(val)}
                            className={`flex-1 py-2 rounded-xl text-sm font-semibold border transition-colors ${appointmentInterval === val ? 'bg-sky-700 text-white border-sky-700' : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-sky-300'}`}>
                            Every {val} min
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* ── SERVICES & PRICING (merged) ──────────────────── */}
                  <div className="bg-white rounded-2xl border border-gray-200 p-5">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <h3 className="font-bold text-gray-800">Services & Pricing</h3>
                        <p className="text-xs text-gray-400 mt-0.5">Name, duration, and price tiers per service</p>
                      </div>
                      <button onClick={saveServices}
                        className={`text-sm font-semibold px-5 py-2 rounded-xl transition-colors ${servicesSaved ? 'bg-emerald-500 text-white' : 'bg-sky-700 hover:bg-sky-800 text-white'}`}>
                        {servicesSaved ? '✓ Saved!' : 'Save Services'}
                      </button>
                    </div>

                    {/* Live preview: what booking page customers see */}
                    <div className="mb-4 bg-sky-50 border border-sky-100 rounded-xl px-4 py-2.5 flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-semibold text-sky-500 shrink-0">👤 Customers see:</span>
                      {services.filter(s => s.visible !== false).length === 0
                        ? <span className="text-xs text-red-500 font-medium">⚠️ No services visible!</span>
                        : services.filter(s => s.visible !== false).map(s => (
                          <span key={s.id} className="text-xs bg-white border border-sky-200 text-sky-700 font-medium px-2 py-0.5 rounded-full">{s.name}</span>
                        ))
                      }
                    </div>
                    {(() => {
                      const ServiceCard = ({ svc, idx }: { svc: ServiceDef; idx: number }) => (
                        <div className="border border-gray-200 rounded-2xl overflow-hidden">
                          {/* Service header row */}
                          <div className="bg-gray-50 px-4 py-3 flex items-center gap-3">
                            <input type="text" value={svc.name}
                              onChange={e => setServices(prev => prev.map((s, i) => i === idx ? { ...s, name: e.target.value } : s))}
                              placeholder="Service name"
                              className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-sky-300 bg-white" />
                            {/* Move between catalogs */}
                            <button
                              onClick={() => setServices(prev => prev.map((s, i) => i === idx ? { ...s, category: s.category === 'addon' ? 'main' : 'addon' } : s))}
                              title="Move to the other catalog"
                              className="shrink-0 text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:border-gray-300 hover:bg-gray-100 transition-colors">
                              {svc.category === 'addon' ? '↑ Make main' : '↓ Make add-on'}
                            </button>
                            {/* Visibility toggle — auto-saves immediately to services JSON + hidden_service_ids list */}
                            <button
                              onClick={async () => {
                                const newVisible = svc.visible !== false ? false : true
                                const updated = services.map((s, i) => i === idx ? { ...s, visible: newVisible } : s)
                                setServices(updated)
                                try {
                                  // Save 1: update the services array with visible flag
                                  const r1 = await fetch('/api/admin/settings', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ key: 'services', value: JSON.stringify(updated) }),
                                  })
                                  const d1 = await r1.json()
                                  if (d1.error) throw new Error(d1.error)
                                  // Save 2: also write a standalone hidden_service_ids list (belt-and-suspenders)
                                  const hiddenIds = updated.filter(s => s.visible === false).map(s => s.id)
                                  const r2 = await fetch('/api/admin/settings', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ key: 'hidden_service_ids', value: JSON.stringify(hiddenIds) }),
                                  })
                                  const d2 = await r2.json()
                                  if (d2.error) throw new Error(d2.error)
                                  showToast(newVisible ? '👁 Now visible to customers' : '🔒 Hidden from booking page')
                                } catch {
                                  showToast('⚠️ Save failed — try again')
                                  // Revert state on failure
                                  setServices(services)
                                }
                              }}
                              title={svc.visible === false ? 'Admin only — customers cannot see this' : 'Visible to customers'}
                              className={`shrink-0 flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg border transition-colors ${
                                svc.visible === false
                                  ? 'bg-gray-100 border-gray-200 text-gray-400 hover:border-gray-300'
                                  : 'bg-sky-50 border-sky-200 text-sky-600 hover:bg-sky-100'
                              }`}>
                              {svc.visible === false ? '🔒 Admin only' : '👁 Customer'}
                            </button>
                            <button onClick={() => setServices(prev => prev.filter((_, i) => i !== idx))}
                              className="text-gray-300 hover:text-rose-500 text-2xl leading-none flex-shrink-0">×</button>
                          </div>
                          {/* Description */}
                          <div className="px-4 py-2.5 border-b border-gray-100">
                            <input type="text" value={svc.desc}
                              onChange={e => setServices(prev => prev.map((s, i) => i === idx ? { ...s, desc: e.target.value } : s))}
                              placeholder="Description shown on booking form…"
                              className="w-full text-sm text-gray-600 placeholder-gray-300 focus:outline-none" />
                          </div>
                          {/* Price tiers — each row has size label, price, and duration */}
                          <div className="px-4 py-3 space-y-2">
                            <div className="grid grid-cols-3 gap-2 mb-1">
                              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide col-span-1">Size</p>
                              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide text-center">Price</p>
                              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide text-center">Duration</p>
                            </div>
                            {(svc.tiers || []).map((tier, ti) => (
                              <div key={ti} className="grid grid-cols-3 gap-2 items-center">
                                <input type="text" value={tier.label}
                                  onChange={e => setServices(prev => prev.map((s, i) => i === idx ? { ...s, tiers: (s.tiers||[]).map((t, j) => j === ti ? { ...t, label: e.target.value } : t) } : s))}
                                  placeholder="e.g. Small (under 15 lbs)"
                                  className="border border-gray-100 rounded-lg px-3 py-1.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-sky-200" />
                                <div className="flex items-center gap-1 border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white">
                                  <span className="text-gray-400 text-xs">$</span>
                                  <input type="number" min="0" step="1" value={tier.price}
                                    onChange={e => setServices(prev => prev.map((s, i) => i === idx ? { ...s, tiers: (s.tiers||[]).map((t, j) => j === ti ? { ...t, price: e.target.value } : t) } : s))}
                                    placeholder="0"
                                    className="flex-1 text-sm text-right focus:outline-none bg-transparent text-gray-800 font-semibold min-w-0" />
                                </div>
                                <div className="flex items-center gap-1">
                                  <div className="flex-1 flex items-center gap-1 border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white">
                                    <span className="text-gray-300 text-xs">⏱</span>
                                    <input type="text" value={tier.duration || ''}
                                      onChange={e => setServices(prev => prev.map((s, i) => i === idx ? { ...s, tiers: (s.tiers||[]).map((t, j) => j === ti ? { ...t, duration: e.target.value } : t) } : s))}
                                      placeholder="1 hr"
                                      className="flex-1 text-sm focus:outline-none bg-transparent text-gray-700 min-w-0" />
                                  </div>
                                  <button onClick={() => setServices(prev => prev.map((s, i) => i === idx ? { ...s, tiers: (s.tiers||[]).filter((_, j) => j !== ti) } : s))}
                                    className="text-gray-300 hover:text-rose-400 text-xl leading-none px-1">×</button>
                                </div>
                              </div>
                            ))}
                            <button onClick={() => setServices(prev => prev.map((s, i) => i === idx ? { ...s, tiers: [...(s.tiers||[]), { label: '', price: '', duration: '' }] } : s))}
                              className="text-xs text-sky-500 hover:text-sky-700 font-medium mt-1">
                              + Add size tier
                            </button>
                          </div>
                        </div>
                      )
                      return (
                        <>
                          {/* Main Services catalog */}
                          <div className="mb-6">
                            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Main Services</p>
                            <div className="space-y-4">
                              {services.map((svc, idx) => inferServiceCategory(svc) === 'main'
                                ? <ServiceCard key={svc.id} svc={svc} idx={idx} /> : null)}
                            </div>
                            <button onClick={() => setServices(prev => [...prev, { id: `service_${Date.now()}`, name: '', desc: '', price: '', tiers: DEFAULT_TIERS.map(t => ({...t})), category: 'main' }])}
                              className="w-full mt-4 border-2 border-dashed border-sky-200 hover:border-sky-400 text-sky-500 hover:text-sky-600 font-semibold py-2.5 rounded-xl text-sm transition-colors">
                              + Add Main Service
                            </button>
                          </div>

                          {/* Add-on Services catalog */}
                          <div>
                            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Add-on Services</p>
                            <div className="space-y-4">
                              {services.map((svc, idx) => inferServiceCategory(svc) === 'addon'
                                ? <ServiceCard key={svc.id} svc={svc} idx={idx} /> : null)}
                            </div>
                            <button onClick={() => setServices(prev => [...prev, { id: `service_${Date.now()}`, name: '', desc: '', price: '', tiers: [{ label: 'Standard', price: '', duration: '' }], category: 'addon' }])}
                              className="w-full mt-4 border-2 border-dashed border-gray-200 hover:border-gray-400 text-gray-500 hover:text-gray-600 font-semibold py-2.5 rounded-xl text-sm transition-colors">
                              + Add Add-on Service
                            </button>
                          </div>
                        </>
                      )
                    })()}
                  </div>

                  {/* ── STAFF ───────────────────────────────────── */}
                  <div className="bg-white rounded-2xl border border-gray-200 p-5">
                    <h3 className="font-bold text-gray-800 mb-1">Staff</h3>
                    <p className="text-xs text-gray-400 mb-4">Manage your groomers and staff</p>
                    <div className="flex gap-2 mb-4">
                      <input type="text" placeholder="Staff name" value={newStaffName}
                        onChange={e => setNewStaffName(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && addStaff()}
                        className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300" />
                      <select value={newStaffRole} onChange={e => setNewStaffRole(e.target.value)}
                        className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300">
                        <option value="groomer">Groomer</option>
                        <option value="bather">Bather</option>
                        <option value="receptionist">Receptionist</option>
                        <option value="manager">Manager</option>
                      </select>
                      <button onClick={addStaff} disabled={!newStaffName.trim()}
                        className="bg-sky-700 hover:bg-sky-800 disabled:opacity-40 text-white font-semibold px-4 rounded-xl text-sm transition-colors">
                        Add
                      </button>
                    </div>
                    {staff.length === 0
                      ? <p className="text-sm text-gray-400 text-center py-3">No staff added yet</p>
                      : <div className="space-y-2">
                          {staff.map(member => (
                            <div key={member.id} className={`flex items-center justify-between p-3 rounded-xl border ${member.is_active ? 'border-gray-100 bg-gray-50' : 'border-gray-100 bg-white opacity-50'}`}>
                              <div>
                                <p className="font-medium text-gray-800 text-sm">{member.name}</p>
                                <p className="text-xs text-gray-400 capitalize">{member.role}</p>
                              </div>
                              <button onClick={() => toggleStaff(member.id, !member.is_active)}
                                className={`text-xs font-medium px-3 py-1.5 rounded-full transition-colors ${
                                  member.is_active ? 'bg-red-50 text-red-600 hover:bg-red-100' : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'
                                }`}>
                                {member.is_active ? 'Deactivate' : 'Reactivate'}
                              </button>
                            </div>
                          ))}
                        </div>
                    }
                  </div>

                  <div className="bg-white rounded-2xl border border-gray-200 p-5">
                    <h3 className="font-bold text-gray-800 mb-3">Days Off / Blocked Dates</h3>
                    <div className="flex gap-3 mb-4">
                      <input type="date" value={newBlockDate} onChange={e=>setNewBlockDate(e.target.value)}
                        className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300" />
                      <input type="text" placeholder="Reason (optional)" value={newBlockReason} onChange={e=>setNewBlockReason(e.target.value)}
                        className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300" />
                      <button onClick={async()=>{
                        if(!newBlockDate)return
                        await fetch('/api/admin/blocked-dates',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({date:newBlockDate,reason:newBlockReason||null})})
                        setNewBlockDate(''); setNewBlockReason(''); fetchSettings()
                      }} disabled={!newBlockDate}
                        className="bg-rose-500 hover:bg-rose-600 disabled:opacity-40 text-white font-semibold px-4 py-2 rounded-xl text-sm">
                        Block Date
                      </button>
                    </div>
                    {blockedDates.length===0
                      ? <p className="text-sm text-gray-400">No blocked dates</p>
                      : <div className="space-y-2">
                          {blockedDates.map(bd=>(
                            <div key={bd.date} className="flex items-center justify-between bg-rose-50 border border-rose-100 rounded-xl px-4 py-2.5">
                              <div>
                                <p className="font-medium text-gray-800 text-sm">{new Date(bd.date+'T12:00:00').toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric',year:'numeric'})}</p>
                                {bd.reason && <p className="text-xs text-gray-500">{bd.reason}</p>}
                              </div>
                              <button onClick={async()=>{
                                await fetch('/api/admin/blocked-dates',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({date:bd.date})})
                                fetchSettings()
                              }} className="text-xs text-rose-500 hover:text-rose-700 font-medium">Remove</button>
                            </div>
                          ))}
                        </div>
                    }
                  </div>

                  {/* ── TAGS ───────────────────────────────────────── */}
                  <div className="bg-white rounded-2xl border border-gray-200 p-5">
                    <div className="mb-4">
                      <h3 className="font-bold text-gray-800">🏷️ Tags</h3>
                      <p className="text-xs text-gray-400 mt-0.5">Create color-coded tags to categorize pets (e.g. Aggressive, Senior, Matted). Tags help you filter and research your clients.</p>
                    </div>

                    {/* Create tag form */}
                    <div className="bg-sky-50 border border-sky-100 rounded-xl p-3 mb-4 space-y-2">
                      <p className="text-xs font-semibold text-sky-700">New tag</p>
                      <input
                        placeholder="Tag name (e.g. Aggressive, Senior)"
                        value={newTagName}
                        onChange={e => setNewTagName(e.target.value)}
                        className="w-full border border-sky-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sky-300"
                      />
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Color</p>
                        <div className="flex flex-wrap gap-1.5">
                          {['sky','rose','amber','violet','emerald','teal','pink','gray','indigo','orange'].map(c => {
                            const swatch: Record<string,string> = {
                              sky:'bg-sky-500', rose:'bg-rose-500', amber:'bg-amber-500', violet:'bg-violet-500',
                              emerald:'bg-emerald-500', teal:'bg-teal-500', pink:'bg-pink-500', gray:'bg-gray-500',
                              indigo:'bg-indigo-500', orange:'bg-orange-500',
                            }
                            return (
                              <button
                                key={c}
                                type="button"
                                onClick={() => setNewTagColor(c)}
                                className={`w-7 h-7 rounded-full ${swatch[c]} ${newTagColor === c ? 'ring-2 ring-offset-2 ring-sky-600' : ''}`}
                                title={c}
                              />
                            )
                          })}
                        </div>
                      </div>
                      <button
                        disabled={savingTag || !newTagName.trim()}
                        onClick={async () => {
                          setSavingTag(true)
                          try {
                            const res = await fetch('/api/admin/tags', {
                              method: 'POST', headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ name: newTagName.trim(), color: newTagColor }),
                            })
                            const data = await res.json()
                            if (data.tag) {
                              setTags(prev => [...prev, data.tag].sort((a,b) => a.name.localeCompare(b.name)))
                              setNewTagName(''); setNewTagColor('sky')
                            } else if (data.error) { alert(data.error) }
                          } finally { setSavingTag(false) }
                        }}
                        className="w-full bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white text-sm font-semibold py-2 rounded-lg">
                        {savingTag ? 'Adding…' : '+ Add Tag'}
                      </button>
                    </div>

                    {/* Existing tags list */}
                    {tags.length === 0
                      ? <p className="text-sm text-gray-400">No tags yet. Add one above.</p>
                      : <div className="flex flex-wrap gap-2">
                          {tags.map(tag => {
                            const tagStyle: Record<string,string> = {
                              sky:'bg-sky-100 text-sky-700 border-sky-200',
                              rose:'bg-rose-100 text-rose-700 border-rose-200',
                              amber:'bg-amber-100 text-amber-700 border-amber-200',
                              violet:'bg-violet-100 text-violet-700 border-violet-200',
                              emerald:'bg-emerald-100 text-emerald-700 border-emerald-200',
                              teal:'bg-teal-100 text-teal-700 border-teal-200',
                              pink:'bg-pink-100 text-pink-700 border-pink-200',
                              gray:'bg-gray-100 text-gray-700 border-gray-200',
                              indigo:'bg-indigo-100 text-indigo-700 border-indigo-200',
                              orange:'bg-orange-100 text-orange-700 border-orange-200',
                            }
                            return (
                              <div key={tag.id} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-sm font-medium ${tagStyle[tag.color] || tagStyle.sky}`}>
                                <span>{tag.name}</span>
                                <button
                                  onClick={async () => {
                                    if (!confirm(`Delete tag "${tag.name}"? It will be removed from all pets.`)) return
                                    await fetch('/api/admin/tags', {
                                      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({ id: tag.id }),
                                    })
                                    setTags(prev => prev.filter(t => t.id !== tag.id))
                                  }}
                                  className="hover:bg-black/10 rounded-full w-4 h-4 flex items-center justify-center text-xs">✕</button>
                              </div>
                            )
                          })}
                        </div>}
                  </div>
                </>
              )}
            </div>
          )}

        </div>
      </div>

      {/* ── Deleted Clients (snapshot log kept whenever a client is removed) ── */}
      {showDeletedClients && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setShowDeletedClients(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
              <h3 className="font-bold text-gray-800">🗑️ Deleted Clients</h3>
              <button onClick={() => setShowDeletedClients(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 text-lg">×</button>
            </div>
            <div className="px-5 pt-3 flex-shrink-0">
              <input
                type="text" placeholder="Search by name or phone…"
                value={deletedClientsSearch}
                onChange={e => setDeletedClientsSearch(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300 mb-3"
              />
            </div>
            <div className="overflow-y-auto flex-1 px-5 pb-5 space-y-2">
              {loadingDeletedClients ? (
                <p className="text-sm text-gray-400 text-center py-8">Loading…</p>
              ) : (() => {
                const q = deletedClientsSearch.trim().toLowerCase()
                const qDigits = deletedClientsSearch.replace(/\D/g, '')
                const filtered = deletedClientsData.filter(r => {
                  if (!q) return true
                  const name = (r.client?.name || '').toLowerCase()
                  const phoneDigits = (r.phone || '').replace(/\D/g, '')
                  return name.includes(q) || (qDigits && phoneDigits.includes(qDigits))
                })
                if (filtered.length === 0) return <p className="text-sm text-gray-400 text-center py-8">No deleted clients found</p>
                return filtered.map(r => {
                  const isExpanded = expandedDeletedId === r.id
                  const pets = r.pets || []
                  const appts = r.appointments || []
                  return (
                    <div key={r.id} className="border border-gray-200 rounded-xl overflow-hidden">
                      <button
                        onClick={() => setExpandedDeletedId(isExpanded ? null : r.id)}
                        className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-gray-50 text-left">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-gray-800 truncate">{r.client?.name || r.phone}</p>
                          <p className="text-xs text-gray-400">{r.phone} · {pets.length} pet{pets.length === 1 ? '' : 's'} · {appts.length} appt{appts.length === 1 ? '' : 's'}</p>
                        </div>
                        <span className="text-xs text-gray-400 flex-shrink-0 whitespace-nowrap">
                          Deleted {new Date(r.deleted_at).toLocaleDateString()} {isExpanded ? '▲' : '▼'}
                        </span>
                      </button>
                      {isExpanded && (
                        <div className="border-t border-gray-100 px-4 py-3 bg-gray-50 space-y-3 text-sm">
                          <div>
                            <p className="text-xs font-bold uppercase text-gray-400 mb-1">Client Info</p>
                            <p className="text-gray-700">Name: {r.client?.name || '—'}</p>
                            <p className="text-gray-700">Phone: {r.phone}</p>
                            {r.client?.email && <p className="text-gray-700">Email: {r.client.email}</p>}
                            {r.client?.address && <p className="text-gray-700">Address: {r.client.address}</p>}
                          </div>
                          {pets.length > 0 && (
                            <div>
                              <p className="text-xs font-bold uppercase text-gray-400 mb-1">Pets</p>
                              {pets.map(p => (
                                <p key={p.id} className="text-gray-700">🐾 {p.name}{p.breed ? ` (${p.breed})` : ''}{p.weight ? ` · ${p.weight}` : ''}</p>
                              ))}
                            </div>
                          )}
                          {appts.length > 0 && (
                            <div>
                              <p className="text-xs font-bold uppercase text-gray-400 mb-1">Appointments ({appts.length})</p>
                              {appts.slice(0, 10).map(a => (
                                <p key={a.id} className="text-gray-700">{a.appointment_date} · {a.service}{a.payment_amount ? ` · $${a.payment_amount}` : ''}</p>
                              ))}
                              {appts.length > 10 && <p className="text-gray-400 text-xs">+ {appts.length - 10} more</p>}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
